import { describe, expect, it, vi } from "vitest"
import type { Monitor } from "@/lib/pulse-types"
import { builderTestScenarios } from "./test-lab"

vi.stubGlobal("crypto", {
  randomUUID: () => "00000000-0000-4000-8000-000000000000",
})

const baseMonitor = {
  id: "",
  name: "Base",
  description: "",
  scheduleMode: "every-5m",
  scheduleLabel: "Every 5 minutes",
  cron: "*/5 * * * *",
  timezone: "UTC",
  timeoutMs: 30000,
  retryCount: 0,
  failureThreshold: 1,
  responseBodyLimitKb: 32,
  isActive: true,
  variables: {},
  secretAliases: [],
  steps: [],
  alertPolicy: { enabled: true, threshold: 1, responseTimeMs: 1000, email: false, slackWebhook: false, cooldownMinutes: 30 },
  status: "skipped",
  lastRunAt: "",
  lastDurationMs: 0,
  successRate24h: 0,
} as Monitor

describe("builder test lab scenarios", () => {
  it("creates local fixture scenarios without external endpoints", () => {
    for (const scenario of builderTestScenarios) {
      const draft = scenario.apply(baseMonitor)

      expect(draft.variables.fixtureBaseUrl).toBe("http://localhost:8080/api/qa/monitor-fixtures")
      expect(draft.alertPolicy.enabled).toBe(false)
      expect(draft.steps.length).toBeGreaterThan(0)
      expect(JSON.stringify(draft)).not.toContain("api.example.com")
    }
  })
})
