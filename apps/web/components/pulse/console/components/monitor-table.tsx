"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Activity, Eye, MoreHorizontal, Play, RotateCw } from "lucide-react"
import type { Monitor, MonitorSLO } from "@/lib/pulse-types"
import { formatDate, StatusPill } from "@/components/pulse/console-shared"
import { formatUptimePct } from "@/lib/pulse-slo"
import { cn } from "@workspace/ui/lib/utils"
import { notifyPulseToast } from "@/components/pulse/pulse-toast-queue"
import {
  Button,
  Card,
  Chip,
  Description,
  Dropdown,
  EmptyState,
  Table,
} from "@workspace/ui/components/ui"

export interface MonitorTableProps {
  monitors: Monitor[]
  monitorSloMap?: Map<string, MonitorSLO>
  onRunNow: (monitorId: string) => Promise<unknown> | unknown
  onToggleActive: (monitorId: string, currentActive: boolean) => void
  onDeleteMonitor?: (monitorId: string) => void
}

export function MonitorTable({ monitors, monitorSloMap, onRunNow, onToggleActive, onDeleteMonitor }: MonitorTableProps) {
  const router = useRouter()
  const [runningIds, setRunningIds] = useState<string[]>([])

  const handleRunClick = async (monitorId: string) => {
    if (runningIds.includes(monitorId)) return
    const monitor = monitors.find((item) => item.id === monitorId)
    setRunningIds((prev) => [...prev, monitorId])
    try {
      notifyPulseToast(
        "info",
        "Running monitor",
        monitor?.name ? `Triggering a check for ${monitor.name}.` : undefined,
      )
      await onRunNow(monitorId)
      notifyPulseToast(
        "success",
        "Monitor run started",
        monitor?.name ? `${monitor.name} is executing now.` : undefined,
      )
    } catch (err) {
      console.error("Failed to run monitor:", err)
      notifyPulseToast(
        "danger",
        "Failed to run monitor",
        err instanceof Error ? err.message : "Please try again.",
      )
    } finally {
      setRunningIds((prev) => prev.filter((id) => id !== monitorId))
    }
  }

  return (
    
      <Table aria-label="Monitors">
        <Table.ScrollContainer>
          <Table.Content className="min-w-[960px]">
            <Table.Header>
              <Table.Column isRowHeader className="px-5">
                Monitor
              </Table.Column>
              <Table.Column className="px-3">Status</Table.Column>
              <Table.Column className="px-3">Schedule</Table.Column>
              <Table.Column className="px-3">Last execution</Table.Column>
              <Table.Column className="px-3 text-center">7d</Table.Column>
              <Table.Column className="px-3 text-center">30d</Table.Column>
              <Table.Column className="px-3">State</Table.Column>
              <Table.Column className="px-5 text-end">Actions</Table.Column>
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <EmptyState className="flex h-full min-h-52 w-full flex-col items-center justify-center gap-3 py-10 text-center">
                  <Activity className="size-6 text-muted" aria-hidden />
                  <p className="text-sm font-semibold text-foreground">No monitors found</p>
                  <Card.Description className="max-w-sm">
                    Create your first monitor to start tracking endpoint availability.
                  </Card.Description>
                </EmptyState>
              )}
            >
              {monitors.map((monitor) => {
                const isRunning = runningIds.includes(monitor.id)
                return (
                  <Table.Row key={monitor.id} id={monitor.id} className="hover:bg-default/40">
                    <Table.Cell className="max-w-[320px] px-5 py-4 align-top">
                      <div className="min-w-0 pr-2">
                        <Link
                          href={`/monitors/${monitor.id}/runs`}
                          className="block text-sm font-semibold text-foreground hover:text-accent hover:underline"
                        >
                          {monitor.name}
                        </Link>
                        <Description className="mt-1 line-clamp-1">
                          {monitor.description || "No description provided."}
                        </Description>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="px-3 py-4 align-top">
                      <StatusPill status={monitor.status} />
                    </Table.Cell>
                    <Table.Cell className="px-3 py-4 align-top">
                      <Chip size="sm" variant="soft">
                        <Chip.Label>{monitor.scheduleLabel || "Manual check"}</Chip.Label>
                      </Chip>
                    </Table.Cell>
                    <Table.Cell className="px-3 py-4 align-top">
                      <Description className="text-xs font-medium">
                        {monitor.lastRunAt ? formatDate(monitor.lastRunAt) : "Never"}
                      </Description>
                    </Table.Cell>
                    <Table.Cell className="px-3 py-4 text-center align-top text-sm font-semibold text-foreground">
                      {formatUptimePct(monitorSloMap?.get(monitor.id)?.uptime7d.uptimePct)}
                    </Table.Cell>
                    <Table.Cell className="px-3 py-4 text-center align-top text-sm font-semibold text-foreground">
                      {formatUptimePct(monitorSloMap?.get(monitor.id)?.uptime30d.uptimePct)}
                    </Table.Cell>
                    <Table.Cell className="px-3 py-4 align-top">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                          monitor.isActive
                            ? "border-emerald-200/50 bg-emerald-500/10 text-emerald-600 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400"
                            : "border-separator bg-default text-muted"
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            monitor.isActive ? "bg-emerald-500 animate-pulse" : "bg-muted"
                          )}
                        />
                        {monitor.isActive ? "Active" : "Inactive"}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="px-5 py-4 text-end align-top">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          className="min-w-[4.5rem] gap-1"
                          isDisabled={isRunning}
                          onPress={() => void handleRunClick(monitor.id)}
                        >
                          {isRunning ? (
                            <>
                              <RotateCw className="size-3 animate-spin" />
                              Running
                            </>
                          ) : (
                            <>
                              <Play className="size-3" />
                              Run
                            </>
                          )}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="gap-1"
                          onPress={() => router.push(`/monitors/${monitor.id}/runs`)}
                        >
                          <Eye className="size-3" />
                          History
                        </Button>
                        <Dropdown>
                          <Button variant="ghost" size="sm" isIconOnly aria-label="Open menu">
                            <MoreHorizontal className="size-4" />
                          </Button>
                          <Dropdown.Popover>
                            <Dropdown.Menu
                              onAction={(key) => {
                                if (key === "edit") router.push(`/monitors/${monitor.id}/edit`)
                                if (key === "toggle") onToggleActive(monitor.id, monitor.isActive)
                                if (key === "delete" && onDeleteMonitor) onDeleteMonitor(monitor.id)
                              }}
                            >
                              <Dropdown.Item id="edit" textValue="Edit monitor">
                                Edit monitor
                              </Dropdown.Item>
                              <Dropdown.Item id="toggle" textValue="Toggle active">
                                {monitor.isActive ? "Disable" : "Enable"}
                              </Dropdown.Item>
                              {onDeleteMonitor ? (
                                <Dropdown.Item id="delete" textValue="Delete monitor" className="text-danger">
                                  Delete monitor
                                </Dropdown.Item>
                              ) : null}
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

  )
}
