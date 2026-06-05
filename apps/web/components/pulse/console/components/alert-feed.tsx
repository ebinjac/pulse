"use client"

import Link from "next/link"
import { Bell } from "lucide-react"
import type { AlertEvent } from "@/lib/pulse-types"
import { formatDate } from "@/components/pulse/console-shared"
import { Card, Chip, Description, EmptyState } from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"

const STATUS_TONE: Record<string, { color: "default" | "warning" | "success" | "danger"; label: string }> = {
  open: { color: "danger", label: "Open" },
  acknowledged: { color: "warning", label: "Acknowledged" },
  resolved: { color: "success", label: "Resolved" },
  suppressed: { color: "default", label: "Suppressed" },
}

export function AlertFeed({ alerts }: { alerts: AlertEvent[] }) {
  const latestAlerts = alerts.slice(0, 5)

  return (
    <Card>
      <Card.Header className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Card.Title className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Bell className="size-3.5 text-primary" />
              Alert Events
            </Card.Title>
            <Description className="text-xs">
              Persisted delivery lifecycle from monitor failures, cooldowns, and recoveries.
            </Description>
          </div>
          <Link href="/alerts" className="shrink-0 text-[11px] font-semibold text-primary hover:underline">
            View all
          </Link>
        </div>
      </Card.Header>
      <Card.Content className="space-y-3 pt-4 text-xs font-semibold text-foreground">
        {latestAlerts.length === 0 ? (
          <EmptyState className="flex h-full min-h-32 w-full flex-col items-center justify-center gap-2 border-0 bg-transparent py-4 text-center">
            <Bell className="size-6 text-muted" aria-hidden />
            <p className="text-sm font-semibold">No alert events yet</p>
            <Description className="text-xs">Alerts appear after a monitor crosses its failure threshold.</Description>
          </EmptyState>
        ) : (
          latestAlerts.map((alert) => {
            const latestDelivery = alert.deliveries?.[0]
            const tone = STATUS_TONE[alert.status] ?? { color: "default" as const, label: alert.status }
            return (
              <div key={alert.id} className="border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/alerts/${alert.id}`} className="block truncate font-bold text-foreground hover:text-primary hover:underline">
                      {alert.title}
                    </Link>
                    <p className="mt-0.5 truncate text-[11px] font-normal text-muted-foreground" title={alert.description}>
                      {alert.description || "Monitor run did not complete successfully."}
                    </p>
                  </div>
                  <Chip color={tone.color} variant="soft" className={cn("shrink-0 text-[10px] uppercase")}>
                    <Chip.Label>{tone.label}</Chip.Label>
                  </Chip>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-muted-foreground">
                  <span>{formatDate(alert.lastTriggeredAt)}</span>
                  <span>Channels: {alert.channels?.length ? alert.channels.join(", ") : "none"}</span>
                  {latestDelivery ? <span>Delivery: {latestDelivery.channel} {latestDelivery.status}</span> : null}
                </div>
              </div>
            )
          })
        )}
      </Card.Content>
    </Card>
  )
}
