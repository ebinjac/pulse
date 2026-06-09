import { describe, expect, it } from "vitest"
import { filterMonitors } from "./filter-monitors"
import type { Monitor } from "./pulse-types"

const monitors: Monitor[] = [
  {
    id: "m1",
    name: "Auth API",
    description: "Login health",
    isActive: true,
    status: "success",
    scheduleMode: "cron",
  } as Monitor,
  {
    id: "m2",
    name: "Billing",
    description: "Payments",
    isActive: false,
    status: "failed",
    scheduleMode: "manual",
  } as Monitor,
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
