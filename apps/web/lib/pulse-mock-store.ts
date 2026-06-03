import { monitors, runs, secrets } from "./pulse-data"
import { buildMockRun } from "./pulse-execution"
import type { Monitor, MonitorRun, SecretReference } from "./pulse-types"

interface PulseMockStore {
  monitors: Monitor[]
  runs: MonitorRun[]
  secrets: SecretReference[]
}

declare global {
  var pulseMockStore: PulseMockStore | undefined
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function getStore() {
  globalThis.pulseMockStore ??= {
    monitors: clone(monitors),
    runs: clone(runs),
    secrets: clone(secrets),
  }

  return globalThis.pulseMockStore
}

export function listMonitors() {
  return getStore().monitors
}

export function getMonitorById(monitorId: string) {
  return getStore().monitors.find((monitor) => monitor.id === monitorId)
}

export function upsertMonitor(input: Monitor) {
  const store = getStore()
  const next: Monitor = {
    ...input,
    id: input.id || `mon-${crypto.randomUUID()}`,
    lastRunAt: input.lastRunAt || new Date().toISOString(),
  }
  const existingIndex = store.monitors.findIndex((monitor) => monitor.id === next.id)

  if (existingIndex >= 0) {
    store.monitors[existingIndex] = next
  } else {
    store.monitors.unshift(next)
  }

  return next
}

export function deleteMonitor(monitorId: string) {
  const store = getStore()
  const before = store.monitors.length
  store.monitors = store.monitors.filter((monitor) => monitor.id !== monitorId)
  store.runs = store.runs.filter((run) => run.monitorId !== monitorId)

  return store.monitors.length !== before
}

export function runMonitor(monitorId: string, override?: Monitor) {
  const monitor = override ?? getMonitorById(monitorId)

  if (!monitor) return null

  const run = buildMockRun(monitor)
  const store = getStore()
  store.runs.unshift(run)
  store.monitors = store.monitors.map((item) =>
    item.id === monitorId
      ? {
          ...monitor,
          status: run.status,
          lastRunAt: run.endedAt,
          lastDurationMs: run.durationMs,
        }
      : item
  )

  return run
}

export function listRuns(monitorId?: string) {
  const store = getStore()

  return monitorId ? store.runs.filter((run) => run.monitorId === monitorId) : store.runs
}

export function getRunById(runId: string) {
  return getStore().runs.find((run) => run.id === runId)
}

export function listSecrets() {
  return getStore().secrets
}

export function getSecretById(secretId: string) {
  return getStore().secrets.find((secret) => secret.id === secretId)
}
