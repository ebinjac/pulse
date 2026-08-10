"use client"

import type {
  DeploymentValidation,
  DeploymentValidationSummary,
  MonitorRun,
} from "@/lib/pulse-types"
import { Metric } from "@/components/pulse/console-shared"
import { Card } from "@workspace/ui/components/ui"
import { Activity, AlertTriangle, Braces, CheckCircle2 } from "lucide-react"
import { logsConfigured, type PhaseRow } from "./deployment-detail-utils"
import {
  buildComparisonRows,
  buildFailureSummaryLines,
  logChecksSummaryLabel,
  phaseDisplayLabel,
  phaseProgressLabel,
  phaseStatusLabel,
  verdictLabel,
  verdictTone,
} from "./deployment-overview-models"
import { cn } from "@workspace/ui/lib/utils"

export function DeploymentOverviewTab({
  validation,
  phases,
  summary,
  preRuns = [],
  postRuns = [],
}: {
  validation: DeploymentValidation
  phases: PhaseRow[]
  summary?: DeploymentValidationSummary
  preRuns?: MonitorRun[]
  postRuns?: MonitorRun[]
}) {
  const report = validation.report
  const verdict = report?.status || "incomplete"
  const logChecks = logChecksSummaryLabel(validation, report)
  const failureLines = buildFailureSummaryLines(validation, report, summary)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Verdict"
          value={verdictLabel(verdict)}
          icon={CheckCircle2}
          detail={report?.incompleteReason || "Deployment report verdict"}
          tone={verdictTone(verdict)}
        />
        <Metric
          label="Success rate"
          value={`${summary?.preSuccessRate ?? 0}% → ${summary?.postSuccessRate ?? 0}%`}
          icon={Activity}
          detail={`${summary?.successRateDelta ?? 0}% delta`}
          tone={
            (summary?.successRateDelta ?? 0) < 0
              ? "danger"
              : (summary?.successRateDelta ?? 0) > 0
                ? "success"
                : "default"
          }
        />
        <Metric
          label="New failures"
          value={String(summary?.newFailures ?? 0)}
          icon={AlertTriangle}
          detail={`${summary?.resolvedFailures ?? 0} resolved`}
          tone={(summary?.newFailures ?? 0) > 0 ? "danger" : "success"}
        />
        <Metric
          label="Log checks"
          value={logChecks.value}
          icon={Braces}
          detail={
            logsConfigured(validation)
              ? `${validation.elfQueryIds?.length ?? 0} configured`
              : "Not configured"
          }
          tone={logChecks.tone}
        />
      </div>

      <Card className="border-border/40 bg-muted/5 p-4">
        <Card.Header className="p-0 pb-3">
          <Card.Title className="text-sm font-semibold">Failure summary</Card.Title>
        </Card.Header>
        <Card.Content className="space-y-2 p-0">
          {failureLines.map((line) => (
            <p key={line} className="text-sm leading-relaxed text-foreground">
              {line}
            </p>
          ))}
        </Card.Content>
      </Card>

      <Card className="border-border/40 p-0">
        <Card.Header className="border-b border-border/40 p-4">
          <Card.Title className="text-sm font-semibold">Phase progress</Card.Title>
        </Card.Header>
        <Card.Content className="p-0">
          <div className="divide-y divide-border/40">
            {phases.map((phase) => {
              const status = phaseStatusLabel(phase, validation, report)
              const isFailed = status === "Failed"
              const isRunning = status === "Running"
              return (
                <div
                  key={phase.id}
                  className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.6fr)] items-center gap-3 px-4 py-3 text-sm"
                >
                  <div className="font-medium text-foreground">{phaseDisplayLabel(phase)}</div>
                  <div
                    className={cn(
                      "font-semibold capitalize",
                      isFailed
                        ? "text-danger"
                        : isRunning
                          ? "text-primary"
                          : status === "Completed" || status === "Ready"
                            ? "text-success"
                            : "text-muted-foreground",
                    )}
                  >
                    {status}
                  </div>
                  <div className="text-right font-medium text-muted-foreground">
                    {phaseProgressLabel(phase)}
                  </div>
                </div>
              )
            })}
          </div>
        </Card.Content>
      </Card>

      {summary ? (
        <DeploymentComparisonCard summary={summary} preRuns={preRuns} postRuns={postRuns} />
      ) : null}
    </div>
  )
}

function DeploymentComparisonCard({
  summary,
  preRuns,
  postRuns,
}: {
  summary: DeploymentValidationSummary
  preRuns: MonitorRun[]
  postRuns: MonitorRun[]
}) {
  const rows = buildComparisonRows(summary, preRuns, postRuns)

  return (
    <Card className="border-border/40 p-0">
      <Card.Header className="border-b border-border/40 p-4">
        <Card.Title className="text-sm font-semibold">Comparison</Card.Title>
        <Card.Description className="text-xs text-muted-foreground">
          Baseline window vs post-deploy monitor samples
        </Card.Description>
      </Card.Header>
      <Card.Content className="p-0">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] gap-3 border-b border-border/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <div>Metric</div>
          <div>Baseline</div>
          <div>Post-deploy</div>
        </div>
        <div className="divide-y divide-border/40">
          {rows.map((row) => {
            const regressed =
              row.worseWhenHigher &&
              row.numericBaseline != null &&
              row.numericPost != null &&
              row.numericPost > row.numericBaseline
            const improved =
              row.worseWhenHigher &&
              row.numericBaseline != null &&
              row.numericPost != null &&
              row.numericPost < row.numericBaseline

            return (
              <div
                key={row.label}
                className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] items-center gap-3 px-4 py-3 text-sm"
              >
                <div className="font-medium text-foreground">{row.label}</div>
                <div className="text-muted-foreground">{row.baseline}</div>
                <div
                  className={cn(
                    "font-semibold",
                    regressed
                      ? "text-danger"
                      : improved
                        ? "text-success"
                        : "text-foreground",
                  )}
                >
                  {row.postDeploy}
                </div>
              </div>
            )
          })}
        </div>
      </Card.Content>
    </Card>
  )
}
