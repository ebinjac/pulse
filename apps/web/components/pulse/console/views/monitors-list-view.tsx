"use client"

import { useRouter } from "next/navigation"
import { Plus, Upload } from "lucide-react"
import type { Monitor } from "@/lib/pulse-types"
import type { MonitorScheduleFilter, MonitorStatusFilter } from "@/lib/filter-monitors"
import { PageShell } from "@/components/pulse/console/layout"
import { Button, Card, Description } from "@workspace/ui/components/ui"
import { MonitorFiltersToolbar } from "../components/monitor-filters-toolbar"
import { MonitorTable } from "../components/monitor-table"

export interface MonitorsListViewProps {
  monitors: Monitor[]
  monitorsSearch: string
  onMonitorsSearchChange: (value: string) => void
  monitorsStatusFilter: MonitorStatusFilter
  onMonitorsStatusFilterChange: (value: MonitorStatusFilter) => void
  monitorsScheduleFilter: MonitorScheduleFilter
  onMonitorsScheduleFilterChange: (value: MonitorScheduleFilter) => void
  onImportExport: () => void
  onRunNow: (monitorId: string) => Promise<void> | void
  onToggleActive: (monitorId: string, currentActive: boolean) => void
  onDeleteMonitor: (monitorId: string) => void
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
        <Card>
          <Card.Content className="gap-4">
            <Description className="text-sm">
              Search and filter the monitor inventory. Open a monitor for run history, or run checks on demand.
            </Description>
            <MonitorFiltersToolbar
              search={monitorsSearch}
              onSearchChange={onMonitorsSearchChange}
              statusFilter={monitorsStatusFilter}
              onStatusFilterChange={onMonitorsStatusFilterChange}
              scheduleFilter={monitorsScheduleFilter}
              onScheduleFilterChange={onMonitorsScheduleFilterChange}
            />
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
