"use client"

import { useRouter } from "next/navigation"
import { Plus, Upload } from "lucide-react"
import type { Monitor } from "@/lib/pulse-types"
import { PageShell } from "@/components/pulse/console-shared"
import { Button, Card, Description, Label, ListBox, SearchField, Select } from "@heroui/react"
import { MonitorTable } from "../components/monitor-table"

export interface MonitorsListViewProps {
  monitors: Monitor[]
  monitorsSearch: string
  onMonitorsSearchChange: (value: string) => void
  monitorsStatusFilter: "all" | "active" | "inactive" | "failed" | "healthy"
  onMonitorsStatusFilterChange: (value: MonitorsListViewProps["monitorsStatusFilter"]) => void
  monitorsScheduleFilter: "all" | "scheduled" | "manual"
  onMonitorsScheduleFilterChange: (value: MonitorsListViewProps["monitorsScheduleFilter"]) => void
  onImportExport: () => void
  onRunNow: (monitorId: string) => Promise<void> | void
  onToggleActive: (monitorId: string, currentActive: boolean) => void
  onDeleteMonitor: (monitorId: string) => void
}

const STATUS_FILTER_OPTIONS = [
  { id: "all", label: "All statuses" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "healthy", label: "Healthy" },
  { id: "failed", label: "Failed" },
] as const

const SCHEDULE_FILTER_OPTIONS = [
  { id: "all", label: "All schedules" },
  { id: "scheduled", label: "Scheduled" },
  { id: "manual", label: "Manual only" },
] as const

function MonitorFilterSelect<T extends string>({
  label,
  ariaLabel,
  selectedKey,
  onSelectionChange,
  options,
  className,
}: {
  label: string
  ariaLabel: string
  selectedKey: T
  onSelectionChange: (key: T) => void
  options: ReadonlyArray<{ id: T; label: string }>
  className?: string
}) {
  return (
    <Select
      aria-label={ariaLabel}
      className={className ?? "w-full min-w-[10rem] sm:w-[11rem]"}
      variant="secondary"
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        if (key != null) onSelectionChange(String(key) as T)
      }}
    >
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

export function MonitorsListView({
  monitors,
  monitorsSearch,
  onMonitorsSearchChange,
  monitorsStatusFilter,
  onMonitorsStatusFilterChange,
  monitorsScheduleFilter,
  onMonitorsScheduleFilterChange,
  onImportExport,
  onRunNow,
  onToggleActive,
  onDeleteMonitor,
}: MonitorsListViewProps) {
  const router = useRouter()

  return (
    <PageShell
      eyebrow="Inventory"
      title="Monitors"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="gap-2" onPress={onImportExport}>
            <Upload className="size-4" />
            Import / Export
          </Button>
          <Button className="gap-2" onPress={() => router.push("/monitors/create")}>
            <Plus className="size-4" />
            New monitor
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Card >
          <Card.Content className="gap-4">
            <Description className="text-sm">
              Search and filter the monitor inventory. Open a monitor for run history, or run checks on demand.
            </Description>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <SearchField
                aria-label="Search monitors"
                className="flex-1"
                value={monitorsSearch}
                onChange={onMonitorsSearchChange}
                variant="secondary"
              >
                <SearchField.Group className="h-9">
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="Search monitors by name or description..." />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <MonitorFilterSelect
                  label="Status"
                  ariaLabel="Filter by status"
                  selectedKey={monitorsStatusFilter}
                  onSelectionChange={onMonitorsStatusFilterChange}
                  options={STATUS_FILTER_OPTIONS}
                />
                <MonitorFilterSelect
                  label="Schedule"
                  ariaLabel="Filter by schedule"
                  selectedKey={monitorsScheduleFilter}
                  onSelectionChange={onMonitorsScheduleFilterChange}
                  options={SCHEDULE_FILTER_OPTIONS}
                />
              </div>
            </div>
            <Description className="text-xs">
              Showing {monitors.length} monitor{monitors.length === 1 ? "" : "s"}
            </Description>
          </Card.Content>
        </Card>

        <MonitorTable
          monitors={monitors}
          onRunNow={onRunNow}
          onToggleActive={onToggleActive}
          onDeleteMonitor={onDeleteMonitor}
        />
      </div>
    </PageShell>
  )
}
