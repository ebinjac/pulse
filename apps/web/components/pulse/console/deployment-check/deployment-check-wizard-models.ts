import type { ElfQuery, Monitor } from "@/lib/pulse-types"
import type { WizardStep } from "./types"
import { WIZARD_STEPS } from "./types"
import { estimatedRuntimeLabel } from "../deployment-detail/deployment-workflow-view-models"

export function nextStepButtonLabel(step: WizardStep): string {
  const next = WIZARD_STEPS.find((s) => s.step === step + 1)
  if (!next) return "Next"
  return `Next: ${next.title}`
}

export function gateModeDisplay(mode?: string): {
  label: string
  className: string
} {
  const normalized = (mode || "advisory").toLowerCase()
  if (normalized === "blocking") {
    return {
      label: "Blocking",
      className: "border-danger/30 bg-danger/10 text-danger",
    }
  }
  if (normalized === "warning") {
    return {
      label: "Warning",
      className: "border-warning/30 bg-warning/10 text-warning",
    }
  }
  return {
    label: "Advisory",
    className: "border-primary/20 bg-primary/5 text-primary",
  }
}

export function elfQueryPreview(query: ElfQuery): string {
  if (typeof query.searchBody === "string" && query.searchBody.trim()) {
    const trimmed = query.searchBody.trim()
    return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed
  }
  if (query.checkKind && query.checkKind !== "raw") {
    return `${query.checkKind.replace(/_/g, " ")} check`
  }
  if (query.signalType) {
    return query.signalType.replace(/_/g, " ")
  }
  return "OpenSearch / ELF query"
}

export function monitorHealthFilter(status: string): "healthy" | "failing" | "other" {
  const normalized = status.toLowerCase()
  if (normalized === "success") return "healthy"
  if (normalized === "failed" || normalized === "error" || normalized === "timeout") return "failing"
  return "other"
}

export function aggregateMonitorStats(monitors: Monitor[]) {
  if (monitors.length === 0) {
    return { avgSuccess: 0, avgLatency: 0 }
  }
  const avgSuccess = Math.round(
    monitors.reduce((sum, m) => sum + (m.successRate24h ?? 0), 0) / monitors.length,
  )
  const avgLatency = Math.round(
    monitors.reduce((sum, m) => sum + (m.lastDurationMs ?? 0), 0) / monitors.length,
  )
  return { avgSuccess, avgLatency }
}

export function buildWizardWarnings({
  logChecksSkipped,
  estimate,
  sampleCount,
  intervalSeconds,
}: {
  logChecksSkipped: boolean
  estimate: string
  sampleCount: number
  intervalSeconds: number
}): string[] {
  const warnings: string[] = []
  if (logChecksSkipped) {
    warnings.push(
      "Log checks are skipped, so this validation will only use synthetic monitors.",
    )
  }
  if (sampleCount > 0) {
    warnings.push(
      `Post-deploy validation will take about ${estimate} after deployment starts (${intervalSeconds}s between samples).`,
    )
  }
  return warnings
}

export function stepperSubtitle(
  step: WizardStep,
  ctx: {
    monitorCount: number
    elfQueryCount: number
    logsSkipped: boolean
    activeStep: WizardStep
  },
): string {
  switch (step) {
    case 1:
      return "Application, environment, version, and deploy time"
    case 2:
      return ctx.monitorCount > 0
        ? `${ctx.monitorCount} monitor${ctx.monitorCount === 1 ? "" : "s"} selected`
        : "Select synthetic monitors to compare"
    case 3:
      if (ctx.logsSkipped && ctx.activeStep >= 4) return "Skipped — monitor-only validation"
      if (ctx.elfQueryCount > 0) {
        return `${ctx.elfQueryCount} ELF gate${ctx.elfQueryCount === 1 ? "" : "s"} selected`
      }
      return "Optional OpenSearch / ELF gates"
    case 4:
      return "Confirm scope, sampling, and create"
    default:
      return ""
  }
}

export function formatEstimate(sampleCount: number, intervalSeconds: number) {
  return estimatedRuntimeLabel(sampleCount, intervalSeconds)
}
