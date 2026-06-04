import type { Monitor, MonitorStep, PulseAssertion } from "@/lib/pulse-types"
import type { MonitorExportRecord } from "./types"

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function parseDocumentInput(document: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof document === "string") {
    const trimmed = document.trim()
    if (!trimmed) {
      throw new Error("Document is empty.")
    }
    try {
      return JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      throw new Error("Document must be valid JSON (YAML imports should be converted to JSON on the client first).")
    }
  }
  return document
}

/** Postman {{var}} → Pulse {{variables.var}}; leaves {{secrets.*}} unchanged. */
export function convertTemplateSyntax(value: string): string {
  return value.replace(/\{\{([^}]+)\}\}/g, (_match, inner: string) => {
    const key = inner.trim()
    if (key.startsWith("secrets.") || key.startsWith("variables.")) {
      return `{{${key}}}`
    }
    return `{{variables.${key}}}`
  })
}

export function defaultStatusAssertion(): PulseAssertion {
  return {
    id: newId("assert"),
    type: "statusCode",
    label: "Status code is 200",
    target: "status",
    operator: "equals",
    expected: "200",
  }
}

export function createHttpStep(input: {
  name: string
  order: number
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}): MonitorStep {
  return {
    id: newId("step"),
    order: input.order,
    name: input.name,
    type: "http",
    method: input.method.toUpperCase(),
    url: convertTemplateSyntax(input.url),
    timeoutMs: 10000,
    retryCount: 0,
    continueOnFailure: false,
    assertions: [defaultStatusAssertion()],
    extractors: [],
    preRequestScript: "",
    config: {
      headers: Object.fromEntries(
        Object.entries(input.headers ?? {}).map(([k, v]) => [k, convertTemplateSyntax(v)])
      ),
      body: input.body ? convertTemplateSyntax(input.body) : "",
      auth: { type: "noAuth" },
      cookies: { enabled: true, mode: "jar", manual: [] },
      mtls: { enabled: false, insecureSkipVerify: false },
      proxy: { enabled: false },
    },
  }
}

export function createMonitorTemplate(partial: {
  name: string
  description?: string
  applicationId?: string
  steps: MonitorStep[]
  scheduleMode?: Monitor["scheduleMode"]
  cron?: string
}): Monitor {
  const scheduleMode = partial.scheduleMode ?? "every-5m"
  const cron = partial.cron ?? "*/5 * * * *"
  return {
    id: "",
    applicationId: partial.applicationId ?? "",
    name: partial.name,
    description: partial.description ?? "",
    scheduleMode,
    scheduleLabel: scheduleLabelForMode(scheduleMode),
    cron,
    timezone: "UTC",
    timeoutMs: 30000,
    retryCount: 1,
    failureThreshold: 3,
    responseBodyLimitKb: 32,
    isActive: true,
    variables: {},
    secretAliases: [],
    steps: partial.steps,
    alertPolicy: {
      enabled: true,
      threshold: 3,
      responseTimeMs: 2000,
      email: true,
      slackWebhook: false,
      cooldownMinutes: 30,
    },
    status: "skipped",
    lastRunAt: new Date().toISOString(),
    lastDurationMs: 0,
    successRate24h: 100,
  }
}

function scheduleLabelForMode(mode: Monitor["scheduleMode"]): string {
  switch (mode) {
    case "manual":
      return "Manual only"
    case "every-1m":
      return "Every 1 minute"
    case "every-5m":
      return "Every 5 minutes"
    case "every-10m":
      return "Every 10 minutes"
    case "every-15m":
      return "Every 15 minutes"
    case "every-30m":
      return "Every 30 minutes"
    case "hourly":
      return "Hourly"
    case "custom-cron":
      return "Custom cron"
    default:
      return mode
  }
}

export function stripMonitorForExport(monitor: Monitor): MonitorExportRecord {
  return {
    name: monitor.name,
    description: monitor.description,
    applicationId: monitor.applicationId || undefined,
    scheduleMode: monitor.scheduleMode,
    scheduleLabel: monitor.scheduleLabel,
    cron: monitor.cron,
    timezone: monitor.timezone,
    timeoutMs: monitor.timeoutMs,
    retryCount: monitor.retryCount,
    failureThreshold: monitor.failureThreshold,
    responseBodyLimitKb: monitor.responseBodyLimitKb,
    isActive: monitor.isActive,
    variables: monitor.variables ?? {},
    secretAliases: monitor.secretAliases ?? [],
    steps: monitor.steps.map((step) => ({
      ...step,
      id: step.id || newId("step"),
      assertions: step.assertions ?? [],
      extractors: step.extractors ?? [],
      config: step.config ?? {},
    })),
    alertPolicy: monitor.alertPolicy,
  }
}

export function monitorFromExportRecord(
  record: MonitorExportRecord,
  applicationId?: string
): Monitor {
  return createMonitorTemplate({
    name: record.name,
    description: record.description,
    applicationId: applicationId ?? record.applicationId,
    scheduleMode: record.scheduleMode,
    cron: record.cron,
    steps: record.steps.map((step, index) => ({
      ...step,
      order: step.order ?? index + 1,
      id: step.id || newId("step"),
      timeoutMs: step.timeoutMs ?? 10000,
      retryCount: step.retryCount ?? 0,
      continueOnFailure: step.continueOnFailure ?? false,
      assertions: step.assertions?.length ? step.assertions : [defaultStatusAssertion()],
      extractors: step.extractors ?? [],
    })),
  })
}

export function detectSensitiveValues(text: string): string[] {
  const warnings: string[] = []
  if (/authorization\s*:\s*bearer\s+[a-z0-9._-]+/i.test(text)) {
    warnings.push("Bearer token detected — use {{secrets.*}} instead of hardcoded values.")
  }
  if (/api[_-]?key|client[_-]?secret|password/i.test(text) && !text.includes("{{secrets.")) {
    warnings.push("Possible credential field detected — prefer secret references.")
  }
  return warnings
}
