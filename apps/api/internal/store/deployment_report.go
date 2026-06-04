package store

import (
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func BuildDeploymentValidationReport(validation domain.DeploymentValidation, preRuns, postRuns []domain.MonitorRun) domain.DeploymentValidationReport {
	report := domain.DeploymentValidationReport{
		Status:      "incomplete",
		GeneratedAt: time.Now().UTC(),
	}
	if len(preRuns) == 0 {
		report.IncompleteReason = "No historical baseline runs were found for the selected deployment window."
		return report
	}
	if len(postRuns) == 0 {
		report.IncompleteReason = "Run post-deploy samples before generating a comparison report."
		return report
	}

	preByMonitor := runsByMonitor(preRuns)
	postByMonitor := runsByMonitor(postRuns)
	monitorIDs := validation.MonitorIDs
	if len(monitorIDs) == 0 {
		seen := map[string]bool{}
		for _, run := range preRuns {
			if !seen[run.MonitorID] {
				monitorIDs = append(monitorIDs, run.MonitorID)
				seen[run.MonitorID] = true
			}
		}
	}

	report.Summary.TotalMonitors = len(monitorIDs)
	report.Summary.PreSuccessRate = successRate(preRuns)
	report.Summary.PostSuccessRate = successRate(postRuns)
	report.Summary.SuccessRateDelta = round1(report.Summary.PostSuccessRate - report.Summary.PreSuccessRate)
	report.Summary.PreP95LatencyMS = percentileDuration(preRuns, 0.95)
	report.Summary.PostP95LatencyMS = percentileDuration(postRuns, 0.95)
	report.Summary.P95LatencyDeltaMS = report.Summary.PostP95LatencyMS - report.Summary.PreP95LatencyMS
	report.Summary.P95LatencyDeltaPct = percentDelta(report.Summary.PreP95LatencyMS, report.Summary.PostP95LatencyMS)

	for _, monitorID := range monitorIDs {
		preSamples := preByMonitor[monitorID]
		postSamples := postByMonitor[monitorID]
		pre, hasPre := latestRun(preSamples)
		post, hasPost := latestRun(postSamples)
		comparison := domain.MonitorValidationComparison{
			MonitorID: monitorID,
			Result:    "incomplete",
		}
		if hasPre {
			comparison.MonitorName = pre.MonitorName
			comparison.PreRunID = pre.ID
			comparison.PreStatus = pre.Status
			comparison.PreDurationMS = pre.DurationMS
		}
		if hasPost {
			if comparison.MonitorName == "" {
				comparison.MonitorName = post.MonitorName
			}
			comparison.PostRunID = post.ID
			comparison.PostStatus = post.Status
			comparison.PostDurationMS = post.DurationMS
		}
		if hasPre && hasPost {
			report.Summary.ComparedMonitors++
			preP95 := percentileDuration(preSamples, 0.95)
			postP95 := percentileDuration(postSamples, 0.95)
			comparison.PreDurationMS = preP95
			comparison.PostDurationMS = postP95
			comparison.DurationDeltaMS = postP95 - preP95
			comparison.DurationDeltaPct = percentDelta(preP95, postP95)
			comparison.SlowestTimingPhase, comparison.SlowestTimingDeltaMS = largestTimingDeltaForSamples(preSamples, postSamples)
			comparison.Result = "pass"
			preSuccess := allRunsSuccessful(preSamples)
			postSuccess := allRunsSuccessful(postSamples)
			if preSuccess && !postSuccess {
				comparison.Result = "fail"
				comparison.Reason = "New post-deploy failure"
				report.Summary.NewFailures++
				report.Regressions = append(report.Regressions, post.MonitorName+" failed after deployment.")
			} else if !preSuccess && postSuccess {
				comparison.Result = "pass"
				comparison.Reason = "Recovered after deployment"
				report.Summary.ResolvedFailures++
			} else if comparison.DurationDeltaPct > 25 && comparison.DurationDeltaMS >= 100 {
				comparison.Result = "warning"
				comparison.Reason = "Latency increased beyond warning threshold"
				report.Regressions = append(report.Regressions, post.MonitorName+" latency increased by "+formatDeltaPct(comparison.DurationDeltaPct)+".")
			} else if comparison.SlowestTimingDeltaMS > 0 && timingDeltaPct(pre, post, comparison.SlowestTimingPhase) > 50 {
				comparison.Result = "warning"
				comparison.Reason = "Network timing phase increased beyond warning threshold"
				report.Regressions = append(report.Regressions, post.MonitorName+" "+comparison.SlowestTimingPhase+" timing increased.")
			}
		}
		report.MonitorComparisons = append(report.MonitorComparisons, comparison)
	}

	report.Status = "pass"
	if report.Summary.PostSuccessRate < 100 || report.Summary.NewFailures > 0 {
		report.Status = "fail"
	} else if report.Summary.P95LatencyDeltaPct > 25 && report.Summary.P95LatencyDeltaMS >= 100 {
		report.Status = "warning"
	}
	for _, comparison := range report.MonitorComparisons {
		if comparison.Result == "warning" && report.Status == "pass" {
			report.Status = "warning"
		}
	}
	if len(report.Regressions) == 0 {
		report.Regressions = []string{}
	}
	return report
}

func latestRunsByMonitor(runs []domain.MonitorRun) map[string]domain.MonitorRun {
	result := map[string]domain.MonitorRun{}
	for _, run := range runs {
		existing, ok := result[run.MonitorID]
		if !ok || run.StartedAt.After(existing.StartedAt) {
			result[run.MonitorID] = run
		}
	}
	return result
}

func runsByMonitor(runs []domain.MonitorRun) map[string][]domain.MonitorRun {
	result := map[string][]domain.MonitorRun{}
	for _, run := range runs {
		result[run.MonitorID] = append(result[run.MonitorID], run)
	}
	return result
}

func latestRun(runs []domain.MonitorRun) (domain.MonitorRun, bool) {
	if len(runs) == 0 {
		return domain.MonitorRun{}, false
	}
	latest := runs[0]
	for _, run := range runs[1:] {
		if run.StartedAt.After(latest.StartedAt) {
			latest = run
		}
	}
	return latest, true
}

func allRunsSuccessful(runs []domain.MonitorRun) bool {
	if len(runs) == 0 {
		return false
	}
	for _, run := range runs {
		if run.Status != domain.StatusSuccess {
			return false
		}
	}
	return true
}

func successRate(runs []domain.MonitorRun) float64 {
	if len(runs) == 0 {
		return 0
	}
	success := 0
	for _, run := range runs {
		if run.Status == domain.StatusSuccess {
			success++
		}
	}
	return round1((float64(success) / float64(len(runs))) * 100)
}

func percentileDuration(runs []domain.MonitorRun, percentile float64) int {
	if len(runs) == 0 {
		return 0
	}
	values := make([]int, 0, len(runs))
	for _, run := range runs {
		values = append(values, run.DurationMS)
	}
	sort.Ints(values)
	index := int(math.Ceil(percentile*float64(len(values)))) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(values) {
		index = len(values) - 1
	}
	return values[index]
}

func percentDelta(before, after int) float64 {
	if before <= 0 {
		if after <= 0 {
			return 0
		}
		return 100
	}
	return round1(((float64(after) - float64(before)) / float64(before)) * 100)
}

func largestTimingDelta(pre, post domain.MonitorRun) (string, int) {
	preTiming := aggregateTiming(pre)
	postTiming := aggregateTiming(post)
	labels := map[string][2]int{
		"dns":      {preTiming.DNSLookupMS, postTiming.DNSLookupMS},
		"tcp":      {preTiming.TCPConnectMS, postTiming.TCPConnectMS},
		"tls":      {preTiming.TLSHandshakeMS, postTiming.TLSHandshakeMS},
		"waiting":  {preTiming.TimeToFirstByteMS, postTiming.TimeToFirstByteMS},
		"download": {preTiming.DownloadMS, postTiming.DownloadMS},
	}
	phase := ""
	delta := 0
	for label, values := range labels {
		if values[1]-values[0] > delta {
			phase = label
			delta = values[1] - values[0]
		}
	}
	return phase, delta
}

func largestTimingDeltaForSamples(preRuns, postRuns []domain.MonitorRun) (string, int) {
	return largestTimingDelta(domain.MonitorRun{Steps: aggregateStepRuns(preRuns)}, domain.MonitorRun{Steps: aggregateStepRuns(postRuns)})
}

func aggregateStepRuns(runs []domain.MonitorRun) []domain.StepRun {
	if len(runs) == 0 {
		return nil
	}
	var timing domain.HTTPTiming
	for _, run := range runs {
		runTiming := aggregateTiming(run)
		timing.DNSLookupMS += runTiming.DNSLookupMS
		timing.TCPConnectMS += runTiming.TCPConnectMS
		timing.TLSHandshakeMS += runTiming.TLSHandshakeMS
		timing.TimeToFirstByteMS += runTiming.TimeToFirstByteMS
		timing.DownloadMS += runTiming.DownloadMS
		timing.TotalMS += runTiming.TotalMS
	}
	count := len(runs)
	timing.DNSLookupMS /= count
	timing.TCPConnectMS /= count
	timing.TLSHandshakeMS /= count
	timing.TimeToFirstByteMS /= count
	timing.DownloadMS /= count
	timing.TotalMS /= count
	return []domain.StepRun{{Timing: timing}}
}

func timingDeltaPct(pre, post domain.MonitorRun, phase string) float64 {
	preTiming := aggregateTiming(pre)
	postTiming := aggregateTiming(post)
	switch phase {
	case "dns":
		return percentDelta(preTiming.DNSLookupMS, postTiming.DNSLookupMS)
	case "tcp":
		return percentDelta(preTiming.TCPConnectMS, postTiming.TCPConnectMS)
	case "tls":
		return percentDelta(preTiming.TLSHandshakeMS, postTiming.TLSHandshakeMS)
	case "waiting":
		return percentDelta(preTiming.TimeToFirstByteMS, postTiming.TimeToFirstByteMS)
	case "download":
		return percentDelta(preTiming.DownloadMS, postTiming.DownloadMS)
	default:
		return 0
	}
}

func aggregateTiming(run domain.MonitorRun) domain.HTTPTiming {
	var timing domain.HTTPTiming
	for _, step := range run.Steps {
		timing.DNSLookupMS += step.Timing.DNSLookupMS
		timing.TCPConnectMS += step.Timing.TCPConnectMS
		timing.TLSHandshakeMS += step.Timing.TLSHandshakeMS
		timing.TimeToFirstByteMS += step.Timing.TimeToFirstByteMS
		timing.DownloadMS += step.Timing.DownloadMS
		timing.TotalMS += step.Timing.TotalMS
	}
	return timing
}

func round1(value float64) float64 {
	return math.Round(value*10) / 10
}

func formatDeltaPct(value float64) string {
	return strconvFormatFloat(value) + "%"
}

func strconvFormatFloat(value float64) string {
	return strings.TrimRight(strings.TrimRight(strconv.FormatFloat(value, 'f', 1, 64), "0"), ".")
}
