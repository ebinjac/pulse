"use client"

import { Cell, Pie, PieChart } from "recharts"
import type { SLOSummary } from "@/lib/pulse-types"
import { formatUptimePct } from "@/lib/pulse-slo"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@workspace/ui/components/chart"
import { cn } from "@workspace/ui/lib/utils"

const budgetChartConfig = {
  remaining: { label: "Remaining", color: "var(--chart-2)" },
  consumed: { label: "Consumed", color: "var(--destructive)" },
} satisfies ChartConfig

export function ErrorBudgetWidget({ summary }: { summary: SLOSummary | null }) {
  if (!summary) {
    return null
  }

  const budget = summary.errorBudget
  const remaining = Math.max(0, Math.min(100, budget.errorBudgetRemainingPct ?? 0))
  const allowedDowntime = budget.allowedDowntimeMinutes30d ?? 0
  const consumedDowntime = budget.consumedDowntimeMinutes30d ?? 0
  const consumed = Math.max(0, 100 - remaining)
  const chartData = [
    { name: "remaining", value: remaining, fill: "var(--color-remaining)" },
    { name: "consumed", value: consumed, fill: "var(--color-consumed)" },
  ]

  const onTarget = budget.actualUptime30dPct >= budget.targetUptimePct

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-base font-semibold">SLO error budget (30d)</CardTitle>
        <CardDescription>
          Target {budget.targetUptimePct}% uptime vs {formatUptimePct(budget.actualUptime30dPct)} actual across production runs.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5 md:grid-cols-[180px_1fr] items-center">
        <ChartContainer config={budgetChartConfig} className="mx-auto aspect-square h-[180px] w-[180px]" initialDimension={{ width: 180, height: 180 }}>
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={72}
              strokeWidth={2}
            />
            <text x="50%" y="48%" textAnchor="middle" className="fill-foreground text-lg font-bold">
              {remaining.toFixed(0)}%
            </text>
            <text x="50%" y="58%" textAnchor="middle" className="fill-muted-foreground text-[10px]">
              budget left
            </text>
          </PieChart>
        </ChartContainer>
        <div className="space-y-3 text-sm">
          <div className={cn(
            "rounded-md border px-3 py-2 text-xs font-semibold",
            onTarget
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
              : "border-rose-500/20 bg-rose-500/5 text-rose-700 dark:text-rose-300"
          )}>
            {onTarget ? "Within SLO target" : "Error budget burning"}
          </div>
          <dl className="grid gap-2 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Allowed downtime (30d)</dt>
              <dd className="font-semibold">{allowedDowntime.toFixed(1)} min</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Consumed downtime (30d)</dt>
              <dd className="font-semibold">{consumedDowntime.toFixed(1)} min</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Global p95 latency (30d)</dt>
              <dd className="font-semibold">{summary.globalLatency30d.p95Ms || 0}ms</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Production runs (30d)</dt>
              <dd className="font-semibold">{summary.global.totalRuns}</dd>
            </div>
          </dl>
        </div>
      </CardContent>
    </Card>
  )
}

export function SLOPercentileStrip({
  title,
  runLatency,
  stepLatency,
}: {
  title: string
  runLatency: { p50Ms: number; p95Ms: number; p99Ms: number }
  stepLatency?: { p50Ms: number; p95Ms: number; p99Ms: number }
}) {
  return (
    <div className="rounded-md border bg-muted/10 p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <p className="text-muted-foreground">p50</p>
          <p className="font-bold">{runLatency.p50Ms}ms</p>
        </div>
        <div>
          <p className="text-muted-foreground">p95</p>
          <p className="font-bold">{runLatency.p95Ms}ms</p>
        </div>
        <div>
          <p className="text-muted-foreground">p99</p>
          <p className="font-bold">{runLatency.p99Ms}ms</p>
        </div>
      </div>
      {stepLatency ? (
        <p className="text-[11px] text-muted-foreground text-center">
          Step latency p95: {stepLatency.p95Ms}ms
        </p>
      ) : null}
    </div>
  )
}
