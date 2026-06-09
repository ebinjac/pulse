"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import type { Monitor } from "@/lib/pulse-types"
import { formatDate, StatusPill } from "@/components/pulse/console-shared"
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Chip,
  EmptyState,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  TextField,
} from "@heroui/react"
import { aggregateMonitorStats, monitorHealthFilter } from "./deployment-check-wizard-models"

type HealthFilter = "all" | "healthy" | "failing"

export function DeploymentCheckStepMonitors({
  activeMonitors,
  selectedMonitorIds,
  onSelectedMonitorIdsChange,
  samplingLocked,
  loading = false,
}: {
  activeMonitors: Monitor[]
  selectedMonitorIds: string[]
  onSelectedMonitorIdsChange: (ids: string[]) => void
  samplingLocked: boolean
  loading?: boolean
}) {
  const [query, setQuery] = useState("")
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all")
  const [scheduleFilter, setScheduleFilter] = useState<string>("all")

  const scheduleOptions = useMemo(() => {
    const labels = new Set<string>()
    for (const monitor of activeMonitors) {
      if (monitor.scheduleLabel) labels.add(monitor.scheduleLabel)
    }
    return Array.from(labels).sort()
  }, [activeMonitors])

  const filteredMonitors = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return activeMonitors.filter((monitor) => {
      if (healthFilter !== "all" && monitorHealthFilter(monitor.status) !== healthFilter) {
        return false
      }
      if (scheduleFilter !== "all" && monitor.scheduleLabel !== scheduleFilter) {
        return false
      }
      if (!needle) return true
      return [monitor.name, monitor.description, monitor.scheduleLabel, monitor.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [activeMonitors, query, healthFilter, scheduleFilter])

  const selectedMonitors = useMemo(
    () => activeMonitors.filter((m) => selectedMonitorIds.includes(m.id)),
    [activeMonitors, selectedMonitorIds],
  )

  const { avgSuccess, avgLatency } = aggregateMonitorStats(selectedMonitors)

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Select synthetic monitors to compare before and after deploy. Success rate and latency are
        evaluated per monitor.
      </p>

      {selectedMonitorIds.length > 0 ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Selected monitors
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold text-foreground">
              {selectedMonitorIds.length} selected
            </span>
            <span className="text-muted-foreground">{avgSuccess}% avg success</span>
            <span className="text-muted-foreground">{avgLatency}ms avg latency</span>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border/50 shadow-sm">
        <div className="space-y-3 border-b border-border/40 bg-muted/10 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <TextField aria-label="Search monitors" variant="secondary" className="min-w-0 flex-1">
              <Label className="text-xs">Search</Label>
              <Input
                variant="secondary"
                className="min-h-10"
                placeholder="Search by monitor name..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </TextField>

            <Select
              aria-label="Filter by status"
              className="w-full lg:w-40"
              variant="secondary"
              selectedKey={healthFilter}
              onSelectionChange={(key) => {
                if (key != null) setHealthFilter(String(key) as HealthFilter)
              }}
            >
              <Label className="text-xs">Status</Label>
              <Select.Trigger className="min-h-10">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="all" textValue="All">
                    All
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="healthy" textValue="Healthy">
                    Healthy
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="failing" textValue="Failing">
                    Failing
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>

            {scheduleOptions.length > 0 ? (
              <Select
                aria-label="Filter by schedule"
                className="w-full lg:w-44"
                variant="secondary"
                selectedKey={scheduleFilter}
                onSelectionChange={(key) => {
                  if (key != null) setScheduleFilter(String(key))
                }}
              >
                <Label className="text-xs">Schedule</Label>
                <Select.Trigger className="min-h-10">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="all" textValue="All schedules">
                      All schedules
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    {scheduleOptions.map((label) => (
                      <ListBox.Item key={label} id={label} textValue={label}>
                        {label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {selectedMonitorIds.length}/{activeMonitors.length}
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="h-9"
              isDisabled={samplingLocked || activeMonitors.length === 0}
              onPress={() => onSelectedMonitorIdsChange(activeMonitors.map((monitor) => monitor.id))}
            >
              Select all
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-9"
              isDisabled={samplingLocked || selectedMonitorIds.length === 0}
              onPress={() => onSelectedMonitorIdsChange([])}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="max-h-[min(28rem,55vh)] overflow-auto bg-background">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
              <Spinner size="sm" />
              <div>
                <p className="text-sm font-semibold text-foreground">Loading monitors...</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Fetching latest synthetic check status...
                </p>
              </div>
            </div>
          ) : activeMonitors.length === 0 ? (
            <EmptyState className="flex flex-col items-center justify-center gap-2 border-0 bg-transparent p-10 text-center">
              <span className="text-sm font-semibold text-foreground">No monitors found</span>
              <span className="max-w-sm text-sm text-muted-foreground">
                Try changing your search or check if monitors are onboarded for this CAR.
              </span>
              <Link
                href="/monitors/create"
                className="mt-2 text-sm font-semibold text-primary underline"
              >
                Create a monitor
              </Link>
            </EmptyState>
          ) : (
            <CheckboxGroup
              aria-label="Active monitors"
              className="gap-0 p-2"
              isDisabled={samplingLocked}
              value={selectedMonitorIds}
              onChange={onSelectedMonitorIdsChange}
            >
              {filteredMonitors.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No monitors match your filters.
                </div>
              ) : null}
              {filteredMonitors.map((monitor) => (
                <Checkbox
                  key={monitor.id}
                  value={monitor.id}
                  className="w-full max-w-full items-start gap-3 rounded-lg border border-transparent px-3 py-3 hover:border-border/40 hover:bg-muted/20 data-[selected=true]:border-primary/20 data-[selected=true]:bg-primary/5"
                >
                  <Checkbox.Control className="mt-1">
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Content className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {monitor.name}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {monitor.scheduleLabel ? (
                            <Chip size="sm" variant="soft">
                              <Chip.Label>{monitor.scheduleLabel}</Chip.Label>
                            </Chip>
                          ) : null}
                          <Chip size="sm" variant="soft">
                            <Chip.Label>{monitor.successRate24h ?? 0}% success</Chip.Label>
                          </Chip>
                          <Chip size="sm" variant="soft">
                            <Chip.Label>{monitor.lastDurationMs || 0}ms p95</Chip.Label>
                          </Chip>
                          {monitor.lastRunAt ? (
                            <Chip size="sm" variant="soft">
                              <Chip.Label>Last run {formatDate(monitor.lastRunAt)}</Chip.Label>
                            </Chip>
                          ) : null}
                        </div>
                      </div>
                      <StatusPill status={monitor.status} />
                    </div>
                  </Checkbox.Content>
                </Checkbox>
              ))}
            </CheckboxGroup>
          )}
        </div>
      </div>
    </div>
  )
}
