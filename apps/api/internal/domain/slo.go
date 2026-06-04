package domain

const DefaultSLOTargetUptimePct = 99.9

type UptimeWindow struct {
	UptimePct      float64 `json:"uptimePct"`
	TotalRuns      int64   `json:"totalRuns"`
	SuccessfulRuns int64   `json:"successfulRuns"`
}

type LatencyPercentiles struct {
	P50MS int `json:"p50Ms"`
	P95MS int `json:"p95Ms"`
	P99MS int `json:"p99Ms"`
	AvgMS int `json:"avgMs"`
}

type MonitorSLO struct {
	MonitorID     string             `json:"monitorId"`
	Uptime7d      UptimeWindow       `json:"uptime7d"`
	Uptime30d     UptimeWindow       `json:"uptime30d"`
	RunLatency7d  LatencyPercentiles `json:"runLatency7d"`
	RunLatency30d LatencyPercentiles `json:"runLatency30d"`
	StepLatency7d LatencyPercentiles `json:"stepLatency7d"`
	StepLatency30d LatencyPercentiles `json:"stepLatency30d"`
}

type ApplicationSLO struct {
	ApplicationID string             `json:"applicationId"`
	Uptime7d      UptimeWindow       `json:"uptime7d"`
	Uptime30d     UptimeWindow       `json:"uptime30d"`
	RunLatency7d  LatencyPercentiles `json:"runLatency7d"`
	RunLatency30d LatencyPercentiles `json:"runLatency30d"`
}

type ErrorBudgetSummary struct {
	TargetUptimePct         float64 `json:"targetUptimePct"`
	ActualUptime30dPct      float64 `json:"actualUptime30dPct"`
	ErrorBudgetRemainingPct float64 `json:"errorBudgetRemainingPct"`
	AllowedDowntimeMinutes  float64 `json:"allowedDowntimeMinutes30d"`
	ConsumedDowntimeMinutes float64 `json:"consumedDowntimeMinutes30d"`
}

type SLOSummary struct {
	TargetUptimePct float64            `json:"targetUptimePct"`
	Global          UptimeWindow       `json:"global"`
	GlobalLatency30d LatencyPercentiles `json:"globalLatency30d"`
	ErrorBudget     ErrorBudgetSummary `json:"errorBudget"`
	Monitors        []MonitorSLO       `json:"monitors"`
	Applications    []ApplicationSLO   `json:"applications"`
}

func UptimeFromCounts(successful, total int64) float64 {
	if total <= 0 {
		return 100
	}
	return float64(successful) / float64(total) * 100
}

func ErrorBudgetFromUptime(targetPct, actualPct float64) ErrorBudgetSummary {
	const windowMinutes = 30 * 24 * 60
	allowed := windowMinutes * (1 - targetPct/100)
	consumed := windowMinutes * (1 - actualPct/100)
	if consumed < 0 {
		consumed = 0
	}
	remaining := allowed - consumed
	if remaining < 0 {
		remaining = 0
	}
	remainingPct := 100.0
	if allowed > 0 {
		remainingPct = remaining / allowed * 100
	}
	return ErrorBudgetSummary{
		TargetUptimePct:         targetPct,
		ActualUptime30dPct:      actualPct,
		ErrorBudgetRemainingPct: remainingPct,
		AllowedDowntimeMinutes:  allowed,
		ConsumedDowntimeMinutes: consumed,
	}
}
