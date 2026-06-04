"use client"

import { useMemo } from "react"
import { Activity, AlertTriangle, Bell, CheckCircle2, Clock, Mail, MessageSquare, XCircle } from "lucide-react"
import type { AlertEvent, MonitorRun, MonitorStatus } from "@/lib/pulse-types"
import { cn } from "@workspace/ui/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@workspace/ui/components/empty"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@workspace/ui/components/chart"
import { Separator } from "@workspace/ui/components/separator"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ComposedChart, Line, BarChart, Bar } from "recharts"

export type ConsoleView =
  | "dashboard"
  | "applications"
  | "application-detail"
  | "monitors"
  | "builder"
  | "runs"
  | "run-detail"
  | "alerts"
  | "alert-detail"
  | "secrets"
  | "settings"

const statusTone: Record<MonitorStatus, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300",
  failed: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300",
  timeout: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300",
  error: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300",
  skipped: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300",
}

export function normalizeStatus(status: string) {
  return status.toLowerCase()
}

export function isSuccessStatus(status: string) {
  return normalizeStatus(status) === "success"
}

export function isFailedStatus(status: string) {
  return normalizeStatus(status) === "failed"
}

export function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value))
  } catch {
    return "Never"
  }
}

export function StatusPill({ status }: { status: MonitorStatus }) {
  const norm = (status || "skipped").toLowerCase() as MonitorStatus
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium capitalize", statusTone[norm] || statusTone.skipped)}>
      {norm === "success" ? <CheckCircle2 className="size-3" /> : norm === "failed" ? <XCircle className="size-3" /> : <Clock className="size-3" />}
      {norm}
    </span>
  )
}

export function AlertStatusPill({ status }: { status: AlertEvent["status"] }) {
  const norm = (status || "open").toLowerCase()
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold capitalize",
      norm === "open"
        ? "border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-300"
        : norm === "resolved"
          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300"
          : norm === "acknowledged"
            ? "border-blue-500/20 bg-blue-500/5 text-blue-700 dark:text-blue-300"
            : "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300"
    )}>
      {norm === "resolved" ? <CheckCircle2 className="size-3" /> : norm === "open" ? <AlertTriangle className="size-3" /> : <Clock className="size-3" />}
      {norm}
    </span>
  )
}

export function DeliveryStatusPill({ status }: { status: string }) {
  const norm = (status || "unknown").toLowerCase()
  return (
    <span className={cn(
      "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase",
      norm === "sent"
        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300"
        : norm === "failed"
          ? "border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-300"
          : norm === "suppressed"
            ? "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300"
            : "border-border bg-muted/40 text-muted-foreground"
    )}>
      {norm}
    </span>
  )
}

export function channelIcon(channel: string) {
  const norm = channel.toLowerCase()
  if (norm.includes("slack")) return MessageSquare
  if (norm.includes("email")) return Mail
  return Bell
}

export function PageShell({ 
  children, 
  eyebrow, 
  title, 
  description, 
  action 
}: { 
  children: React.ReactNode
  eyebrow: string
  title: string
  description?: string
  action?: React.ReactNode 
}) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full">
      <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 lg:px-8 gap-3 bg-background">
        <div className="flex items-center gap-2 min-w-0">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="min-w-0">
            <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">{eyebrow}</p>
            <h1 className="font-heading text-lg font-bold tracking-tight truncate leading-tight">{title}</h1>
            {description && <p className="text-muted-foreground text-xs font-medium mt-0.5 truncate hidden md:block">{description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
        </div>
      </header>
      <div className="flex-1 overflow-auto px-4 py-6 lg:px-8 bg-muted/10">{children}</div>
    </div>
  )
}

export function Metric({ 
  label, 
  value, 
  icon: Icon, 
  detail, 
  trend,
  className,
  onClick
}: { 
  label: string; 
  value: string; 
  detail: string; 
  icon: typeof Activity;
  trend?: { text: string; positive: boolean };
  className?: string;
  onClick?: () => void
}) {
  return (
    <Card 
      className={cn(className, onClick && "cursor-pointer hover:bg-muted/10 transition-colors select-none")}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-semibold text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-heading">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {trend && (
            <span className={cn("font-semibold mr-1.5", trend.positive ? "text-emerald-600" : "text-rose-600")}>
              {trend.text}
            </span>
          )}
          {detail}
        </p>
      </CardContent>
    </Card>
  )
}

const chartConfig = {
  duration: {
    label: "Latency (ms)",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig

export function LatencyChart({ runs }: { runs: MonitorRun[] }) {
  const chartData = useMemo(() => {
    // Take last 12 runs, reverse so they are chronological, and map to name/value format
    return [...runs]
      .slice(0, 12)
      .reverse()
      .map((run) => ({
        time: formatDate(run.startedAt),
        duration: run.durationMs,
        name: run.monitorName,
      }))
  }, [runs])

  if (chartData.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[240px] items-center justify-center p-6">
          <Empty className="border-0 bg-transparent py-4">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-semibold">No data points available</EmptyTitle>
              <EmptyDescription className="text-xs">
                Run monitor checks to populate response time trends.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold">Response Time Trend</CardTitle>
          <CardDescription>Response time of consecutive manual & scheduled executions</CardDescription>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-semibold shrink-0 mt-1">
          <span className="size-2 rounded-full bg-primary" />
          <span>Response time</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[180px] w-full mt-2">
          <ChartContainer config={chartConfig} className="h-full w-full">
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{
                left: -10,
                right: 5,
                top: 5,
                bottom: 5,
              }}
            >
              <CartesianGrid vertical={false} className="stroke-border/50" />
              <XAxis
                dataKey="time"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => {
                  const parts = value.split(",")
                  return parts.length > 1 ? parts[1].trim() : value
                }}
              />
              <YAxis
                type="number"
                domain={[0, "auto"]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => `${value}ms`}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <defs>
                <linearGradient id="fillDuration" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-duration)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-duration)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <Area
                dataKey="duration"
                type="natural"
                fill="url(#fillDuration)"
                fillOpacity={0.4}
                stroke="var(--color-duration)"
                strokeWidth={2}
                stackId="a"
              />
            </AreaChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export function Section({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: React.ReactNode }) {
  return (
    <section className="border-border bg-card rounded-md border p-4">
      <h2 className="font-heading mb-4 flex items-center gap-2 text-base font-semibold">
        <Icon className="size-4" />
        {title}
      </h2>
      {children}
    </section>
  )
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  )
}

export function MonitorRunsChart({ runs }: { runs: MonitorRun[] }) {
  type StepSeries = {
    key: `step${number}`
    label: string
    color: string
  }

  type RunChartPoint = {
    label: string
    runId: string
    status: string
    triggeredBy: string
    overall: number
  } & Record<`step${number}`, number | undefined>

  const sortedRuns = useMemo(() => {
    return [...runs].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
  }, [runs])

  const visibleRuns = useMemo(() => sortedRuns.slice(-20), [sortedRuns])

  const stepSeries = useMemo<StepSeries[]>(() => {
    const names: string[] = []
    for (const run of visibleRuns) {
      for (const step of run.steps || []) {
        const name = step.stepName || step.stepId || "Unnamed step"
        if (!names.includes(name)) {
          names.push(name)
        }
      }
    }

    const colors = [
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
      "var(--chart-5)",
    ]

    return names.slice(0, 5).map((label, index) => ({
      key: `step${index + 1}` as `step${number}`,
      label,
      color: colors[index % colors.length] || "var(--chart-1)",
    }))
  }, [visibleRuns])

  const chartData = useMemo(() => {
    return visibleRuns.map((run, index) => {
      const dataPoint: RunChartPoint = {
        label: `Run ${index + 1}`,
        runId: run.id,
        status: run.status,
        triggeredBy: run.triggeredBy,
        overall: run.durationMs,
      }

      for (const series of stepSeries) {
        const step = run.steps?.find((item) => (item.stepName || item.stepId || "Unnamed step") === series.label)
        dataPoint[series.key] = step?.latencyMs
      }

      return dataPoint
    })
  }, [visibleRuns, stepSeries])

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {
      overall: {
        label: "Total latency",
        color: "var(--chart-2)",
      },
    }

    for (const series of stepSeries) {
      config[series.key] = {
        label: series.label,
        color: series.color,
      }
    }

    return config
  }, [stepSeries])

  const outcomeConfig = {
    success: {
      label: "Success",
      color: "var(--chart-2)",
    },
    failed: {
      label: "Failed",
      color: "var(--destructive)",
    },
    other: {
      label: "Other",
      color: "var(--chart-4)",
    },
  } satisfies ChartConfig

  const metrics = useMemo(() => {
    const total = runs.length
    const success = runs.filter((run) => isSuccessStatus(run.status)).length
    const failed = runs.filter((run) => isFailedStatus(run.status)).length
    const other = Math.max(total - success - failed, 0)
    const durations = runs.map((run) => run.durationMs).filter((duration) => Number.isFinite(duration)).sort((a, b) => a - b)
    const avg = durations.length ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length) : 0
    const p50Index = durations.length ? Math.ceil(durations.length * 0.50) - 1 : 0
    const p95Index = durations.length ? Math.ceil(durations.length * 0.95) - 1 : 0
    const p99Index = durations.length ? Math.ceil(durations.length * 0.99) - 1 : 0
    const p50 = durations.length ? durations[Math.max(0, Math.min(p50Index, durations.length - 1))] : 0
    const p95 = durations.length ? durations[Math.max(0, Math.min(p95Index, durations.length - 1))] : 0
    const p99 = durations.length ? durations[Math.max(0, Math.min(p99Index, durations.length - 1))] : 0
    const peak = durations.length ? durations[durations.length - 1] : 0
    const successRate = total ? Math.round((success / total) * 100) : 100
    const latest = [...runs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]
    const newestFirst = [...runs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    let consecutiveFailures = 0
    for (const run of newestFirst) {
      if (isSuccessStatus(run.status)) break
      consecutiveFailures += 1
    }
    const manual = runs.filter((run) => run.triggeredBy === "manual").length
    const scheduled = Math.max(total - manual, 0)

    return { total, success, failed, other, avg, p50, p95, p99, peak, successRate, latest, consecutiveFailures, manual, scheduled }
  }, [runs])

  const outcomeData = useMemo(() => {
    return [
      { status: "Success", count: metrics.success, fill: "var(--color-success)" },
      { status: "Failed", count: metrics.failed, fill: "var(--color-failed)" },
      { status: "Other", count: metrics.other, fill: "var(--color-other)" },
    ]
  }, [metrics])

  const stepMetrics = useMemo(() => {
    const byName = new Map<string, { label: string; total: number; count: number; max: number; failures: number }>()

    for (const run of runs) {
      for (const step of run.steps || []) {
        const label = step.stepName || step.stepId || "Unnamed step"
        const current = byName.get(label) || { label, total: 0, count: 0, max: 0, failures: 0 }
        current.total += step.latencyMs
        current.count += 1
        current.max = Math.max(current.max, step.latencyMs)
        if (!isSuccessStatus(step.status)) {
          current.failures += 1
        }
        byName.set(label, current)
      }
    }

    return Array.from(byName.values())
      .map((item) => ({
        label: item.label,
        avg: Math.round(item.total / Math.max(item.count, 1)),
        max: item.max,
        failures: item.failures,
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 6)
  }, [runs])

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[240px] items-center justify-center p-6">
          <Empty className="border-0 bg-transparent py-4">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-semibold">No runs data available</EmptyTitle>
              <EmptyDescription className="text-xs">
                Run this monitor to display performance breakdown.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    )
  }

  const slowestStep = stepMetrics[0]
  const maxStepAverage = Math.max(...stepMetrics.map((step) => step.avg), 1)
  const renderLatencyTooltip = ({
    active,
    payload,
  }: {
    active?: boolean
    payload?: readonly {
      color?: string
      dataKey?: unknown
      name?: unknown
      payload?: unknown
      value?: unknown
    }[]
  }) => {
    if (!active || !payload?.length) {
      return null
    }

    const run = payload[0]?.payload as RunChartPoint | undefined
    const visiblePayload = payload.filter((item) => item.value !== undefined && item.value !== null)

    return (
      <div className="min-w-48 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-xl">
        {run ? (
          <div className="mb-2 border-b border-border/60 pb-2">
            <div className="font-mono text-[11px] font-semibold text-foreground">{run.runId}</div>
            <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold uppercase text-muted-foreground">
              <span>{run.status}</span>
              <span>{run.triggeredBy}</span>
            </div>
          </div>
        ) : null}
        <div className="space-y-1.5">
          {visiblePayload.map((item) => {
            const key = String(item.dataKey ?? item.name ?? "value")
            const label = chartConfig[key]?.label ?? String(item.name ?? key)
            const value = typeof item.value === "number" ? item.value : Number(item.value)
            return (
              <div key={key} className="flex items-center justify-between gap-4">
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color || chartConfig[key]?.color || "var(--primary)" }} />
                  <span className="truncate">{label}</span>
                </span>
                <span className="shrink-0 font-mono font-semibold text-foreground">
                  {Number.isFinite(value) ? `${value.toLocaleString()}ms` : `${item.value}ms`}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="py-4">
          <CardContent className="space-y-1 px-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Success rate</p>
            <div className="flex items-end justify-between gap-3">
              <span className={cn("font-heading text-2xl font-bold", metrics.successRate >= 95 ? "text-emerald-600 dark:text-emerald-400" : metrics.successRate >= 80 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400")}>
                {metrics.successRate}%
              </span>
              <span className="text-xs font-semibold text-muted-foreground">{metrics.success}/{metrics.total} passed</span>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4 md:col-span-2">
          <CardContent className="space-y-2 px-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Latency percentiles</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] text-muted-foreground">p50</p>
                <p className="font-heading text-xl font-bold">{metrics.p50}ms</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">p95</p>
                <p className="font-heading text-xl font-bold">{metrics.p95}ms</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">p99</p>
                <p className="font-heading text-xl font-bold">{metrics.p99}ms</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">avg {metrics.avg}ms · peak {metrics.peak}ms</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="space-y-1 px-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current streak</p>
            <div className="flex items-end justify-between gap-3">
              <span className={cn("font-heading text-2xl font-bold", metrics.consecutiveFailures > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                {metrics.consecutiveFailures > 0 ? `${metrics.consecutiveFailures} fail` : "Healthy"}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">{metrics.latest ? formatDate(metrics.latest.startedAt) : "Never"}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="space-y-1 px-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Slowest step</p>
            <div className="flex items-end justify-between gap-3">
              <span className="min-w-0 truncate font-heading text-xl font-bold" title={slowestStep?.label}>
                {slowestStep?.label || "No steps"}
              </span>
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">{slowestStep ? `${slowestStep.avg}ms avg` : "0ms"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-0.5">
            <CardTitle className="text-sm font-semibold">Latency trend</CardTitle>
            <CardDescription>Last {chartData.length} runs with total latency and up to five step series.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: "var(--color-overall)" }} />
              <span>Total ({chartData[chartData.length - 1]?.overall ?? 0}ms)</span>
            </div>
            {stepSeries.map((series) => {
              const latestVal = chartData[chartData.length - 1]?.[series.key] ?? 0
              return (
                <div key={series.key} className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ backgroundColor: `var(--color-${series.key})` }} />
                  <span className="max-w-[160px] truncate" title={series.label}>{series.label} ({latestVal}ms)</span>
                </div>
              )
            })}
          </div>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <ComposedChart
              accessibilityLayer
              data={chartData}
              margin={{ left: 18, right: 12, top: 12, bottom: 6 }}
            >
              <CartesianGrid vertical={false} className="stroke-border/50" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                width={72}
                type="number"
                domain={[0, "auto"]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => `${Number(value).toLocaleString()}ms`}
              />
              <ChartTooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={renderLatencyTooltip}
                wrapperStyle={{ zIndex: 20, pointerEvents: "none" }}
              />
              <defs>
                <linearGradient id="fillMonitorOverall" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-overall)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--color-overall)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="overall"
                fill="url(#fillMonitorOverall)"
                stroke="var(--color-overall)"
                strokeWidth={2.5}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
              {stepSeries.map((series) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  stroke={`var(--color-${series.key})`}
                  strokeWidth={1.8}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              ))}
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Run outcomes</CardTitle>
            <CardDescription>Pass/fail distribution across stored runs.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={outcomeConfig} className="h-[220px] w-full">
              <BarChart accessibilityLayer data={outcomeData} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} className="stroke-border/50" />
                <XAxis dataKey="status" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-muted-foreground">
              <div className="rounded-md border bg-muted/20 px-3 py-2">Manual: <span className="text-foreground">{metrics.manual}</span></div>
              <div className="rounded-md border bg-muted/20 px-3 py-2">Scheduled: <span className="text-foreground">{metrics.scheduled}</span></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Step performance</CardTitle>
            <CardDescription>Average latency, peak latency, and failure count by step.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stepMetrics.length === 0 ? (
              <Empty className="border-0 bg-transparent py-4">
                <EmptyHeader>
                  <EmptyTitle className="text-sm font-semibold">No step metrics available</EmptyTitle>
                  <EmptyDescription className="text-xs">Runs without step details only show total latency.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              stepMetrics.map((step) => (
                <div key={step.label} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-semibold text-foreground" title={step.label}>{step.label}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">
                      avg {step.avg}ms · max {step.max}ms · {step.failures} failed
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", step.failures > 0 ? "bg-rose-500" : "bg-primary")}
                      style={{ width: `${Math.max(6, Math.round((step.avg / maxStepAverage) * 100))}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
