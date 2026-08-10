"use client"

import { Card, Description } from "@workspace/ui/components/ui"
import type { Monitor } from "@/lib/pulse-types"

export function SchedulerStatusCard({ monitors }: { monitors: Monitor[] }) {
  const activeCount = monitors.filter((m) => m.isActive && m.scheduleMode !== "manual").length

  return (
    <Card>
      <Card.Content className="flex items-center justify-between py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
            </span>
            <span className="text-sm font-medium">Scheduler Status</span>
          </div>
          <Description className="text-xs">
            {activeCount} active scheduled monitor{activeCount === 1 ? "" : "s"}
          </Description>
        </div>
        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 rounded-full border border-emerald-200/30">
          HEALTHY
        </span>
      </Card.Content>
    </Card>
  )
}
