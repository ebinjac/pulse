import type { Monitor, MonitorConfigChange } from "@/lib/pulse-types"

export function diffMonitors(before: Monitor, after: Monitor): MonitorConfigChange[] {
  const changes: MonitorConfigChange[] = []
  const add = (path: string, oldValue: unknown, newValue: unknown) => {
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return
    changes.push({ path, oldValue, newValue })
  }

  add("name", before.name, after.name)
  add("description", before.description, after.description)
  add("applicationId", before.applicationId ?? "", after.applicationId ?? "")
  add("scheduleMode", before.scheduleMode, after.scheduleMode)
  add("cron", before.cron, after.cron)
  add("timezone", before.timezone, after.timezone)
  add("timeoutMs", before.timeoutMs, after.timeoutMs)
  add("retryCount", before.retryCount, after.retryCount)
  add("failureThreshold", before.failureThreshold, after.failureThreshold)
  add("isActive", before.isActive, after.isActive)
  add("variables", before.variables, after.variables)
  add("secretAliases", before.secretAliases, after.secretAliases)
  add("alertPolicy", before.alertPolicy, after.alertPolicy)
  add("steps", before.steps, after.steps)

  return changes
}

export function formatDiffValue(value: unknown): string {
  if (value === undefined || value === null) return "—"
  if (typeof value === "string") return value
  return JSON.stringify(value, null, 2)
}
