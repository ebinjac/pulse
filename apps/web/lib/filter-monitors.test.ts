import { describe, expect, it } from "vitest"
import { filterMonitors } from "./filter-monitors"
import type { Monitor } from "./pulse-types"

function monitor(patch: Partial<Monitor> & Pick<Monitor, "id" | "name">): Monitor {
  const { id, name, ...rest } = patch
  return {
    id,
    name,
    description: "",
    scheduleMode: "manual",
    scheduleLabel: "Manual",
    cron: "",
    timezone: "UTC",
    timeoutMs: 30000,
    retryCount: 0,
    failureThreshold: 1,
    responseBodyLimitKb: 32,
    isActive: true,
    variables: {},
    secretAliases: [],
    steps: [],
    alertPolicy: { enabled: false, threshold: 1, responseTimeMs: 1000, email: false, slackWebhook: false, cooldownMinutes: 30 },
    status: "skipped",
    lastRunAt: "",
    lastDurationMs: 0,
    successRate24h: 0,
    ...rest,
  }
}

const monitors: Monitor[] = [
  monitor({
    id: "m1",
    name: "Auth API",
    description: "Login health",
    isActive: true,
    status: "success",
    scheduleMode: "custom-cron",
  }),
  monitor({
    id: "m2",
    name: "Billing",
    description: "Payments",
    isActive: false,
    status: "failed",
    scheduleMode: "manual",
  }),
]

describe("filterMonitors", () => {
  it("filters by search text", () => {
    const result = filterMonitors(monitors, { search: "auth" })
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe("m1")
  })

  it("filters by status", () => {
    const result = filterMonitors(monitors, { status: "failed" })
    expect(result.map((m) => m.id)).toEqual(["m2"])
  })

  it("filters by schedule", () => {
    const result = filterMonitors(monitors, { schedule: "manual" })
    expect(result.map((m) => m.id)).toEqual(["m2"])
  })
})
