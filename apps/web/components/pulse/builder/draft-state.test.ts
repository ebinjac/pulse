import { describe, expect, it } from "vitest"
import { analyzeMonitorScripts, applyJsonToMonitor, configFromMonitor, validateJsonConfig, validateMonitor } from "./draft-state"
import type { Monitor, MonitorStep } from "@/lib/pulse-types"

const baseMonitor = {
  id: "mon-1",
  name: "Health check",
  description: "API probe",
  cron: "*/5 * * * *",
  scheduleMode: "custom-cron",
  scheduleLabel: "Custom cron",
  timezone: "UTC",
  timeoutMs: 5000,
  retryCount: 0,
  failureThreshold: 3,
  responseBodyLimitKb: 64,
  isActive: true,
  secretAliases: ["api_key"],
  alertPolicy: { enabled: true, threshold: 3, responseTimeMs: 2000, cooldownMinutes: 30, email: true, slackWebhook: false },
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
  status: "skipped",
  lastRunAt: "",
  lastDurationMs: 0,
  successRate24h: 0,
} satisfies Monitor

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

  it("reports script syntax and missing variable or secret references", () => {
    const diagnostics = analyzeMonitorScripts({
      ...baseMonitor,
      variables: { known: "value" },
      secretAliases: ["boundSecret"],
      steps: [
        {
          ...(baseMonitor.steps[0] as MonitorStep),
          preRequestScript: `
            pm.variables.get("missingVar");
            pm.secrets.get("missingSecret");
            pm.variables.set("knownLater", "ok");
          `,
        },
        {
          ...(baseMonitor.steps[0] as MonitorStep),
          id: "step-2",
          name: "Broken script",
          preRequestScript: "if (",
        },
      ],
    })

    expect(diagnostics.map((item) => item.message).join("\n")).toContain("missingVar")
    expect(diagnostics.map((item) => item.message).join("\n")).toContain("missingSecret")
    expect(diagnostics.some((item) => item.severity === "danger")).toBe(true)
  })

  it("validates JSON config before applying runtime metadata", () => {
    expect(validateJsonConfig(`{"name":"","steps":[]}`)).toContain("name must be a non-empty string.")
    expect(validateJsonConfig(`{"name":"Demo","lastRunAt":"","steps":[]}`)[0]).toContain("lastRunAt")

    const result = applyJsonToMonitor(baseMonitor, JSON.stringify({ name: "Updated", steps: [], lastRunAt: "" }))
    expect(result.error).toContain("lastRunAt")
  })
})
