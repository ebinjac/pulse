import { parse as parseYaml, stringify as stringifyYaml } from "yaml"
import type { Monitor } from "@/lib/pulse-types"
import { monitorFromExportRecord, stripMonitorForExport } from "./shared"
import type { ExportFormat, MonitorExportBundle, MonitorExportRecord } from "./types"

export function buildExportBundle(monitors: Monitor[]): MonitorExportBundle {
  return {
    version: "1",
    exportedAt: new Date().toISOString(),
    monitors: monitors.map(stripMonitorForExport),
  }
}

export function serializeExportBundle(bundle: MonitorExportBundle, format: ExportFormat): string {
  if (format === "yaml") {
    return stringifyYaml(bundle, { lineWidth: 0 })
  }
  return JSON.stringify(bundle, null, 2)
}

export function parseExportBundle(
  document: string,
  format: ExportFormat
): MonitorExportBundle {
  let parsed: unknown

  if (format === "yaml") {
    parsed = parseYaml(document)
  } else {
    parsed = JSON.parse(document)
  }

  return normalizeExportBundle(parsed)
}

export function monitorsFromExportBundle(
  bundle: MonitorExportBundle,
  applicationId?: string
): Monitor[] {
  return bundle.monitors.map((record) => monitorFromExportRecord(record, applicationId))
}

function normalizeExportBundle(parsed: unknown): MonitorExportBundle {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Export document must be a JSON or YAML object.")
  }

  const doc = parsed as Record<string, unknown>

  if (Array.isArray(doc.monitors)) {
    return {
      version: "1",
      exportedAt: String(doc.exportedAt ?? new Date().toISOString()),
      monitors: doc.monitors.map(normalizeExportRecord),
    }
  }

  // Single monitor object (raw config)
  if (doc.name && Array.isArray(doc.steps)) {
    return {
      version: "1",
      exportedAt: new Date().toISOString(),
      monitors: [normalizeExportRecord(doc)],
    }
  }

  throw new Error("Export document must include a monitors array or a single monitor definition.")
}

function normalizeExportRecord(raw: unknown): MonitorExportRecord {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid monitor record in export bundle.")
  }

  const record = raw as MonitorExportRecord & { schedule?: string; secrets?: Array<{ alias?: string }> }

  if (!record.name?.trim()) {
    throw new Error("Each exported monitor must have a name.")
  }
  if (!Array.isArray(record.steps) || !record.steps.length) {
    throw new Error(`Monitor "${record.name}" must include at least one step.`)
  }

  return {
    ...record,
    cron: record.cron ?? (record as { schedule?: string }).schedule ?? "*/5 * * * *",
    scheduleMode: record.scheduleMode ?? "every-5m",
    timezone: record.timezone ?? "UTC",
    timeoutMs: record.timeoutMs ?? 30000,
    retryCount: record.retryCount ?? 1,
    failureThreshold: record.failureThreshold ?? 3,
    responseBodyLimitKb: record.responseBodyLimitKb ?? 32,
    isActive: record.isActive ?? true,
    variables: record.variables ?? {},
    secretAliases:
      record.secretAliases ??
      (record.secrets?.map((s) => s.alias).filter(Boolean) as string[] | undefined) ??
      [],
    alertPolicy: record.alertPolicy ?? {
      enabled: true,
      threshold: 3,
      responseTimeMs: 2000,
      email: true,
      slackWebhook: false,
      cooldownMinutes: 30,
    },
  }
}
