package store

import (
	"context"
	"time"

	pulsedb "github.com/ensemble-pulse/pulse/apps/api/internal/db"
	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5/pgtype"
)

func (s *PostgresStore) GetSLOSummary() domain.SLOSummary {
	ctx := context.Background()
	now := time.Now().UTC()
	since7d := pgTimestamp(now.Add(-7 * 24 * time.Hour))
	since30d := pgTimestamp(now.Add(-30 * 24 * time.Hour))

	globalStats, _ := s.queries.GetGlobalRunUptimeStats(ctx, since30d)
	globalLatency, _ := s.queries.GetGlobalRunLatencyPercentiles(ctx, since30d)
	globalUptime := domain.UptimeWindow{
		UptimePct:      domain.UptimeFromCounts(globalStats.SuccessfulRuns, globalStats.TotalRuns),
		TotalRuns:      globalStats.TotalRuns,
		SuccessfulRuns: globalStats.SuccessfulRuns,
	}

	monitors := s.ListMonitors()
	monitorSLOs := make([]domain.MonitorSLO, 0, len(monitors))
	for _, monitor := range monitors {
		monitorSLOs = append(monitorSLOs, s.monitorSLO(ctx, monitor.ID, since7d, since30d))
	}

	applications := s.ListApplications()
	applicationSLOs := make([]domain.ApplicationSLO, 0, len(applications))
	for _, application := range applications {
		applicationSLOs = append(applicationSLOs, s.applicationSLO(ctx, application.ID, since7d, since30d))
	}

	return domain.SLOSummary{
		TargetUptimePct:  domain.DefaultSLOTargetUptimePct,
		Global:           globalUptime,
		GlobalLatency30d: latencyFromInts(globalLatency.P50Ms, globalLatency.P95Ms, globalLatency.P99Ms, globalLatency.AvgMs),
		ErrorBudget:      domain.ErrorBudgetFromUptime(domain.DefaultSLOTargetUptimePct, globalUptime.UptimePct),
		Monitors:         monitorSLOs,
		Applications:     applicationSLOs,
	}
}

func (s *PostgresStore) monitorSLO(ctx context.Context, monitorID string, since7d, since30d pgtype.Timestamp) domain.MonitorSLO {
	monitorRef := pgText(monitorID)
	uptime7, _ := s.queries.GetMonitorRunUptimeStats(ctx, pulsedb.GetMonitorRunUptimeStatsParams{
		MonitorID: monitorRef,
		StartedAt: since7d,
	})
	uptime30, _ := s.queries.GetMonitorRunUptimeStats(ctx, pulsedb.GetMonitorRunUptimeStatsParams{
		MonitorID: monitorRef,
		StartedAt: since30d,
	})
	runLatency7, _ := s.queries.GetMonitorRunLatencyPercentiles(ctx, pulsedb.GetMonitorRunLatencyPercentilesParams{
		MonitorID: monitorRef,
		StartedAt: since7d,
	})
	runLatency30, _ := s.queries.GetMonitorRunLatencyPercentiles(ctx, pulsedb.GetMonitorRunLatencyPercentilesParams{
		MonitorID: monitorRef,
		StartedAt: since30d,
	})
	stepLatency7, _ := s.queries.GetMonitorStepLatencyPercentiles(ctx, pulsedb.GetMonitorStepLatencyPercentilesParams{
		MonitorID: monitorRef,
		StartedAt: since7d,
	})
	stepLatency30, _ := s.queries.GetMonitorStepLatencyPercentiles(ctx, pulsedb.GetMonitorStepLatencyPercentilesParams{
		MonitorID: monitorRef,
		StartedAt: since30d,
	})

	return domain.MonitorSLO{
		MonitorID: monitorID,
		Uptime7d: domain.UptimeWindow{
			UptimePct:      domain.UptimeFromCounts(uptime7.SuccessfulRuns, uptime7.TotalRuns),
			TotalRuns:      uptime7.TotalRuns,
			SuccessfulRuns: uptime7.SuccessfulRuns,
		},
		Uptime30d: domain.UptimeWindow{
			UptimePct:      domain.UptimeFromCounts(uptime30.SuccessfulRuns, uptime30.TotalRuns),
			TotalRuns:      uptime30.TotalRuns,
			SuccessfulRuns: uptime30.SuccessfulRuns,
		},
		RunLatency7d:   latencyFromInts(runLatency7.P50Ms, runLatency7.P95Ms, runLatency7.P99Ms, runLatency7.AvgMs),
		RunLatency30d:  latencyFromInts(runLatency30.P50Ms, runLatency30.P95Ms, runLatency30.P99Ms, runLatency30.AvgMs),
		StepLatency7d:  latencyFromInts(stepLatency7.P50Ms, stepLatency7.P95Ms, stepLatency7.P99Ms, stepLatency7.AvgMs),
		StepLatency30d: latencyFromInts(stepLatency30.P50Ms, stepLatency30.P95Ms, stepLatency30.P99Ms, stepLatency30.AvgMs),
	}
}

func (s *PostgresStore) applicationSLO(ctx context.Context, applicationID string, since7d, since30d pgtype.Timestamp) domain.ApplicationSLO {
	appRef := pgText(applicationID)
	uptime7, _ := s.queries.GetApplicationRunUptimeStats(ctx, pulsedb.GetApplicationRunUptimeStatsParams{
		ApplicationID: appRef,
		StartedAt:     since7d,
	})
	uptime30, _ := s.queries.GetApplicationRunUptimeStats(ctx, pulsedb.GetApplicationRunUptimeStatsParams{
		ApplicationID: appRef,
		StartedAt:     since30d,
	})
	runLatency7, _ := s.queries.GetApplicationRunLatencyPercentiles(ctx, pulsedb.GetApplicationRunLatencyPercentilesParams{
		ApplicationID: appRef,
		StartedAt:     since7d,
	})
	runLatency30, _ := s.queries.GetApplicationRunLatencyPercentiles(ctx, pulsedb.GetApplicationRunLatencyPercentilesParams{
		ApplicationID: appRef,
		StartedAt:     since30d,
	})

	return domain.ApplicationSLO{
		ApplicationID: applicationID,
		Uptime7d: domain.UptimeWindow{
			UptimePct:      domain.UptimeFromCounts(uptime7.SuccessfulRuns, uptime7.TotalRuns),
			TotalRuns:      uptime7.TotalRuns,
			SuccessfulRuns: uptime7.SuccessfulRuns,
		},
		Uptime30d: domain.UptimeWindow{
			UptimePct:      domain.UptimeFromCounts(uptime30.SuccessfulRuns, uptime30.TotalRuns),
			TotalRuns:      uptime30.TotalRuns,
			SuccessfulRuns: uptime30.SuccessfulRuns,
		},
		RunLatency7d:  latencyFromInts(runLatency7.P50Ms, runLatency7.P95Ms, runLatency7.P99Ms, runLatency7.AvgMs),
		RunLatency30d: latencyFromInts(runLatency30.P50Ms, runLatency30.P95Ms, runLatency30.P99Ms, runLatency30.AvgMs),
	}
}

func latencyFromInts(p50, p95, p99, avg int32) domain.LatencyPercentiles {
	return domain.LatencyPercentiles{
		P50MS: int(p50),
		P95MS: int(p95),
		P99MS: int(p99),
		AvgMS: int(avg),
	}
}
