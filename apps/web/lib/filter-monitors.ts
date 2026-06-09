import type { Monitor } from "@/lib/pulse-types"

export type MonitorStatusFilter = "all" | "active" | "inactive" | "failed" | "healthy"
export type MonitorScheduleFilter = "all" | "scheduled" | "manual"

export interface MonitorFilterOptions {
  search?: string
  status?: MonitorStatusFilter
  schedule?: MonitorScheduleFilter
}

export function filterMonitors(monitors: Monitor[], options: MonitorFilterOptions): Monitor[] {
  const search = options.search ?? ""
  const status = options.status ?? "all"
  const schedule = options.schedule ?? "all"
  const q = search.toLowerCase()

  return monitors.filter((m) => {
    const matchesSearch =
      !search ||
      m.name.toLowerCase().includes(q) ||
      (m.description || "").toLowerCase().includes(q)

    const matchesStatus =
      status === "all" ||
      (status === "active" && m.isActive) ||
      (status === "inactive" && !m.isActive) ||
      (status === "failed" && (m.status || "").toLowerCase() === "failed") ||
      (status === "healthy" && (m.status || "").toLowerCase() !== "failed")

    const matchesSchedule =
      schedule === "all" ||
      (schedule === "scheduled" && m.scheduleMode !== "manual") ||
      (schedule === "manual" && m.scheduleMode === "manual")

    return matchesSearch && matchesStatus && matchesSchedule
  })
}
