import { describe, expect, it } from "vitest"
import { configFromMonitor, validateMonitor } from "./draft-state"
import type { Monitor } from "@/lib/pulse-types"

const baseMonitor = {
  id: "mon-1",
  name: "Health check",
  description: "API probe",
  cron: "*/5 * * * *",
  scheduleMode: "cron",
  timezone: "UTC",
  timeoutMs: 5000,
  retryCount: 0,
  failureThreshold: 3,
  responseBodyLimitKb: 64,
  isActive: true,
  secretAliases: ["api_key"],
  alertPolicy: { enabled: true, threshold: 3, responseTimeMs: 2000, cooldownMinutes: 30, email: true },
  variables: { baseUrl: "https://example.com" },
  steps: [
    {
      id: "step-1",
      order: 1,
      name: "GET /health",
      type: "http",
      method: "GET",
      url: "https://example.com/health",
      timeoutMs: 5000,
      retryCount: 0,
      continueOnFailure: false,
      assertions: [],
      extractors: [],
    },
  ],
} as Monitor

describe("draft-state", () => {
  it("maps monitor config for JSON editor", () => {
    const config = configFromMonitor(baseMonitor)
    expect(config.name).toBe("Health check")
    expect(config.steps).toHaveLength(1)
    expect(config.secrets[0]?.alias).toBe("api_key")
  })

  it("validates required monitor fields", () => {
    const errors = validateMonitor({ ...baseMonitor, name: "  " })
    expect(errors).toContain("Monitor name is required.")
  })
})
