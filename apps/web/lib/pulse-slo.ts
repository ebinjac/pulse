import type { ApplicationSLO, MonitorSLO, SLOSummary } from "@/lib/pulse-types"

export function monitorSLOMap(summary: SLOSummary | null): Map<string, MonitorSLO> {
  const map = new Map<string, MonitorSLO>()
  for (const item of summary?.monitors || []) {
    map.set(item.monitorId, item)
  }
  return map
}

export function applicationSLOMap(summary: SLOSummary | null): Map<string, ApplicationSLO> {
  const map = new Map<string, ApplicationSLO>()
  for (const item of summary?.applications || []) {
    map.set(item.applicationId, item)
  }
  return map
}

export function formatUptimePct(value?: number) {
  if (value === undefined || Number.isNaN(value)) {
    return "—"
  }
  return `${value.toFixed(2)}%`
}

export function formatLatencyMs(value?: number) {
  if (!value) {
    return "—"
  }
  return `${value}ms`
}
