"use client"

import { useState } from "react"
import { AlertTriangle, Check, Copy, Gauge, RotateCw, Sparkles, TrendingUp } from "lucide-react"
import type { DeploymentValidation } from "@/lib/pulse-types"
import { Button, Card as HeroCard, Chip, Description, EmptyState, Table } from "@workspace/ui/components/ui"
import { cn } from "@workspace/ui/lib/utils"
import { Metric, StatusPill } from "@/components/pulse/console-shared"
import { ValidationResultPill } from "../components/validation-result-pill"
import { ObservabilityFindings } from "../components/observability-findings"

export function DeploymentReportTab({
  validation,
  generatingAI,
  canGenerateAI,
  onGenerateAIReport,
}: {
  validation: DeploymentValidation
  generatingAI: boolean
  canGenerateAI: boolean
  onGenerateAIReport: () => void
}) {
  const report = validation.report
  const [showAI, setShowAI] = useState(Boolean(validation.aiReport?.executiveSummary))
  const [copied, setCopied] = useState(false)

  if (!report || report.status === "incomplete") {
    return (
      <EmptyState className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/10 py-10 text-center">
        <p className="text-sm font-semibold">Report not ready</p>
        <p className="max-w-md text-xs text-muted-foreground">
          {report?.incompleteReason ||
            "Run the deployment check to generate a full comparison report."}
        </p>
      </EmptyState>
    )
  }

  const summaryText = [
    `${validation.name}: ${report.status.toUpperCase()}`,
    `Success rate: ${report.summary.preSuccessRate}% -> ${report.summary.postSuccessRate}% (${report.summary.successRateDelta}%)`,
    `P95 latency: ${report.summary.preP95LatencyMs}ms -> ${report.summary.postP95LatencyMs}ms (${report.summary.p95LatencyDeltaMs}ms)`,
    `New failures: ${report.summary.newFailures}`,
    ...(report.regressions || []).map((item) => `Regression: ${item}`),
  ].join("\n")

  return (
    <div className="space-y-4">
      <HeroCard className={cn(
        "border-border/40",
        report.status === "fail" ? "border-danger/30 bg-danger/[0.03]" : report.status === "warning" ? "border-warning/30 bg-warning/[0.03]" : "border-success/30 bg-success/[0.03]",
      )}>
        <HeroCard.Header className="flex flex-col gap-3 border-b border-border/40 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <HeroCard.Title className="text-sm font-semibold">Deployment verdict</HeroCard.Title>
            <HeroCard.Description>
              Generated {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : "recently"}
            </HeroCard.Description>
            <div className="mt-3 text-2xl font-bold capitalize text-foreground">{report.status}</div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{releaseRecommendation(report.status)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ValidationResultPill status={report.status} />
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onPress={() => {
                void navigator.clipboard.writeText(summaryText)
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1400)
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy summary"}
            </Button>
          </div>
        </HeroCard.Header>
      </HeroCard>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Success delta" value={`${report.summary.successRateDelta}%`} icon={TrendingUp} detail={`${report.summary.preSuccessRate}% → ${report.summary.postSuccessRate}%`} tone={report.summary.successRateDelta < 0 ? "danger" : "success"} />
        <Metric label="P95 latency delta" value={`${report.summary.p95LatencyDeltaMs > 0 ? "+" : ""}${report.summary.p95LatencyDeltaMs}ms`} icon={Gauge} detail={`${report.summary.preP95LatencyMs}ms → ${report.summary.postP95LatencyMs}ms`} tone={report.summary.p95LatencyDeltaMs > 0 ? "warning" : "success"} />
        <Metric label="New failures" value={String(report.summary.newFailures)} icon={AlertTriangle} detail={`${report.summary.resolvedFailures} resolved`} tone={report.summary.newFailures ? "danger" : "success"} />
        <Metric label="ELF findings" value={String((report.elfComparisons || []).filter((item) => item.result === "fail" || item.result === "warning").length)} icon={AlertTriangle} detail="Log gates warning/fail" tone={(report.elfComparisons || []).some((item) => item.result === "fail" || item.result === "warning") ? "warning" : "success"} />
      </div>

      {report.regressions && report.regressions.length > 0 && (
        <HeroCard>
          <HeroCard.Header>
            <HeroCard.Title className="text-sm font-semibold">Regressions</HeroCard.Title>
            <HeroCard.Description>Issues detected after deployment.</HeroCard.Description>
          </HeroCard.Header>
          <HeroCard.Content className="space-y-2 pt-4">
            {report.regressions.map((regression, index) => (
              <div
                key={`${regression}-${index}`}
                className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs font-medium text-warning"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {regression}
              </div>
            ))}
          </HeroCard.Content>
        </HeroCard>
      )}

      {report.monitorComparisons?.length ? (
        <HeroCard>
          <HeroCard.Header>
            <HeroCard.Title className="text-sm font-semibold">Monitor comparison summary</HeroCard.Title>
            <HeroCard.Description>Aggregated pre vs post results per monitor.</HeroCard.Description>
          </HeroCard.Header>
          <HeroCard.Content className="pt-4">
            <Table aria-label="Monitor comparison summary">
              <Table.ScrollContainer>
                <Table.Content className="min-w-[720px]">
                  <Table.Header>
                    <Table.Column isRowHeader>Monitor</Table.Column>
                    <Table.Column>Pre</Table.Column>
                    <Table.Column>Post</Table.Column>
                    <Table.Column>Latency Δ</Table.Column>
                    <Table.Column>Result</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {report.monitorComparisons.map((comparison) => (
                      <Table.Row key={comparison.monitorId}>
                        <Table.Cell className="text-sm font-semibold">
                          {comparison.monitorName || comparison.monitorId}
                        </Table.Cell>
                        <Table.Cell>
                          {comparison.preStatus ? (
                            <StatusPill status={comparison.preStatus} />
                          ) : (
                            "—"
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          {comparison.postStatus ? (
                            <StatusPill status={comparison.postStatus} />
                          ) : (
                            "—"
                          )}
                        </Table.Cell>
                        <Table.Cell
                          className={cn(
                            "text-xs font-bold",
                            comparison.durationDeltaMs > 0 ? "text-warning" : "text-success",
                          )}
                        >
                          {comparison.durationDeltaMs > 0 ? "+" : ""}
                          {comparison.durationDeltaMs}ms
                        </Table.Cell>
                        <Table.Cell>
                          <ValidationResultPill status={comparison.result} />
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </HeroCard.Content>
        </HeroCard>
      ) : null}

      <ObservabilityFindings report={report} />

      <HeroCard>
        <HeroCard.Header className="flex flex-row items-center justify-between border-b pb-3">
          <div>
            <HeroCard.Title className="text-sm font-semibold">AI summary</HeroCard.Title>
            <HeroCard.Description>Explains the deterministic report. It does not override the verdict.</HeroCard.Description>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              if (validation.aiReport?.executiveSummary) {
                setShowAI(true)
              } else {
                void onGenerateAIReport()
              }
            }}
            isDisabled={generatingAI || !canGenerateAI}
            className="gap-1.5"
          >
            {generatingAI ? <RotateCw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {validation.aiReport?.executiveSummary ? "Show report" : "Generate"}
          </Button>
        </HeroCard.Header>
        {showAI && validation.aiReport?.executiveSummary ? (
          <HeroCard.Content className="space-y-4 pt-4">
            <div className="flex items-center gap-2">
              <Chip variant="secondary" className="capitalize">
                <Chip.Label>{validation.aiReport.riskLevel || "risk"} risk</Chip.Label>
              </Chip>
            </div>
            <div className="rounded-md border bg-muted/5 p-4">
              <div className="text-xs font-bold uppercase text-muted-foreground">Recommendation</div>
              <div className="mt-1 text-lg font-bold">{validation.aiReport.recommendation || "Review"}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {validation.aiReport.executiveSummary}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase text-muted-foreground">Key findings</div>
                {(validation.aiReport.keyFindings || []).map((finding, index) => (
                  <div key={index} className="rounded-md border bg-muted/5 p-3 text-xs font-medium">
                    {finding}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase text-muted-foreground">Next actions</div>
                {(validation.aiReport.nextActions || []).map((action, index) => (
                  <div key={index} className="rounded-md border bg-muted/5 p-3 text-xs font-medium">
                    {action}
                  </div>
                ))}
              </div>
            </div>
          </HeroCard.Content>
        ) : (
          <HeroCard.Content className="py-6">
            <Description className="text-center text-xs">
              Generate an AI summary after the report is complete.
            </Description>
          </HeroCard.Content>
        )}
      </HeroCard>
    </div>
  )
}

function releaseRecommendation(status: string) {
  if (status === "fail") return "Do not sign off yet. Review failed monitors and blocking log gates before proceeding."
  if (status === "warning") return "Proceed with caution. Review regressions and decide whether the risk is acceptable."
  return "No deterministic regression was detected. Review the details and complete your release notes."
}
