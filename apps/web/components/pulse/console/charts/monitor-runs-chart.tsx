"use client"

import { useMemo } from "react"
import { Activity, AlertTriangle, Clock, LineChart } from "lucide-react"
import type { MonitorRun } from "@/lib/pulse-types"
import { cn } from "@workspace/ui/lib/utils"
import { Card as HeroCard, Chip, Description, EmptyState } from "@heroui/react"
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@workspace/ui/components/chart"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ComposedChart, Line, BarChart, Bar, Cell } from "recharts"
import { formatDate, isFailedStatus, isSuccessStatus } from "../layout/status-utils"
import { PULSE_CHART_COLORS, CHART_CONTAINER_CLASS, CHART_CONTAINER_SM_CLASS } from "./chart-constants"

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

    return names.slice(0, 5).map((label, index) => ({
      key: `step${index + 1}` as `step${number}`,
      label,
      color: PULSE_CHART_COLORS.series[index % PULSE_CHART_COLORS.series.length]!,
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
        color: PULSE_CHART_COLORS.accent,
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
      color: PULSE_CHART_COLORS.success,
    },
    failed: {
      label: "Failed",
      color: PULSE_CHART_COLORS.danger,
    },
    other: {
      label: "Other",
      color: PULSE_CHART_COLORS.warning,
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
      { status: "Success", count: metrics.success, fill: PULSE_CHART_COLORS.success },
      { status: "Failed", count: metrics.failed, fill: PULSE_CHART_COLORS.danger },
      { status: "Other", count: metrics.other, fill: PULSE_CHART_COLORS.warning },
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
      <HeroCard>
        <HeroCard.Content className="flex h-[240px] items-center justify-center p-6">
          <EmptyState className="flex flex-col items-center justify-center gap-2 border-0 bg-transparent py-4 text-center">
            <LineChart className="size-6 text-muted" aria-hidden />
            <p className="text-sm font-semibold text-foreground">No runs data available</p>
            <Description className="text-xs">
              Run this monitor to display performance breakdown.
            </Description>
          </EmptyState>
        </HeroCard.Content>
      </HeroCard>
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
          <div className="mb-2 pb-2">
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
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <HeroCard >
          <div className="p-4 flex flex-col gap-3 h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                Latency percentiles
              </span>
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/5 text-primary border border-primary/10 shrink-0">
                <Clock className="size-3.5" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg bg-muted/5 border border-border/10 px-2 py-1.5 text-center">
                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase">p50</span>
                <p className="font-heading text-xs font-bold text-foreground mt-0.5">{metrics.p50}ms</p>
              </div>
              <div className="flex-1 rounded-lg bg-muted/5 border border-border/10 px-2 py-1.5 text-center">
                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase">p95</span>
                <p className="font-heading text-xs font-bold text-warning mt-0.5">{metrics.p95}ms</p>
              </div>
              <div className="flex-1 rounded-lg bg-muted/5 border border-border/10 px-2 py-1.5 text-center">
                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase">p99</span>
                <p className="font-heading text-xs font-bold text-danger mt-0.5">{metrics.p99}ms</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold pt-2 border-t border-border/10 mt-auto">
              <span>avg <strong className="text-foreground font-bold">{metrics.avg}ms</strong></span>
              <span>peak <strong className="text-foreground font-bold">{metrics.peak}ms</strong></span>
            </div>
          </div>
        </HeroCard>

        <HeroCard >
          <div className="p-4 flex flex-col gap-3 h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                Current streak
              </span>
              <div className={cn(
                "flex size-6 items-center justify-center rounded-md border shrink-0",
                metrics.consecutiveFailures > 0 
                  ? "bg-danger/5 text-danger border-danger/10" 
                  : "bg-success/5 text-success border-success/10"
              )}>
                <Activity className="size-3.5" />
              </div>
            </div>

            <div className="flex flex-col justify-center min-h-[36px]">
              <p
                className={cn(
                  "font-heading text-lg font-bold tracking-tight",
                  metrics.consecutiveFailures > 0 ? "text-danger" : "text-success"
                )}
              >
                {metrics.consecutiveFailures > 0 ? `${metrics.consecutiveFailures} consecutive fail` : "Healthy"}
              </p>
            </div>

            <div className="text-[11px] text-muted-foreground font-semibold pt-2 border-t border-border/10 mt-auto truncate">
              {metrics.latest ? `Last run ${formatDate(metrics.latest.startedAt)}` : "No runs yet"}
            </div>
          </div>
        </HeroCard>

        <HeroCard >
          <div className="p-4 flex flex-col gap-3 h-full min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                Slowest step
              </span>
              <div className="flex size-6 items-center justify-center rounded-md bg-warning/5 text-warning border border-warning/10 shrink-0">
                <AlertTriangle className="size-3.5" />
              </div>
            </div>

            <div className="flex flex-col justify-center min-h-[36px] min-w-0">
              <p className="truncate font-heading text-sm font-bold text-foreground" title={slowestStep?.label}>
                {slowestStep?.label || "No steps"}
              </p>
            </div>

            {slowestStep ? (
              <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold pt-2 border-t border-border/10 mt-auto">
                <span>avg <strong className="text-foreground font-bold">{slowestStep.avg}ms</strong></span>
                <span>peak <strong className="text-foreground font-bold">{slowestStep.max}ms</strong></span>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground pt-2 border-t border-border/10 mt-auto">—</div>
            )}
          </div>
        </HeroCard>
      </div>

      <HeroCard>
        <HeroCard.Header className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <HeroCard.Title className="text-sm font-semibold">Latency trend</HeroCard.Title>
            <Description>Last {chartData.length} runs with total latency and up to five step series.</Description>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip size="sm" variant="soft" className="gap-1.5">
              <span className="size-2 rounded-full bg-accent" />
              <Chip.Label>Total · {chartData[chartData.length - 1]?.overall ?? 0}ms</Chip.Label>
            </Chip>
            {stepSeries.map((series) => {
              const latestVal = chartData[chartData.length - 1]?.[series.key] ?? 0
              return (
                <Chip key={series.key} size="sm" variant="soft" className="max-w-[200px] gap-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: series.color }} />
                  <Chip.Label className="truncate" title={series.label}>
                    {series.label} · {latestVal}ms
                  </Chip.Label>
                </Chip>
              )
            })}
          </div>
        </HeroCard.Header>
        <HeroCard.Content className="overflow-visible">
          <ChartContainer config={chartConfig} className={CHART_CONTAINER_CLASS}>
            <ComposedChart
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
                cursor={{ stroke: PULSE_CHART_COLORS.accent, strokeOpacity: 0.35, strokeWidth: 1 }}
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
        </HeroCard.Content>
      </HeroCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <HeroCard>
          <HeroCard.Header className="pb-3">
            <HeroCard.Title className="text-sm font-semibold">Run outcomes</HeroCard.Title>
            <Description>Pass/fail distribution across stored runs.</Description>
          </HeroCard.Header>
          <HeroCard.Content className="gap-4">
            <ChartContainer config={outcomeConfig} className={CHART_CONTAINER_SM_CLASS}>
              <BarChart data={outcomeData} margin={{ left: -8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} className="stroke-separator" />
                <XAxis dataKey="status" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={32} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel indicator="dot" />} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {outcomeData.map((entry) => (
                    <Cell key={entry.status} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-separator bg-background px-3 py-2 text-xs">
                <Description>Manual</Description>
                <p className="font-semibold text-foreground">{metrics.manual}</p>
              </div>
              <div className="rounded-lg border border-separator bg-background px-3 py-2 text-xs">
                <Description>Scheduled</Description>
                <p className="font-semibold text-foreground">{metrics.scheduled}</p>
              </div>
            </div>
          </HeroCard.Content>
        </HeroCard>

        <HeroCard>
          <HeroCard.Header className="pb-3">
            <HeroCard.Title className="text-sm font-semibold">Step performance</HeroCard.Title>
            <Description>Average latency, peak latency, and failure count by step.</Description>
          </HeroCard.Header>
          <HeroCard.Content className="gap-4">
            {stepMetrics.length === 0 ? (
              <EmptyState className="flex flex-col items-center justify-center gap-2 border-0 bg-transparent py-6 text-center">
                <LineChart className="size-6 text-muted" aria-hidden />
                <p className="text-sm font-semibold text-foreground">No step metrics available</p>
                <Description className="text-xs">Runs without step details only show total latency.</Description>
              </EmptyState>
            ) : (
              stepMetrics.map((step, index) => (
                <div key={step.label} className="space-y-2">
                  <div className="flex items-start justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate font-semibold text-foreground" title={step.label}>
                      {step.label}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      {step.failures > 0 ? (
                        <Chip size="sm" variant="soft" className="bg-danger/10 text-danger">
                          <Chip.Label>{step.failures} failed</Chip.Label>
                        </Chip>
                      ) : null}
                      <span className="font-mono text-muted">
                        {step.avg}ms avg · {step.max}ms max
                      </span>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-separator/60">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(8, Math.round((step.avg / maxStepAverage) * 100))}%`,
                        backgroundColor:
                          step.failures > 0
                            ? PULSE_CHART_COLORS.danger
                            : PULSE_CHART_COLORS.series[index % PULSE_CHART_COLORS.series.length],
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </HeroCard.Content>
        </HeroCard>
      </div>
    </div>
  )
}

