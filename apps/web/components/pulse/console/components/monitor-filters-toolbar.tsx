"use client"

import { Label, ListBox, SearchField, Select } from "@workspace/ui/components/ui"
import type { MonitorScheduleFilter, MonitorStatusFilter } from "@/lib/filter-monitors"

const STATUS_FILTER_OPTIONS = [
  { id: "all", label: "All statuses" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "healthy", label: "Healthy" },
  { id: "failed", label: "Failed" },
] as const satisfies ReadonlyArray<{ id: MonitorStatusFilter; label: string }>

const SCHEDULE_FILTER_OPTIONS = [
  { id: "all", label: "All schedules" },
  { id: "scheduled", label: "Scheduled" },
  { id: "manual", label: "Manual only" },
] as const satisfies ReadonlyArray<{ id: MonitorScheduleFilter; label: string }>

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

export interface MonitorFiltersToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  statusFilter: MonitorStatusFilter
  onStatusFilterChange: (value: MonitorStatusFilter) => void
  scheduleFilter: MonitorScheduleFilter
  onScheduleFilterChange: (value: MonitorScheduleFilter) => void
}

export function MonitorFiltersToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  scheduleFilter,
  onScheduleFilterChange,
}: MonitorFiltersToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <SearchField
        aria-label="Search monitors"
        value={search}
        onChange={onSearchChange}
        className="min-w-0 flex-1"
      >
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted">Search</Label>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Search monitors by name or description..." />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
        <MonitorFilterSelect
          label="Status"
          ariaLabel="Filter monitors by status"
          selectedKey={statusFilter}
          onSelectionChange={onStatusFilterChange}
          options={STATUS_FILTER_OPTIONS}
        />
        <MonitorFilterSelect
          label="Schedule"
          ariaLabel="Filter monitors by schedule"
          selectedKey={scheduleFilter}
          onSelectionChange={onScheduleFilterChange}
          options={SCHEDULE_FILTER_OPTIONS}
        />
      </div>
    </div>
  )
}
