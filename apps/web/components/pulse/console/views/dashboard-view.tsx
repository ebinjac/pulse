"use client"

import { useCallback, useMemo } from "react"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  LineChart,
  Play,
  Plus,
  Timer,
  Upload,
  Workflow,
} from "lucide-react"

import { formatDate, isFailedStatus, Metric, PageShell, StatusPill } from "@/components/pulse/console/layout"
import { LatencyChart } from "@/components/pulse/console/charts"
import type { Application, AlertEvent, Monitor, MonitorRun, SLOSummary } from "@/lib/pulse-types"
import { ErrorBudgetWidget } from "@/components/pulse/slo-widgets"
import { Button, Card, Description, EmptyState } from "@workspace/ui/components/ui"
import { cn } from "@workspace/ui/lib/utils"

import { AlertFeed } from "../components/alert-feed"
import { HistoryPatternAnalysis } from "../components/history-pattern-analysis"
import { SchedulerStatusCard } from "../components/scheduler-status-card"

export interface DashboardProps {
  applications: Application[]
  monitors: Monitor[]
  runs: MonitorRun[]
  alerts: AlertEvent[]
  sloSummary: SLOSummary | null
  onImportExport?: () => void
}

export function Dashboard({
  applications,
  monitors,
  runs,
  alerts,
  sloSummary,
  onImportExport,
}: DashboardProps) {
  const failing = monitors.filter((monitor) => (monitor.status || "").toLowerCase() === "failed").length
  const active = monitors.filter((monitor) => monitor.isActive).length
  const averageResponse = Math.round(
    monitors.reduce((sum, monitor) => sum + (monitor.lastDurationMs || 0), 0) /
      Math.max(monitors.length, 1)
  )

  const systemHealthStatus = failing > 0 ? "Needs review" : "Fully operational"
  const systemHealthColor = failing > 0
    ? "text-rose-700 bg-rose-500/5 border-rose-200/60 dark:text-rose-300 dark:border-rose-900/40 dark:bg-rose-950/20"
    : "text-emerald-700 bg-emerald-500/5 border-emerald-200/60 dark:text-emerald-300 dark:border-emerald-900/40 dark:bg-emerald-950/20"

  const recentFailures = useMemo(() => {
    return [...monitors]
      .filter((m) => (m.status || "").toLowerCase() === "failed")
      .sort((a, b) => new Date(b.lastRunAt || 0).getTime() - new Date(a.lastRunAt || 0).getTime())
      .slice(0, 3)
  }, [monitors])

  const getMonitorFailureDetails = useCallback((monitorId: string) => {
    const monitorRuns = runs.filter((r) => r.monitorId === monitorId)
    const lastFailed = monitorRuns.find((r) => isFailedStatus(r.status))
    if (!lastFailed) return "Check execution failed"
    const failedStep = lastFailed.steps?.find((s) => isFailedStatus(s.status))
    return `${failedStep ? `[${failedStep.stepName}] ` : ""}${lastFailed.failureReason || "Assertion check failed"}`
  }, [runs])

  const slowestMonitors = useMemo(() => {
    return [...monitors]
      .filter((m) => m.isActive && (m.lastDurationMs || 0) > 0)
      .sort((a, b) => (b.lastDurationMs || 0) - (a.lastDurationMs || 0))
      .slice(0, 3)
  }, [monitors])

  const recentRuns = useMemo(() => {
    return [...runs]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 5)
  }, [runs])

  return (
    <PageShell
      eyebrow="Rythm / Dashboard"
      title="Synthetic monitoring"
      description="System health summary with links to full inventory, applications, and alerts."
      action={
        <div className="flex items-center gap-2">
          {onImportExport ? (
            <Button variant="secondary" onPress={onImportExport} className="h-9 gap-2 text-xs font-semibold">
              <Upload className="size-4" />
              Import / Export
            </Button>
          ) : null}
          <Link href="/monitors/create" className="inline-flex">
            <Button className="h-9 gap-2 px-3.5 text-xs font-semibold">
              <Plus className="size-4" />
              New Monitor
            </Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/monitors" className="group rounded-xl border border-border/60 bg-muted/5 p-4 transition-colors hover:bg-muted/15">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Workflow className="size-4 text-primary" />
                Monitors
              </div>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{monitors.length}</p>
            <Description className="text-xs">{active} active · {failing} failing</Description>
          </Link>
          <Link href="/applications" className="group rounded-xl border border-border/60 bg-muted/5 p-4 transition-colors hover:bg-muted/15">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Boxes className="size-4 text-primary" />
                Applications
              </div>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{applications.length}</p>
            <Description className="text-xs">Grouped monitor suites</Description>
          </Link>
          <Link href="/alerts" className="group rounded-xl border border-border/60 bg-muted/5 p-4 transition-colors hover:bg-muted/15">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="size-4 text-primary" />
                Alerts
              </div>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{alerts.filter((a) => a.status === "open").length}</p>
            <Description className="text-xs">Open incidents</Description>
          </Link>
        </div>

        <div className={cn("flex items-center justify-between gap-4 rounded-lg border p-3.5 text-xs font-semibold shadow-xs", systemHealthColor)}>
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", failing > 0 ? "bg-rose-400" : "bg-emerald-400")} />
              <span className={cn("relative inline-flex size-2 rounded-full", failing > 0 ? "bg-rose-500" : "bg-emerald-500")} />
            </span>
            <span>System health: {systemHealthStatus}</span>
          </div>
          <div className="text-[11px] font-medium text-muted-foreground">
            {failing} failing · {active} active · {averageResponse}ms average response
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Total monitors" value={String(monitors.length)} detail="Configured checks" icon={Workflow} />
          <Metric label="Active monitors" value={String(active)} detail="Running on schedule" icon={Play} tone="success" />
          <Metric label="Failing monitors" value={String(failing)} detail="Need attention" icon={AlertTriangle} tone="danger" />
          <Metric label="Average response" value={`${averageResponse}ms`} detail="Latest samples" icon={Timer} tone="accent" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <LatencyChart runs={runs} />
          <SchedulerStatusCard monitors={monitors} />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <Card.Header>
              <Card.Title className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <AlertTriangle className="size-3.5 text-danger" />
                Recent Failures
              </Card.Title>
            </Card.Header>
            <Card.Content className="space-y-3">
              {recentFailures.length === 0 ? (
                <EmptyState className="border-0 bg-transparent py-4 text-center">
                  <CheckCircle2 className="mx-auto size-5 text-success" />
                  <Description className="text-xs">No recent failures recorded.</Description>
                </EmptyState>
              ) : (
                recentFailures.map((m) => (
                  <div key={m.id} className="rounded-lg border border-border/40 bg-muted/5 p-3">
                    <Link href={`/monitors/${m.id}/runs`} className="font-semibold text-foreground hover:text-primary hover:underline">
                      {m.name}
                    </Link>
                    <p className="mt-1 text-[11px] text-danger">{getMonitorFailureDetails(m.id)}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Last run: {m.lastRunAt ? formatDate(m.lastRunAt) : "Never"}
                    </p>
                  </div>
                ))
              )}
            </Card.Content>
          </Card>

          <Card>
            <Card.Header>
              <Card.Title className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Timer className="size-3.5 text-warning" />
                Slowest Monitors
              </Card.Title>
            </Card.Header>
            <Card.Content className="space-y-3">
              {slowestMonitors.length === 0 ? (
                <EmptyState className="border-0 bg-transparent py-4 text-center">
                  <Timer className="mx-auto size-5 text-muted-foreground" />
                  <Description className="text-xs">Run checks to compile latency metrics.</Description>
                </EmptyState>
              ) : (
                slowestMonitors.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/5 p-3">
                    <Link href={`/monitors/${m.id}/runs`} className="min-w-0 truncate font-semibold text-foreground hover:text-primary hover:underline">
                      {m.name}
                    </Link>
                    <span className="shrink-0 rounded border border-border/50 bg-muted px-2 py-0.5 font-heading text-xs font-bold">
                      {m.lastDurationMs || 0}ms
                    </span>
                  </div>
                ))
              )}
            </Card.Content>
          </Card>
        </div>

        <Card>
          <Card.Header className="flex flex-row items-center justify-between">
            <Card.Title className="text-sm font-semibold">Recent runs</Card.Title>
            <Link href="/monitors" className="text-xs font-semibold text-primary hover:underline">
              View all monitors
            </Link>
          </Card.Header>
          <Card.Content className="divide-y divide-border/30">
            {recentRuns.length === 0 ? (
              <EmptyState className="border-0 bg-transparent py-6 text-center">
                <Workflow className="mx-auto size-5 text-muted-foreground" />
                <Description className="text-xs">No runs recorded yet.</Description>
              </EmptyState>
            ) : (
              recentRuns.map((run) => (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="flex items-center justify-between gap-3 py-3 text-xs transition-colors hover:bg-muted/5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{run.monitorName}</p>
                    <p className="text-[10px] text-muted-foreground">{formatDate(run.startedAt)} · {run.triggeredBy}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold">{run.durationMs}ms</span>
                    <StatusPill status={run.status} />
                  </div>
                </Link>
              ))
            )}
          </Card.Content>
        </Card>

        {monitors[0] ? <HistoryPatternAnalysis monitor={monitors[0]} runs={runs} /> : null}

        <ErrorBudgetWidget summary={sloSummary} />
        <AlertFeed alerts={alerts} />
      </div>
    </PageShell>
  )
}
