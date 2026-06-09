import { isSuccessStatus } from "@/components/pulse/console-shared"
import type {
  DeploymentValidation,
  DeploymentValidationReport,
  ElfQueryRunResult,
  MonitorRun,
  MonitorValidationComparison,
} from "@/lib/pulse-types"

export type PhaseStatus = "pending" | "running" | "done" | "skipped" | "insufficient" | "ready"

export type PhaseRow = {
  id: string
  label: string
  status: PhaseStatus
  progressCurrent: number
  progressTotal: number
  startedAt?: string
  completedAt?: string
  detail: string
}

export type MonitorSampleSummary = {
  monitorId: string
  monitorName: string
  baselineCount: number
  postCount: number
  baselineSuccessPct: number
  postSuccessPct: number
  latencyDeltaMs: number
  latencyDeltaPct: number
  result: string
  reason?: string
  comparison?: MonitorValidationComparison
}

export type LogCheckRow = {
  id: string
  name: string
  gateMode?: string
  signalType?: string
  status: "pending" | "running" | "done"
  ranAt?: string
  durationMs?: number
  baselineValue?: number
  postValue?: number
  hitCount?: number
  result?: string
  reason?: string
  elfResult?: ElfQueryRunResult
}

export function expectedBaselinePerMonitor(validation: DeploymentValidation): number {
  return validation.baselineRunCount || 30
}

export function expectedPostRuns(validation: DeploymentValidation): number {
  const perMonitor = validation.sampleCount || 30
  const monitors = validation.monitorIds.length || 1
  return Math.max(1, monitors * perMonitor)
}

export function expectedBaselineRuns(validation: DeploymentValidation): number {
  return expectedBaselinePerMonitor(validation) * Math.max(1, validation.monitorIds.length)
}

export function postRunsComplete(validation: DeploymentValidation, postRuns: MonitorRun[]): boolean {
  if (validation.postCompletedAt) return true
  return postRuns.length >= expectedPostRuns(validation)
}

export function shouldRunLogs(validation: DeploymentValidation): boolean {
  return (validation.elfQueryIds?.length ?? 0) > 0
}

export function logsConfigured(validation: DeploymentValidation): boolean {
  return shouldRunLogs(validation)
}

export function groupRunsByMonitor(runs: MonitorRun[]): Record<string, MonitorRun[]> {
  const grouped: Record<string, MonitorRun[]> = {}
  for (const run of runs) {
    const bucket = grouped[run.monitorId] ?? []
    bucket.push(run)
    grouped[run.monitorId] = bucket
  }
  for (const monitorId of Object.keys(grouped)) {
    grouped[monitorId]!.sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    )
  }
  return grouped
}

export function successRatePercent(runs: MonitorRun[]): number {
  if (runs.length === 0) return 0
  const successes = runs.filter((run) => isSuccessStatus(run.status)).length
  return Math.round((successes / runs.length) * 100)
}

export function avgDurationMs(runs: MonitorRun[]): number {
  if (runs.length === 0) return 0
  return Math.round(runs.reduce((sum, run) => sum + run.durationMs, 0) / runs.length)
}

export function maxDurationMs(runs: MonitorRun[]): number {
  if (runs.length === 0) return 0
  return runs.reduce((max, run) => Math.max(max, run.durationMs), 0)
}

export function percentileDurationMs(runs: MonitorRun[], percentile: number): number {
  if (runs.length === 0) return 0
  const values = runs.map((run) => run.durationMs).sort((a, b) => a - b)
  const index = Math.ceil(percentile * values.length) - 1
  return values[Math.min(Math.max(index, 0), values.length - 1)] ?? 0
}

export function failureCount(runs: MonitorRun[]): number {
  return runs.filter((run) => !isSuccessStatus(run.status)).length
}

export function buildMonitorSummaries(
  validation: DeploymentValidation,
  preRuns: MonitorRun[],
  postRuns: MonitorRun[],
  report?: DeploymentValidationReport,
): MonitorSampleSummary[] {
  const preByMonitor = groupRunsByMonitor(preRuns)
  const postByMonitor = groupRunsByMonitor(postRuns)
  const comparisonMap = new Map(
    (report?.monitorComparisons || []).map((c) => [c.monitorId, c]),
  )

  const monitorIds = validation.monitorIds.length
    ? validation.monitorIds
    : [...new Set([...Object.keys(preByMonitor), ...Object.keys(postByMonitor)])]

  return monitorIds.map((monitorId) => {
    const pre = preByMonitor[monitorId] || []
    const post = postByMonitor[monitorId] || []
    const comparison = comparisonMap.get(monitorId)
    const monitorName =
      comparison?.monitorName || pre[0]?.monitorName || post[0]?.monitorName || monitorId

    return {
      monitorId,
      monitorName,
      baselineCount: pre.length,
      postCount: post.length,
      baselineSuccessPct: successRatePercent(pre),
      postSuccessPct: successRatePercent(post),
      latencyDeltaMs: comparison?.durationDeltaMs ?? avgDurationMs(post) - avgDurationMs(pre),
      latencyDeltaPct: comparison?.durationDeltaPct ?? 0,
      result: comparison?.result || "incomplete",
      reason: comparison?.reason,
      comparison,
    }
  })
}

export function buildPhaseRows(
  validation: DeploymentValidation,
  preRuns: MonitorRun[],
  postRuns: MonitorRun[],
): PhaseRow[] {
  const expectedBaseline = expectedBaselineRuns(validation)
  const expectedPost = expectedPostRuns(validation)
  const elfResults = validation.elfResults || []
  const elfQueryCount = validation.elfQueryIds?.length ?? 0
  const logsExpected = logsConfigured(validation)
    ? Math.max(elfQueryCount, elfResults.length)
    : 0

  let baselineStatus: PhaseStatus = "ready"
  if (preRuns.length === 0) baselineStatus = "insufficient"
  else if (preRuns.length < expectedBaseline) baselineStatus = "ready"

  let postStatus: PhaseStatus = "pending"
  if (validation.status === "post_running") postStatus = "running"
  else if (postRunsComplete(validation, postRuns)) postStatus = "done"
  else if (postRuns.length > 0) postStatus = "running"

  let logStatus: PhaseStatus = "pending"
  if (!logsConfigured(validation)) logStatus = "skipped"
  else if (validation.status === "log_running") logStatus = "running"
  else if (validation.logCompletedAt || elfResults.length > 0) logStatus = "done"

  const reportStatus = validation.report?.status || "incomplete"
  let reportPhaseStatus: PhaseStatus = "pending"
  if (reportStatus !== "incomplete") reportPhaseStatus = "done"
  else if (postStatus === "done" && (logStatus === "done" || logStatus === "skipped")) {
    reportPhaseStatus = "ready"
  }

  return [
    {
      id: "baseline",
      label: "Baseline (before deploy)",
      status: baselineStatus,
      progressCurrent: preRuns.length,
      progressTotal: expectedBaseline,
      detail: `Historical runs from ${validation.baselineWindowHours || 24}h before deployment`,
    },
    {
      id: "post",
      label: "Post-deploy samples",
      status: postStatus,
      progressCurrent: postRuns.length,
      progressTotal: expectedPost,
      startedAt: validation.postStartedAt,
      completedAt: validation.postCompletedAt,
      detail:
        postStatus === "pending"
          ? "Fresh monitor checks after release"
          : `${validation.intervalSeconds || 30}s interval between samples`,
    },
    {
      id: "logs",
      label: "Log checks",
      status: logStatus,
      progressCurrent: elfResults.length,
      progressTotal: logsExpected,
      startedAt: validation.logStartedAt,
      completedAt: validation.logCompletedAt,
      detail: logsConfigured(validation)
        ? `${elfQueryCount} ELF quer${elfQueryCount === 1 ? "y" : "ies"}`
        : "No log checks configured",
    },
    {
      id: "report",
      label: "Report",
      status: reportPhaseStatus,
      progressCurrent: reportStatus !== "incomplete" ? 1 : 0,
      progressTotal: 1,
      completedAt: validation.report?.generatedAt,
      detail:
        validation.report?.incompleteReason ||
        (reportStatus !== "incomplete" ? `Verdict: ${reportStatus}` : "Generated after sampling completes"),
    },
  ]
}

export function buildLogCheckRows(validation: DeploymentValidation): LogCheckRow[] {
  const resultsByQuery = new Map((validation.elfResults || []).map((r) => [r.queryId, r]))
  const rows: LogCheckRow[] = []

  for (const queryId of validation.elfQueryIds || []) {
    const result = resultsByQuery.get(queryId)
    if (result) {
      rows.push({
        id: queryId,
        name: result.queryName || queryId,
        gateMode: result.gateMode,
        signalType: result.signalType,
        status: "done",
        ranAt: result.ranAt,
        durationMs: result.durationMs,
        baselineValue: result.baselineValue,
        postValue: result.postValue,
        hitCount: result.hitCount,
        result: result.result,
        reason: result.reason,
        elfResult: result,
      })
      resultsByQuery.delete(queryId)
    } else {
      rows.push({
        id: queryId,
        name: queryId,
        status: validation.status === "log_running" ? "running" : "pending",
      })
    }
  }

  for (const result of resultsByQuery.values()) {
    rows.push({
      id: result.queryId,
      name: result.queryName || result.signalType || result.queryId,
      gateMode: result.gateMode,
      signalType: result.signalType,
      status: "done",
      ranAt: result.ranAt,
      durationMs: result.durationMs,
      baselineValue: result.baselineValue,
      postValue: result.postValue,
      hitCount: result.hitCount,
      result: result.result,
      reason: result.reason,
      elfResult: result,
    })
  }

  return rows
}

export type DetailTab = "overview" | "monitors" | "logs" | "report"

export function defaultTabForValidation(
  validation: DeploymentValidation,
  postRuns: MonitorRun[],
): DetailTab {
  if (validation.status === "report_ready" || validation.report?.status === "pass") return "report"
  if (validation.status === "post_running") return "monitors"
  if (validation.status === "log_running") return "logs"
  if (postRunsComplete(validation, postRuns) && validation.report?.status !== "incomplete") return "report"
  return "overview"
}

export function estimatePollTimeoutMs(validation: DeploymentValidation): number {
  const monitors = Math.max(1, validation.monitorIds.length)
  const samples = validation.sampleCount || 30
  const interval = validation.intervalSeconds || 30
  const base = monitors * samples * interval * 1000
  return Math.max(120_000, Math.min(base * 2, 3_600_000))
}
