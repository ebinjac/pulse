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

const chartConfig = {
  duration: {
    label: "Latency (ms)",
    color: "oklch(0.544 0.1704 253.5)",
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
      <HeroCard>
        <HeroCard.Content className="flex h-[240px] items-center justify-center p-6">
          <EmptyState className="flex h-full w-full flex-col items-center justify-center gap-2 border-0 bg-transparent py-4 text-center">
            <p className="text-sm font-semibold">No data points available</p>
            <Description className="text-xs">Run monitor checks to populate response time trends.</Description>
          </EmptyState>
        </HeroCard.Content>
      </HeroCard>
    )
  }

  return (
    <HeroCard>
      <HeroCard.Header className="flex flex-row items-start justify-between">
        <div className="space-y-1">
          <HeroCard.Title className="text-sm font-semibold">Response Time Trend</HeroCard.Title>
          <Description>Response time of consecutive manual & scheduled executions</Description>
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <span className="size-2 rounded-full bg-accent" />
          <span>Response time</span>
        </div>
      </HeroCard.Header>
      <HeroCard.Content className="overflow-visible">
        <div className="h-[200px] w-full mt-2">
          <ChartContainer config={chartConfig} className="h-full w-full [&_svg]:outline-none [&_rect]:outline-none">
            <AreaChart
              data={chartData}
              margin={{
                left: 12,
                right: 12,
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
                width={50}
                tickFormatter={(value) => `${value}ms`}
              />
              <ChartTooltip
                cursor={{ stroke: "var(--color-duration)", strokeOpacity: 0.4 }}
                content={<ChartTooltipContent hideLabel indicator="line" />}
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
      </HeroCard.Content>
    </HeroCard>
  )
}
