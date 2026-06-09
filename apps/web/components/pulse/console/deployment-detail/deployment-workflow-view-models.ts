import type { DeploymentValidation, MonitorRun } from "@/lib/pulse-types"
import { expectedPostRuns, logsConfigured, postRunsComplete } from "./deployment-detail-utils"

export type DeploymentNextAction =
  | "edit"
  | "run_full"
  | "wait_sampling"
  | "run_logs"
  | "wait_logs"
  | "view_report"
  | "inspect_regressions"

export type DeploymentProgressSummary = {
  stage: "draft" | "sampling" | "log_checks" | "report_ready" | "incomplete"
  label: string
  detail: string
  progressPct: number
  postCurrent: number
  postTotal: number
}

export type DeploymentAttentionItem = {
  id: string
  title: string
  detail: string
  tone: "warning" | "danger" | "primary"
}

export function estimatedRuntimeLabel(sampleCount: number, intervalSeconds: number) {
  const seconds = Math.max(0, sampleCount * intervalSeconds)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `~${minutes} min`
  const hours = Math.round((minutes / 60) * 10) / 10
  return `~${hours}h`
}

export function deploymentProgressSummary(validation: DeploymentValidation, postRuns: MonitorRun[] = []): DeploymentProgressSummary {
  const postTotal = expectedPostRuns(validation)
  const postCurrent = Math.min(postRuns.length, postTotal)
  const postPct = postTotal > 0 ? Math.round((postCurrent / postTotal) * 100) : 0

  if (validation.status === "draft") {
    return { stage: "draft", label: "Draft", detail: "Configuration ready to run", progressPct: 0, postCurrent, postTotal }
  }
  if (validation.status === "post_running") {
    return { stage: "sampling", label: "Sampling", detail: `${postCurrent}/${postTotal} post samples collected`, progressPct: postPct, postCurrent, postTotal }
  }
  if (validation.status === "log_running") {
    return { stage: "log_checks", label: "Log checks", detail: `${validation.elfResults?.length || 0}/${validation.elfQueryIds?.length || 0} ELF gates complete`, progressPct: logsConfigured(validation) ? 85 : postPct, postCurrent, postTotal }
  }
  if (validation.status === "report_ready") {
    return { stage: "report_ready", label: "Report ready", detail: `Verdict: ${validation.report?.status || "incomplete"}`, progressPct: 100, postCurrent, postTotal }
  }
  return { stage: "incomplete", label: "Incomplete", detail: "Needs more samples or report generation", progressPct: postPct, postCurrent, postTotal }
}

export function deploymentNextAction(validation: DeploymentValidation, postRuns: MonitorRun[] = []): { type: DeploymentNextAction; title: string; detail: string; cta: string; tab?: "overview" | "monitors" | "logs" | "report" } {
  const reportStatus = validation.report?.status || "incomplete"
  if (validation.status === "draft") {
    return { type: "run_full", title: "Start the deployment check", detail: "Run post-deploy synthetic samples and then evaluate configured log checks.", cta: "Start deployment check", tab: "overview" }
  }
  if (validation.status === "post_running") {
    return { type: "wait_sampling", title: "Post-deploy sampling is running", detail: "Pulse is collecting fresh monitor samples for comparison.", cta: "View samples", tab: "monitors" }
  }
  if (validation.status === "log_running") {
    return { type: "wait_logs", title: "Log checks are running", detail: "Pulse is evaluating ELF/OpenSearch gates for post-deploy signals.", cta: "View log checks", tab: "logs" }
  }
  if (postRunsComplete(validation, postRuns) && logsConfigured(validation) && !validation.logCompletedAt && (validation.elfResults?.length || 0) === 0) {
    return { type: "run_logs", title: "Run log checks", detail: "Synthetic sampling is complete. Evaluate ELF gates to finish the deployment signal.", cta: "Run log checks", tab: "logs" }
  }
  if (reportStatus === "fail" || reportStatus === "warning") {
    return { type: "inspect_regressions", title: "Inspect deployment risk", detail: "The report found warnings or failures that should be reviewed before sign-off.", cta: "Inspect report", tab: "report" }
  }
  if (validation.report && validation.report.status !== "incomplete") {
    return { type: "view_report", title: "Review deployment report", detail: "The deterministic comparison is ready for release review.", cta: "View report", tab: "report" }
  }
  return { type: "run_full", title: "Continue deployment check", detail: "Run the remaining validation steps to generate a report.", cta: "Run deployment check", tab: "overview" }
}

export function deploymentAttentionItems(validations: DeploymentValidation[]): DeploymentAttentionItem[] {
  return validations
    .filter((validation) => {
      const status = validation.report?.status
      return status === "fail" || status === "warning" || validation.status === "post_running" || validation.status === "log_running"
    })
    .slice(0, 4)
    .map((validation) => {
      const reportStatus = validation.report?.status
      if (reportStatus === "fail") {
        return { id: validation.id, title: validation.name, detail: `${validation.applicationName} has a failed deployment report.`, tone: "danger" as const }
      }
      if (reportStatus === "warning") {
        return { id: validation.id, title: validation.name, detail: `${validation.applicationName} has deployment warnings to review.`, tone: "warning" as const }
      }
      return { id: validation.id, title: validation.name, detail: `${validation.applicationName} is still ${validation.status.replaceAll("_", " ")}.`, tone: "primary" as const }
    })
}
