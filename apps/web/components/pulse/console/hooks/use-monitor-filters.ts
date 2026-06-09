"use client"

import { useMemo, useState } from "react"
import { filterMonitors, type MonitorScheduleFilter, type MonitorStatusFilter } from "@/lib/filter-monitors"
import type { Monitor } from "@/lib/pulse-types"

export function useMonitorFilters(monitors: Monitor[]) {
  const [monitorsSearch, setMonitorsSearch] = useState("")
  const [monitorsStatusFilter, setMonitorsStatusFilter] = useState<MonitorStatusFilter>("all")
  const [monitorsScheduleFilter, setMonitorsScheduleFilter] = useState<MonitorScheduleFilter>("all")

  const filteredMonitors = useMemo(
    () =>
      filterMonitors(monitors, {
        search: monitorsSearch,
        status: monitorsStatusFilter,
        schedule: monitorsScheduleFilter,
      }),
    [monitors, monitorsSearch, monitorsStatusFilter, monitorsScheduleFilter]
  )

  return {
    monitorsSearch,
    setMonitorsSearch,
    monitorsStatusFilter,
    setMonitorsStatusFilter,
    monitorsScheduleFilter,
    setMonitorsScheduleFilter,
    filteredMonitors,
  }
}
