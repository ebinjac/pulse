package store

import (
	"sort"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func productionRun(run domain.MonitorRun) bool {
	triggeredBy := run.TriggeredBy
	return triggeredBy != "draft" && triggeredBy != "test"
}

func uptimeFromRuns(runs []domain.MonitorRun, since time.Time) domain.UptimeWindow {
	var total int64
	var successful int64
	for _, run := range runs {
		if !productionRun(run) || run.StartedAt.Before(since) {
			continue
		}
		total++
		if run.Status == domain.StatusSuccess {
			successful++
		}
	}
	return domain.UptimeWindow{
		UptimePct:      domain.UptimeFromCounts(successful, total),
		TotalRuns:      total,
		SuccessfulRuns: successful,
	}
}

func latencyFromRuns(runs []domain.MonitorRun, since time.Time) domain.LatencyPercentiles {
	durations := make([]int, 0, len(runs))
	for _, run := range runs {
		if !productionRun(run) || run.StartedAt.Before(since) {
			continue
		}
		if run.DurationMS > 0 {
			durations = append(durations, run.DurationMS)
		}
	}
	return latencyPercentiles(durations)
}

func latencyFromStepRuns(runs []domain.MonitorRun, since time.Time) domain.LatencyPercentiles {
	durations := make([]int, 0)
	for _, run := range runs {
		if !productionRun(run) || run.StartedAt.Before(since) {
			continue
		}
		for _, step := range run.Steps {
			if step.LatencyMS > 0 {
				durations = append(durations, step.LatencyMS)
			}
		}
	}
	return latencyPercentiles(durations)
}

func latencyPercentiles(durations []int) domain.LatencyPercentiles {
	if len(durations) == 0 {
		return domain.LatencyPercentiles{}
	}
	sort.Ints(durations)
	sum := 0
	for _, value := range durations {
		sum += value
	}
	return domain.LatencyPercentiles{
		P50MS: percentileInt(durations, 0.50),
		P95MS: percentileInt(durations, 0.95),
		P99MS: percentileInt(durations, 0.99),
		AvgMS: sum / len(durations),
	}
}

func percentileInt(sorted []int, p float64) int {
	if len(sorted) == 0 {
		return 0
	}
	index := int(float64(len(sorted)-1) * p)
	if index < 0 {
		index = 0
	}
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}

func (s *MemoryStore) GetSLOSummary() domain.SLOSummary {
	s.mu.RLock()
	defer s.mu.RUnlock()

	now := time.Now().UTC()
	since7d := now.Add(-7 * 24 * time.Hour)
	since30d := now.Add(-30 * 24 * time.Hour)

	allRuns := make([]domain.MonitorRun, 0, len(s.runs))
	for _, run := range s.runs {
		allRuns = append(allRuns, run)
	}

	monitors := make([]domain.MonitorSLO, 0, len(s.monitors))
	for id := range s.monitors {
		monitorRuns := filterRunsByMonitor(allRuns, id)
		monitors = append(monitors, domain.MonitorSLO{
			MonitorID:      id,
			Uptime7d:       uptimeFromRuns(monitorRuns, since7d),
			Uptime30d:      uptimeFromRuns(monitorRuns, since30d),
			RunLatency7d:   latencyFromRuns(monitorRuns, since7d),
			RunLatency30d:  latencyFromRuns(monitorRuns, since30d),
			StepLatency7d:  latencyFromStepRuns(monitorRuns, since7d),
			StepLatency30d: latencyFromStepRuns(monitorRuns, since30d),
		})
	}

	applications := make([]domain.ApplicationSLO, 0, len(s.applications))
	for appID := range s.applications {
		appRuns := filterRunsByApplication(allRuns, s.monitors, appID)
		applications = append(applications, domain.ApplicationSLO{
			ApplicationID: appID,
			Uptime7d:      uptimeFromRuns(appRuns, since7d),
			Uptime30d:     uptimeFromRuns(appRuns, since30d),
			RunLatency7d:  latencyFromRuns(appRuns, since7d),
			RunLatency30d: latencyFromRuns(appRuns, since30d),
		})
	}

	global30d := uptimeFromRuns(allRuns, since30d)
	summary := domain.SLOSummary{
		TargetUptimePct:  domain.DefaultSLOTargetUptimePct,
		Global:           uptimeFromRuns(allRuns, since30d),
		GlobalLatency30d: latencyFromRuns(allRuns, since30d),
		ErrorBudget:      domain.ErrorBudgetFromUptime(domain.DefaultSLOTargetUptimePct, global30d.UptimePct),
		Monitors:         monitors,
		Applications:     applications,
	}
	_ = since7d
	return summary
}

func filterRunsByMonitor(runs []domain.MonitorRun, monitorID string) []domain.MonitorRun {
	filtered := make([]domain.MonitorRun, 0)
	for _, run := range runs {
		if run.MonitorID == monitorID {
			filtered = append(filtered, run)
		}
	}
	return filtered
}

func filterRunsByApplication(runs []domain.MonitorRun, monitors map[string]domain.Monitor, applicationID string) []domain.MonitorRun {
	filtered := make([]domain.MonitorRun, 0)
	for _, run := range runs {
		monitor, ok := monitors[run.MonitorID]
		if ok && monitor.ApplicationID == applicationID {
			filtered = append(filtered, run)
		}
	}
	return filtered
}
