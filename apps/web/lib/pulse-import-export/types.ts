import type { Monitor } from "@/lib/pulse-types"

export type ExportFormat = "json" | "yaml"

export type PostmanImportMode = "workflow" | "per-request"

export interface ImportWarning {
  code: string
  message: string
  path?: string
}

export interface PostmanImportOptions {
  applicationId?: string
  mode?: PostmanImportMode
  scheduleMode?: Monitor["scheduleMode"]
  cron?: string
  baseUrlVariable?: string
}

export interface OpenApiImportOptions {
  applicationId?: string
  baseUrl?: string
  scheduleMode?: Monitor["scheduleMode"]
  cron?: string
  /** When set, only import these operation keys (e.g. "GET /users") */
  operations?: string[]
}

export interface PostmanImportResult {
  monitors: Monitor[]
  warnings: ImportWarning[]
  stats: {
    requestCount: number
    monitorCount: number
    mode: PostmanImportMode
  }
}

export interface OpenApiImportResult {
  monitors: Monitor[]
  warnings: ImportWarning[]
  operations: OpenApiOperationPreview[]
  stats: {
    operationCount: number
    monitorCount: number
  }
}

export interface OpenApiOperationPreview {
  key: string
  method: string
  path: string
  summary: string
  tags: string[]
}

export interface MonitorExportBundle {
  version: "1"
  exportedAt: string
  monitors: MonitorExportRecord[]
}

export interface MonitorExportRecord {
  name: string
  description: string
  applicationId?: string
  scheduleMode: Monitor["scheduleMode"]
  scheduleLabel?: string
  cron: string
  timezone: string
  timeoutMs: number
  retryCount: number
  failureThreshold: number
  responseBodyLimitKb: number
  isActive: boolean
  variables: Record<string, string>
  secretAliases: string[]
  steps: Monitor["steps"]
  alertPolicy: Monitor["alertPolicy"]
}
