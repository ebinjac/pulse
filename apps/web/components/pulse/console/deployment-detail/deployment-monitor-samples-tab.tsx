"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight } from "lucide-react"
import { formatDate, Metric, StatusPill } from "@/components/pulse/console-shared"
import type { DeploymentValidation, MonitorRun } from "@/lib/pulse-types"
import { Button, Card, Description, EmptyState, Table } from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"
import { ValidationResultPill } from "../components/validation-result-pill"
import {
  buildMonitorSummaries,
  expectedPostRuns,
  expectedBaselinePerMonitor,
  type MonitorSampleSummary,
} from "./deployment-detail-utils"
import { Activity, AlertTriangle, Clock, Gauge } from "lucide-react"

function MonitorRunDrilldown({
  monitorId,
  monitorName,
  preRuns,
  postRuns,
}: {
  monitorId: string
  monitorName: string
  preRuns: MonitorRun[]
  postRuns: MonitorRun[]
}) {
  const [open, setOpen] = useState(false)
  const baseline = preRuns.filter((r) => r.monitorId === monitorId)
  const post = postRuns.filter((r) => r.monitorId === monitorId)
  const rows = [
    ...baseline.map((run, index) => ({ phase: "Baseline" as const, index: index + 1, run })),
    ...post.map((run, index) => ({ phase: "Post-deploy" as const, index: index + 1, run })),
  ]

  return (
    <div className="border-t border-border/30 bg-muted/5">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold text-primary hover:bg-muted/20"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        View {baseline.length} baseline + {post.length} post runs for {monitorName}
      </button>
      {open ? (
        <div className="px-4 pb-3">
          <Table aria-label={`Runs for ${monitorName}`}>
            <Table.ScrollContainer>
              <Table.Content className="min-w-[560px]">
                <Table.Header>
                  <Table.Column className="px-2">#</Table.Column>
                  <Table.Column className="px-2">Phase</Table.Column>
                  <Table.Column className="px-2">Started</Table.Column>
                  <Table.Column className="px-2">Status</Table.Column>
                  <Table.Column className="px-2">Duration</Table.Column>
                  <Table.Column className="px-2 text-end">Link</Table.Column>
                </Table.Header>
                <Table.Body>
                  {rows.length === 0 ? (
                    <Table.Row>
                      <Table.Cell colSpan={6} className="py-4 text-center text-xs text-muted-foreground">
                        No runs recorded for this monitor yet.
                      </Table.Cell>
                    </Table.Row>
                  ) : (
                    rows.map(({ phase, index, run }) => (
                      <Table.Row key={run.id}>
                        <Table.Cell className="px-2 text-xs">{index}</Table.Cell>
                        <Table.Cell className="px-2 text-xs">{phase}</Table.Cell>
                        <Table.Cell className="px-2 text-xs text-muted-foreground">
                          {formatDate(run.startedAt)}
                        </Table.Cell>
                        <Table.Cell className="px-2">
                          <StatusPill status={run.status} />
                        </Table.Cell>
                        <Table.Cell className="px-2 text-xs font-mono">{run.durationMs}ms</Table.Cell>
                        <Table.Cell className="px-2 text-end">
                          <Link href={`/runs/${run.id}`}>
                            <Button variant="secondary" size="sm" className="h-7 text-xs">
                              View run
                            </Button>
                          </Link>
                        </Table.Cell>
                      </Table.Row>
                    ))
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </div>
      ) : null}
    </div>
  )
}

function MonitorSummaryRow({
  summary,
  preRuns,
  postRuns,
}: {
  summary: MonitorSampleSummary
  preRuns: MonitorRun[]
  postRuns: MonitorRun[]
}) {
  return (
    <>
      <Table.Row>
        <Table.Cell className="max-w-[200px] px-4 py-3 align-top">
          <div className="text-sm font-semibold">{summary.monitorName}</div>
          {summary.reason ? (
            <Description className="mt-0.5 text-[11px]">{summary.reason}</Description>
          ) : null}
        </Table.Cell>
        <Table.Cell className="px-3 py-3 align-top text-xs">{summary.baselineCount}</Table.Cell>
        <Table.Cell className="px-3 py-3 align-top text-xs">{summary.postCount}</Table.Cell>
        <Table.Cell className="px-3 py-3 align-top text-xs">{summary.baselineSuccessPct}%</Table.Cell>
        <Table.Cell className="px-3 py-3 align-top text-xs">{summary.postSuccessPct}%</Table.Cell>
        <Table.Cell
          className={cn(
            "px-3 py-3 align-top text-xs font-semibold",
            summary.latencyDeltaMs > 0 ? "text-warning" : "text-success",
          )}
        >
          {summary.latencyDeltaMs > 0 ? "+" : ""}
          {summary.latencyDeltaMs}ms
        </Table.Cell>
        <Table.Cell className="px-3 py-3 align-top">
          <ValidationResultPill status={summary.result} />
        </Table.Cell>
      </Table.Row>
      <Table.Row>
        <Table.Cell colSpan={7} className="p-0">
          <MonitorRunDrilldown
            monitorId={summary.monitorId}
            monitorName={summary.monitorName}
            preRuns={preRuns}
            postRuns={postRuns}
          />
        </Table.Cell>
      </Table.Row>
    </>
  )
}

export function DeploymentMonitorSamplesTab({
  validation,
  preRuns,
  postRuns,
}: {
  validation: DeploymentValidation
  preRuns: MonitorRun[]
  postRuns: MonitorRun[]
}) {
  const summaries = buildMonitorSummaries(validation, preRuns, postRuns, validation.report)
  const perMonitor = validation.sampleCount || 30
  const baselinePer = expectedBaselinePerMonitor(validation)
  const monitorCount = validation.monitorIds.length
  const expectedPost = expectedPostRuns(validation)
  const failedCount = summaries.filter((summary) => summary.result === "fail").length
  const largestRegression = summaries.reduce((max, summary) => Math.max(max, summary.latencyDeltaMs), 0)
  const slowest = summaries.reduce<MonitorSampleSummary | null>((current, summary) => {
    if (!current) return summary
    return summary.comparison?.postDurationMs && summary.comparison.postDurationMs > (current.comparison?.postDurationMs || 0)
      ? summary
      : current
  }, null)

  if (summaries.length === 0) {
    return (
      <EmptyState className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/10 py-10 text-center">
        <p className="text-sm font-semibold">No monitor samples yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Run the deployment check to collect baseline history and post-deploy samples.
        </p>
      </EmptyState>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Post samples"
          value={`${postRuns.length}/${expectedPost}`}
          icon={Activity}
          detail={validation.status === "post_running" ? `Next sample every ${validation.intervalSeconds || 30}s` : "Collected after deploy"}
          tone="accent"
        />
        <Metric label="Failed monitors" value={String(failedCount)} icon={AlertTriangle} detail="Post-deploy regressions" tone={failedCount ? "danger" : "success"} />
        <Metric label="Largest latency Δ" value={`${largestRegression > 0 ? "+" : ""}${largestRegression}ms`} icon={Gauge} detail="p95 monitor delta" tone={largestRegression > 0 ? "warning" : "success"} />
        <Metric label="Slowest monitor" value={slowest?.monitorName || "—"} icon={Clock} detail={slowest?.comparison?.postDurationMs ? `${slowest.comparison.postDurationMs}ms post p95` : "No post sample yet"} />
      </div>

      <Card className="border-border/40 bg-muted/5 p-4">
        <Description className="text-sm">
          <strong className="text-foreground">{baselinePer} baseline + {perMonitor} post</strong> samples
          per monitor across <strong className="text-foreground">{monitorCount}</strong> monitor
          {monitorCount === 1 ? "" : "s"} ({preRuns.length} baseline + {postRuns.length} post runs loaded).
        </Description>
      </Card>

      <Card className="gap-0 p-0">
        <Card.Content className="p-0">
          <Table aria-label="Monitor sample comparison">
            <Table.ScrollContainer>
              <Table.Content className="min-w-[800px]">
                <Table.Header>
                  <Table.Column isRowHeader className="px-4">Monitor</Table.Column>
                  <Table.Column className="px-3">Baseline runs</Table.Column>
                  <Table.Column className="px-3">Post runs</Table.Column>
                  <Table.Column className="px-3">Pre success</Table.Column>
                  <Table.Column className="px-3">Post success</Table.Column>
                  <Table.Column className="px-3">Latency Δ</Table.Column>
                  <Table.Column className="px-3">Result</Table.Column>
                </Table.Header>
                <Table.Body>
                  {summaries.map((summary) => (
                    <MonitorSummaryRow
                      key={summary.monitorId}
                      summary={summary}
                      preRuns={preRuns}
                      postRuns={postRuns}
                    />
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Card.Content>
      </Card>
    </div>
  )
}
