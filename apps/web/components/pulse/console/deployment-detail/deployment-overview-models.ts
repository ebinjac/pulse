import type {
  DeploymentValidation,
  DeploymentValidationReport,
  DeploymentValidationSummary,
  MonitorRun,
} from "@/lib/pulse-types"
import type { DetailTab, PhaseRow } from "./deployment-detail-utils"
import {
  avgDurationMs,
  failureCount,
  logsConfigured,
  maxDurationMs,
  percentileDurationMs,
} from "./deployment-detail-utils"

export type ComparisonRow = {
  label: string
  baseline: string
  postDeploy: string
  numericBaseline?: number
  numericPost?: number
  worseWhenHigher?: boolean
}

function formatMs(value: number) {
  return `${value}ms`
}

function formatPercent(value: number) {
  return `${value}%`
}

function formatFailures(value: number) {
  return value === 1 ? "1 failure" : `${value} failures`
}

export function buildComparisonRows(
  summary: DeploymentValidationSummary,
  preRuns: MonitorRun[] = [],
  postRuns: MonitorRun[] = [],
): ComparisonRow[] {
  const preP95 = summary.preP95LatencyMs
  const postP95 = summary.postP95LatencyMs
  const preP99 = summary.preP99LatencyMs ?? percentileDurationMs(preRuns, 0.99)
  const postP99 = summary.postP99LatencyMs ?? percentileDurationMs(postRuns, 0.99)
  const preMean = summary.preMeanLatencyMs ?? avgDurationMs(preRuns)
  const postMean = summary.postMeanLatencyMs ?? avgDurationMs(postRuns)
  const preMax = summary.preMaxLatencyMs ?? maxDurationMs(preRuns)
  const postMax = summary.postMaxLatencyMs ?? maxDurationMs(postRuns)
  const preFailures = summary.preFailureCount ?? failureCount(preRuns)
  const postFailures = summary.postFailureCount ?? failureCount(postRuns)

  return [
    {
      label: "Success rate",
      baseline: formatPercent(summary.preSuccessRate),
      postDeploy: formatPercent(summary.postSuccessRate),
      numericBaseline: summary.preSuccessRate,
      numericPost: summary.postSuccessRate,
      worseWhenHigher: false,
    },
    {
      label: "Failed runs",
      baseline: formatFailures(preFailures),
      postDeploy: formatFailures(postFailures),
      numericBaseline: preFailures,
      numericPost: postFailures,
      worseWhenHigher: true,
    },
    {
      label: "New monitor failures",
      baseline: "—",
      postDeploy: String(summary.newFailures),
      numericPost: summary.newFailures,
      worseWhenHigher: true,
    },
    {
      label: "P95 latency",
      baseline: formatMs(preP95),
      postDeploy: formatMs(postP95),
      numericBaseline: preP95,
      numericPost: postP95,
      worseWhenHigher: true,
    },
    {
      label: "P99 latency",
      baseline: formatMs(preP99),
      postDeploy: formatMs(postP99),
      numericBaseline: preP99,
      numericPost: postP99,
      worseWhenHigher: true,
    },
    {
      label: "Mean latency",
      baseline: formatMs(preMean),
      postDeploy: formatMs(postMean),
      numericBaseline: preMean,
      numericPost: postMean,
      worseWhenHigher: true,
    },
    {
      label: "Max latency",
      baseline: formatMs(preMax),
      postDeploy: formatMs(postMax),
      numericBaseline: preMax,
      numericPost: postMax,
      worseWhenHigher: true,
    },
  ]
}

export function countFailedLogChecks(
  validation: DeploymentValidation,
  report?: DeploymentValidationReport,
): number {
  const fromReport = report?.elfComparisons?.filter((c) => c.result === "fail").length
  if (fromReport != null && fromReport > 0) return fromReport
  return (validation.elfResults || []).filter((r) => r.result === "fail").length
}

export function logChecksSummaryLabel(
  validation: DeploymentValidation,
  report?: DeploymentValidationReport,
): { value: string; tone: "default" | "success" | "warning" | "danger" } {
  if (!logsConfigured(validation)) {
    return { value: "None", tone: "default" }
  }
  const total = validation.elfQueryIds?.length ?? validation.elfResults?.length ?? 0
  const failed = countFailedLogChecks(validation, report)
  if (validation.status === "log_running") {
    return { value: "Running", tone: "default" }
  }
  if (failed > 0) {
    return { value: `${failed} failed`, tone: "danger" }
  }
  if (total > 0 && (validation.logCompletedAt || (validation.elfResults?.length ?? 0) >= total)) {
    return { value: "Passed", tone: "success" }
  }
  return { value: "Pending", tone: "default" }
}

export function buildFailureSummaryLines(
  validation: DeploymentValidation,
  report?: DeploymentValidationReport,
  summary?: DeploymentValidationSummary,
): string[] {
  const lines: string[] = []
  const verdict = (report?.status || "incomplete").toLowerCase()
  const failedLogs = countFailedLogChecks(validation, report)
  const newFailures = summary?.newFailures ?? 0
  const blockingFails = report?.elfSummary?.blockingFails ?? failedLogs

  if (verdict === "pass") {
    lines.push("All configured gates passed.")
    if (newFailures === 0) {
      lines.push("No success-rate degradation was detected.")
    }
    return lines
  }

  if (verdict === "incomplete") {
    lines.push("The deployment check is still in progress or missing samples.")
    return lines
  }

  if (blockingFails > 0 || failedLogs > 0) {
    const count = blockingFails > 0 ? blockingFails : failedLogs
    lines.push(
      `Failed because ${count} ELF log quer${count === 1 ? "y" : "ies"} matched the failure condition.`,
    )
  } else if (newFailures > 0) {
    lines.push(
      `Failed because ${newFailures} monitor${newFailures === 1 ? "" : "s"} regressed after deploy.`,
    )
  } else if (report?.regressions?.length) {
    lines.push(report.regressions[0]!)
  } else {
    lines.push("The deployment report flagged warnings or failures.")
  }

  if (newFailures === 0) {
    lines.push("No success-rate degradation was detected.")
  } else {
    lines.push(
      `Success rate moved from ${summary?.preSuccessRate ?? 0}% to ${summary?.postSuccessRate ?? 0}%.`,
    )
  }

  return lines
}

export function phaseDisplayLabel(phase: PhaseRow): string {
  switch (phase.id) {
    case "baseline":
      return "Baseline"
    case "post":
      return "Post-deploy"
    case "logs":
      return "Log checks"
    case "report":
      return "Report"
    default:
      return phase.label
  }
}

export function phaseStatusLabel(
  phase: PhaseRow,
  validation: DeploymentValidation,
  report?: DeploymentValidationReport,
): string {
  if (phase.id === "logs" && phase.status === "done") {
    if (countFailedLogChecks(validation, report) > 0) return "Failed"
    return "Completed"
  }
  if (phase.id === "report") {
    if (phase.status === "done") return "Ready"
    if (phase.status === "ready") return "Ready"
    if (phase.status === "running") return "Running"
    return "Pending"
  }
  switch (phase.status) {
    case "done":
      return "Completed"
    case "running":
      return "Running"
    case "skipped":
      return "Skipped"
    case "insufficient":
      return "Insufficient"
    case "ready":
      return phase.id === "baseline" ? "Completed" : "Ready"
    default:
      return "Pending"
  }
}

export function phaseProgressLabel(phase: PhaseRow): string {
  if (phase.id === "report") {
    if (phase.status === "done") return "Generated"
    if (phase.status === "ready") return "Ready"
    return "Pending"
  }
  if (phase.progressTotal > 0) {
    return `${phase.progressCurrent}/${phase.progressTotal}`
  }
  return "—"
}

export function tabLabel(
  tab: DetailTab,
  validation: DeploymentValidation,
  report: DeploymentValidationReport | undefined,
  phases: PhaseRow[],
): string {
  const base =
    tab === "overview"
      ? "Overview"
      : tab === "monitors"
        ? "Monitor Samples"
        : tab === "logs"
          ? "Log Checks"
          : "Report"

  if (tab === "monitors" && validation.status === "post_running") {
    return `${base} Running`
  }
  if (tab === "logs") {
    const failed = countFailedLogChecks(validation, report)
    if (failed > 0) return `${base} Failed`
    if (validation.status === "log_running") return `${base} Running`
    const logPhase = phases.find((p) => p.id === "logs")
    if (logPhase?.status === "done" && logsConfigured(validation)) return `${base} Passed`
  }
  if (tab === "report") {
    const reportPhase = phases.find((p) => p.id === "report")
    if (report?.status && report.status !== "incomplete") return `${base} Ready`
    if (reportPhase?.status === "ready") return `${base} Ready`
  }
  return base
}

export function verdictLabel(status?: string): string {
  const normalized = (status || "incomplete").toLowerCase()
  if (normalized === "pass") return "Passed"
  if (normalized === "fail") return "Failed"
  if (normalized === "warning") return "Warning"
  if (normalized === "incomplete") return "Incomplete"
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function verdictTone(status?: string): "success" | "warning" | "danger" | "default" {
  const normalized = (status || "incomplete").toLowerCase()
  if (normalized === "pass") return "success"
  if (normalized === "warning") return "warning"
  if (normalized === "fail") return "danger"
  return "default"
}
