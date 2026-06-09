"use client"

import { AlertTriangle, Bell, CheckCircle2, Clock, Mail, MessageSquare, XCircle } from "lucide-react"
import type { AlertEvent, MonitorStatus } from "@/lib/pulse-types"
import { cn } from "@workspace/ui/lib/utils"
import { statusTone } from "./status-utils"

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
