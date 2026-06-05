"use client"

import { AlertTriangle, CheckCircle2, Timer } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

export function ValidationResultPill({ status }: { status: string }) {
  const normalized = (status || "incomplete").toLowerCase()
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold capitalize",
      normalized === "pass"
        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300"
        : normalized === "fail"
          ? "border-rose-500/25 bg-rose-500/5 text-rose-600 dark:text-rose-300"
          : normalized === "warning"
            ? "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300"
            : "border-border bg-muted/40 text-muted-foreground"
    )}>
      {normalized === "pass" ? <CheckCircle2 className="size-3" /> : normalized === "fail" ? <AlertTriangle className="size-3" /> : <Timer className="size-3" />}
      {normalized}
    </span>
  )
}
