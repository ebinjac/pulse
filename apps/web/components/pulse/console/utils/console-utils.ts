import type { Monitor } from "@/lib/pulse-types"
import { isFailedStatus } from "@/components/pulse/console-shared"

export function toDateTimeLocalInput(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

export function dateTimeLocalToISOString(value: string) {
  if (!value) return new Date().toISOString()
  return new Date(value).toISOString()
}

export function applicationHealth(
  monitors: Monitor[],
  appSlo?: { uptime7d: { uptimePct: number }; uptime30d: { uptimePct: number } }
) {
  const total = monitors.length
  const failing = monitors.filter((monitor) => isFailedStatus(monitor.status)).length
  const active = monitors.filter((monitor) => monitor.isActive).length
  const successRate = appSlo
    ? Math.round(appSlo.uptime30d.uptimePct)
    : total > 0
      ? Math.round(monitors.reduce((sum, monitor) => sum + (monitor.successRate24h || 0), 0) / total)
      : 100
  const uptime7d = appSlo ? Math.round(appSlo.uptime7d.uptimePct) : successRate
  const avgLatency =
    total > 0
      ? Math.round(monitors.reduce((sum, monitor) => sum + (monitor.lastDurationMs || 0), 0) / total)
      : 0

  return { total, failing, active, successRate, uptime7d, avgLatency }
}

export type ApplicationHealth = ReturnType<typeof applicationHealth>

export function validationStatusLabel(status: string) {
  return status.replaceAll("_", " ")
}
