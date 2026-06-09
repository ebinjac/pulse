"use client"

import { formatDate } from "@/components/pulse/console-shared"
import { Card, Chip, Description } from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, FileCheck2, Loader2, PauseCircle, TimerReset } from "lucide-react"
import type { PhaseRow, PhaseStatus } from "./deployment-detail-utils"

const STATUS_LABELS: Record<PhaseStatus, string> = {
  pending: "Pending",
  running: "Running",
  done: "Done",
  skipped: "Skipped",
  insufficient: "Insufficient data",
  ready: "Ready",
}

const STATUS_CLASS: Record<PhaseStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-primary/10 text-primary",
  done: "bg-success/10 text-success",
  skipped: "bg-muted text-muted-foreground",
  insufficient: "bg-warning/10 text-warning",
  ready: "bg-foreground/10 text-foreground",
}

const STATUS_BAR_CLASS: Record<PhaseStatus, string> = {
  pending: "bg-muted-foreground/30",
  running: "bg-primary",
  done: "bg-success",
  skipped: "bg-muted-foreground/30",
  insufficient: "bg-warning",
  ready: "bg-foreground",
}

const STATUS_ICON = {
  pending: CircleDashed,
  running: Loader2,
  done: CheckCircle2,
  skipped: PauseCircle,
  insufficient: AlertTriangle,
  ready: Clock3,
} satisfies Record<PhaseStatus, typeof CheckCircle2>

const PHASE_ICON: Record<PhaseRow["id"], typeof CheckCircle2> = {
  baseline: TimerReset,
  post: Loader2,
  logs: AlertTriangle,
  report: FileCheck2,
}

export function DeploymentPhaseTable({ phases }: { phases: PhaseRow[] }) {
  const totals = phases.reduce(
    (acc, phase) => {
      acc.current += Math.min(phase.progressCurrent, phase.progressTotal || phase.progressCurrent)
      acc.total += phase.progressTotal
      return acc
    },
    { current: 0, total: 0 },
  )
  const overallPct = totals.total > 0 ? Math.min(100, Math.round((totals.current / totals.total) * 100)) : 0
  const runningPhase = phases.find((phase) => phase.status === "running")
  const doneCount = phases.filter((phase) => phase.status === "done" || phase.status === "skipped").length

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <Card.Header className="border-b border-border/40 p-4">
        <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Card.Title className="text-sm font-semibold">Phase status</Card.Title>
            <Card.Description>Live progress for each step of this deployment check.</Card.Description>
          </div>
          <div className="min-w-[220px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">
                {runningPhase ? `${runningPhase.label} running` : `${doneCount}/${phases.length} phases complete`}
              </span>
              <span className="font-semibold text-foreground">{overallPct}%</span>
            </div>
            <ProgressBar value={overallPct} label="Overall deployment check progress" className="mt-2" tone={runningPhase ? "running" : overallPct === 100 ? "done" : "ready"} />
          </div>
        </div>
      </Card.Header>
      <Card.Content className="p-4">
        <div className="grid gap-3 xl:grid-cols-4">
          {phases.map((phase, index) => (
            <PhaseCard key={phase.id} phase={phase} index={index} />
          ))}
        </div>
      </Card.Content>
    </Card>
  )
}

function PhaseCard({ phase, index }: { phase: PhaseRow; index: number }) {
  const progressPct =
    phase.progressTotal > 0
      ? Math.min(100, Math.round((phase.progressCurrent / phase.progressTotal) * 100))
      : phase.status === "skipped"
        ? 100
        : 0
  const PhaseIcon = PHASE_ICON[phase.id] || FileCheck2
  const StatusIcon = STATUS_ICON[phase.status]
  const isRunning = phase.status === "running"

  return (
    <div className={cn(
      "relative overflow-hidden rounded-lg border bg-background p-4 transition-colors",
      isRunning ? "border-primary/35 bg-primary/[0.03]" : "border-border/60",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full border",
            phase.status === "done" ? "border-success/20 bg-success/10 text-success" :
              phase.status === "running" ? "border-primary/20 bg-primary/10 text-primary" :
                phase.status === "insufficient" ? "border-warning/20 bg-warning/10 text-warning" :
                  "border-border bg-muted/40 text-muted-foreground",
          )}>
            <PhaseIcon className={cn("size-4", isRunning ? "animate-pulse" : "")} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">Step {index + 1}</div>
            <div className="mt-0.5 truncate text-sm font-semibold text-foreground" title={phase.label}>
              {phase.label}
            </div>
          </div>
        </div>
        <Chip size="sm" variant="soft" className={cn("shrink-0 gap-1 text-[10px] font-semibold", STATUS_CLASS[phase.status])}>
          <StatusIcon className={cn("size-3", isRunning ? "animate-spin" : "")} aria-hidden />
          <Chip.Label>{STATUS_LABELS[phase.status]}</Chip.Label>
        </Chip>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">
            {phase.progressTotal > 0 ? `${phase.progressCurrent}/${phase.progressTotal}` : "No samples"}
          </span>
          <span className="font-semibold text-muted-foreground">{progressPct}%</span>
        </div>
        <ProgressBar value={progressPct} label={`${phase.label} progress`} tone={phase.status} />
      </div>

      <Description className="mt-3 line-clamp-2 min-h-9 text-xs">{phase.detail}</Description>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/50 pt-3 text-[11px]">
        <TimeStat label="Started" value={phase.startedAt ? formatDate(phase.startedAt) : "Not started"} />
        <TimeStat label="Completed" value={phase.completedAt ? formatDate(phase.completedAt) : "Pending"} />
      </div>
    </div>
  )
}

function ProgressBar({ value, label, tone, className }: { value: number; label: string; tone: PhaseStatus | "running" | "done" | "ready"; className?: string }) {
  const normalized = Math.max(0, Math.min(100, value))
  const barClass = tone === "running" || tone === "done" || tone === "ready"
    ? STATUS_BAR_CLASS[tone]
    : STATUS_BAR_CLASS[tone]

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={normalized}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", barClass)}
        style={{ width: `${normalized}%` }}
      />
    </div>
  )
}

function TimeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium text-foreground" title={value}>{value}</div>
    </div>
  )
}
