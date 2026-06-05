"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Boxes,
  Braces,
  CheckCircle2,
  Eye,
  KeyRound,
  LineChart,
  Play,
  Plus,
  RotateCw,
  Settings,
  Server,
  Timer,
  Workflow,
  Search,
  Users,
  HelpCircle,
  Info,
  Sparkles,
  Loader2,
  Upload,
} from "lucide-react"

import { BuilderWorkbench } from "@/components/pulse/builder-workbench"
import { MonitorImportExportDialog } from "@/components/pulse/monitor-import-export-dialog"
import { AlertDetail, AlertsHistory } from "@/components/pulse/alert-views"
import {
  formatDate,
  isFailedStatus,
  isSuccessStatus,
  LatencyChart,
  Metric,
  MonitorRunsChart,
  PageShell,
  StatusPill,
  type ConsoleView,
} from "@/components/pulse/console-shared"
import { RunDetail, RunTimeline } from "@/components/pulse/run-views"
import { Secrets, type SecretInput } from "@/components/pulse/secrets-view"
import { SettingsView } from "@/components/pulse/settings-view"
import type {
  Application,
  AlertEvent,
  CertificateProfile,
  CertificateProfileInput,
  DeploymentValidation,
  Monitor,
  MonitorRun,
  NotificationSettings,
  NotificationSettingsInput,
  NotificationTestResult,
  RetentionPurgeResult,
  RetentionSettings,
  SecretReference,
  SLOSummary,
} from "@/lib/pulse-types"
import { applicationSLOMap, formatUptimePct, monitorSLOMap } from "@/lib/pulse-slo"
import { ErrorBudgetWidget } from "@/components/pulse/slo-widgets"
import { Button, Card as HeroCard, Chip, Description, EmptyState, Table } from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"

import { applicationHealth, dateTimeLocalToISOString, toDateTimeLocalInput, validationStatusLabel } from "../utils/console-utils"
import type { DeploymentValidationCreateInput } from "../types"
import { AlertFeed } from "../components/alert-feed"
import { DeploymentValidationPanel } from "../components/deployment-validation-panel"
import { HistoryPatternAnalysis } from "../components/history-pattern-analysis"
import { MonitorTable } from "../components/monitor-table"
import { SchedulerStatusCard } from "../components/scheduler-status-card"
import { ValidationResultPill } from "../components/validation-result-pill"


export function DeploymentValidationDetailView({
  validation,
  preRuns,
  postRuns,
  onRunPost,
  onGenerateAIReport,
  onRefresh,
}: {
  validation: DeploymentValidation
  preRuns: MonitorRun[]
  postRuns: MonitorRun[]
  onRunPost: (validationId: string) => Promise<void>
  onGenerateAIReport: (validation: DeploymentValidation, preRuns: MonitorRun[], postRuns: MonitorRun[]) => Promise<DeploymentValidation | null>
  onRefresh: () => Promise<void>
}) {
  const [runningPost, setRunningPost] = useState(false)
  const [generatingAI, setGeneratingAI] = useState(false)
  const report = validation.report
  const summary = report?.summary
  const hasPre = preRuns.length > 0
  const hasPost = postRuns.length > 0
  const expectedPostRuns = Math.max(1, validation.monitorIds.length * (validation.sampleCount || 30))
  const deploymentTime = validation.deploymentStartedAt || validation.createdAt

  useEffect(() => {
    if (validation.status !== "post_running") return
    const timer = window.setInterval(() => {
      void onRefresh()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [validation.status, onRefresh])

  async function runPostSamples() {
    setRunningPost(true)
    try {
      await onRunPost(validation.id)
      await onRefresh()
    } finally {
      setRunningPost(false)
    }
  }

  async function generateAIReport() {
    if (!report || report.status === "incomplete" || generatingAI) return
    setGeneratingAI(true)
    try {
      await onGenerateAIReport(validation, preRuns, postRuns)
      await onRefresh()
    } finally {
      setGeneratingAI(false)
    }
  }

  return (
    <PageShell
      eyebrow={`CAR ${validation.carId}`}
      title={validation.name}
      description={[validation.applicationName, validation.environment, validation.version, validation.buildId].filter(Boolean).join(" · ")}
      action={
        <div className="flex flex-wrap gap-2">
          <Button onPress={runPostSamples} isDisabled={runningPost || !hasPre} className="h-9 gap-2">
            {runningPost || validation.status === "post_running" ? <RotateCw className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run post samples
          </Button>
          <Button variant="secondary" onPress={generateAIReport} isDisabled={generatingAI || !hasPre || !hasPost || report?.status === "incomplete"} className="h-9 gap-2">
            {generatingAI ? <RotateCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            AI report
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Report status" value={report?.status || "Incomplete"} icon={CheckCircle2} detail={validationStatusLabel(validation.status)} tone="success" />
          <Metric label="Monitors" value={String(summary?.totalMonitors ?? validation.monitorIds.length)} icon={Workflow} detail={`${summary?.comparedMonitors ?? 0} compared`} />
          <Metric label="Success delta" value={`${summary?.successRateDelta ?? 0}%`} icon={Activity} detail={`${summary?.preSuccessRate ?? 0}% to ${summary?.postSuccessRate ?? 0}%`} tone="success" />
          <Metric label="p95 delta" value={`${summary?.p95LatencyDeltaMs ?? 0}ms`} icon={Timer} detail={`${summary?.p95LatencyDeltaPct ?? 0}% change`} tone="accent" />
          <Metric label="New failures" value={String(summary?.newFailures ?? 0)} icon={AlertTriangle} detail={`${summary?.resolvedFailures ?? 0} resolved`} tone="danger" />
        </div>

        <HeroCard>
          <HeroCard.Header >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <HeroCard.Title className="text-sm font-semibold">Validation flow</HeroCard.Title>
                <Description>Historical baseline before deployment compared with controlled post-deploy samples.</Description>
              </div>
              <ValidationResultPill status={report?.status || "incomplete"} />
            </div>
          </HeroCard.Header>
          <HeroCard.Content className="grid gap-3 pt-4 md:grid-cols-3">
            <div className="rounded-md bg-muted/5 p-3">
              <div className="text-xs font-bold uppercase text-muted-foreground">Historical baseline</div>
              <div className="mt-2 text-xl font-bold">{preRuns.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Last {validation.baselineRunCount || 30}/monitor from {validation.baselineWindowHours || 24}h before deployment
              </div>
            </div>
            <div className="rounded-md bg-muted/5 p-3">
              <div className="text-xs font-bold uppercase text-muted-foreground">Deployment time</div>
              <div className="mt-2 text-base font-bold">{formatDate(deploymentTime)}</div>
              <div className="mt-1 text-xs text-muted-foreground">Baseline runs must start before this timestamp.</div>
            </div>
            <div className="rounded-md bg-muted/5 p-3">
              <div className="text-xs font-bold uppercase text-muted-foreground">Post-deploy samples</div>
              <div className="mt-2 text-xl font-bold">{postRuns.length}/{expectedPostRuns}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {validation.postCompletedAt ? `Completed ${formatDate(validation.postCompletedAt)}` : postRuns.length > 0 ? `${validation.intervalSeconds || 0}s interval in progress` : "Ready to start after deployment"}
              </div>
            </div>
            <div className="rounded-md bg-muted/5 p-3 md:col-span-3">
              <div className="text-xs font-bold uppercase text-muted-foreground">Report</div>
              <div className="mt-2"><ValidationResultPill status={report?.status || "incomplete"} /></div>
              <div className="mt-2 text-xs text-muted-foreground">{report?.incompleteReason || "Generated from historical baseline and post-deploy samples."}</div>
            </div>
          </HeroCard.Content>
        </HeroCard>

        {report?.regressions && report.regressions.length > 0 && (
          <HeroCard>
            <HeroCard.Header >
              <div className="space-y-1">
                <HeroCard.Title className="text-sm font-semibold">Regressions</HeroCard.Title>
                <Description>Issues detected after deployment.</Description>
              </div>
            </HeroCard.Header>
            <HeroCard.Content className="space-y-2 pt-4">
              {report.regressions.map((regression, index) => (
                <div key={`${regression}-${index}`} className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs font-medium text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {regression}
                </div>
              ))}
            </HeroCard.Content>
          </HeroCard>
        )}

        {validation.aiReport?.executiveSummary && (
          <HeroCard>
            <HeroCard.Header className="border-b pb-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <HeroCard.Title className="text-sm font-semibold">AI deployment report</HeroCard.Title>
                  <HeroCard.Description>Generated from deterministic Pulse metrics and linked monitor runs.</HeroCard.Description>
                </div>
                <Chip variant="secondary" className="w-fit capitalize">
                  <Chip.Label>{validation.aiReport.riskLevel || "risk"} risk</Chip.Label>
                </Chip>
              </div>
            </HeroCard.Header>
            <HeroCard.Content className="space-y-4 pt-4">
              <div className="rounded-md border bg-muted/5 p-4">
                <div className="text-xs font-bold uppercase text-muted-foreground">Recommendation</div>
                <div className="mt-1 text-lg font-bold">{validation.aiReport.recommendation || "Review"}</div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{validation.aiReport.executiveSummary}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase text-muted-foreground">Key findings</div>
                  {(validation.aiReport.keyFindings || []).map((finding, index) => (
                    <div key={`${finding}-${index}`} className="rounded-md border bg-muted/5 p-3 text-xs font-medium">{finding}</div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase text-muted-foreground">Next actions</div>
                  {(validation.aiReport.nextActions || []).map((action, index) => (
                    <div key={`${action}-${index}`} className="rounded-md border bg-muted/5 p-3 text-xs font-medium">{action}</div>
                  ))}
                </div>
              </div>
            </HeroCard.Content>
          </HeroCard>
        )}

        <HeroCard>
          <HeroCard.Header >
            <div className="space-y-1">
              <HeroCard.Title className="text-sm font-semibold">Monitor comparison</HeroCard.Title>
              <Description>Pre and post deployment run status, latency delta, and diagnostic links.</Description>
            </div>
          </HeroCard.Header>
          <HeroCard.Content className="pt-4">
            {!report?.monitorComparisons?.length ? (
              <EmptyState className="flex h-full min-h-24 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 py-6 text-center">
                <p className="text-sm font-semibold">Run both phases to generate monitor comparisons.</p>
              </EmptyState>
            ) : (
              <Table aria-label="Monitor comparison">
                <Table.ScrollContainer>
                  <Table.Content className="min-w-[760px]">
                    <Table.Header>
                      <Table.Column isRowHeader className="px-3">Monitor</Table.Column>
                      <Table.Column className="px-3">Pre</Table.Column>
                      <Table.Column className="px-3">Post</Table.Column>
                      <Table.Column className="px-3">Latency delta</Table.Column>
                      <Table.Column className="px-3">Result</Table.Column>
                      <Table.Column className="px-3 text-end">Runs</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {report.monitorComparisons.map((comparison) => (
                        <Table.Row key={comparison.monitorId} className="hover:bg-default/40">
                          <Table.Cell className="max-w-[280px] px-3 py-3 align-top">
                            <div className="text-sm font-semibold">{comparison.monitorName || comparison.monitorId}</div>
                            <Description className="mt-0.5 text-[11px]">
                              {comparison.reason || "No regression detected"}
                            </Description>
                          </Table.Cell>
                          <Table.Cell className="px-3 py-3 align-top">
                            {comparison.preStatus ? <StatusPill status={comparison.preStatus} /> : <span className="text-xs text-muted-foreground">Missing</span>}
                          </Table.Cell>
                          <Table.Cell className="px-3 py-3 align-top">
                            {comparison.postStatus ? <StatusPill status={comparison.postStatus} /> : <span className="text-xs text-muted-foreground">Missing</span>}
                          </Table.Cell>
                          <Table.Cell className={cn("px-3 py-3 text-xs font-bold align-top", comparison.durationDeltaMs > 0 ? "text-warning" : "text-success")}>
                            {comparison.durationDeltaMs > 0 ? "+" : ""}{comparison.durationDeltaMs}ms · {comparison.durationDeltaPct > 0 ? "+" : ""}{comparison.durationDeltaPct}%
                          </Table.Cell>
                          <Table.Cell className="px-3 py-3 align-top">
                            <ValidationResultPill status={comparison.result} />
                          </Table.Cell>
                          <Table.Cell className="px-3 py-3 text-end align-top">
                            <div className="flex justify-end gap-2">
                              {comparison.preRunId ? (
                                <Link href={`/runs/${comparison.preRunId}`}>
                                  <Button variant="secondary" size="sm" className="h-8 text-xs">Pre</Button>
                                </Link>
                              ) : null}
                              {comparison.postRunId ? (
                                <Link href={`/runs/${comparison.postRunId}`}>
                                  <Button variant="secondary" size="sm" className="h-8 text-xs">Post</Button>
                                </Link>
                              ) : null}
                            </div>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            )}
          </HeroCard.Content>
        </HeroCard>
      </div>
    </PageShell>
  )
}
