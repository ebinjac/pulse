export type MonitorStatus = "success" | "failed" | "timeout" | "error" | "skipped"

export type StepType = "http" | "preRequest" | "delay"

export type TriggeredBy = "manual" | "schedule" | "draft" | "test"

export type ScheduleMode =
  | "manual"
  | "every-1m"
  | "every-5m"
  | "every-10m"
  | "every-15m"
  | "every-30m"
  | "hourly"
  | "custom-cron"

export type SecretProvider = "encrypted-db" | "vault"

export type AssertionType =
  | "statusCode"
  | "responseTime"
  | "jsonPath"
  | "header"
  | "bodyContains"
  | "regex"

export type ExtractorType =
  | "jsonPath"
  | "header"
  | "cookie"
  | "regex"
  | "statusCode"
  | "responseTime"

export type PreRequestActionType =
  | "setVariable"
  | "generateUUID"
  | "generateTimestamp"
  | "base64Encode"
  | "base64Decode"
  | "urlEncode"
  | "urlDecode"
  | "sha256"
  | "hmacSha256"
  | "generateJWT"
  | "setHeader"
  | "setBody"
  | "readStepOutput"

export type FailureCategory =
  | "DNS_FAILURE"
  | "CONNECTION_FAILURE"
  | "TLS_FAILURE"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "ASSERTION_FAILURE"
  | "AUTH_FAILURE"
  | "SECRET_FETCH_FAILURE"
  | "VARIABLE_RESOLUTION_FAILURE"
  | "PRE_REQUEST_FAILURE"
  | "UNKNOWN_ERROR"

export interface PulseAssertion {
  id: string
  type: AssertionType
  label: string
  target: string
  operator: string
  expected: string
  actual?: string
  sensitive?: boolean
}

export interface PulseExtractor {
  id: string
  name: string
  type: ExtractorType
  source: string
  sensitive?: boolean
  optional?: boolean
}

export interface PreRequestAction {
  id: string
  type: PreRequestActionType
  label: string
  output: string
  configPreview: string
}

export interface MonitorStep {
  id: string
  order: number
  name: string
  type: StepType
  method?: string
  url?: string
  timeoutMs: number
  retryCount: number
  continueOnFailure: boolean
  actions?: PreRequestAction[]
  assertions: PulseAssertion[]
  extractors: PulseExtractor[]
  preRequestScript?: string
  config?: Record<string, any>
}

export interface SecretReference {
  id: string
  name: string
  alias: string
  provider: SecretProvider
  description: string
  status?: "active" | "inactive"
  isActive?: boolean
  lastTestedAt: string
  path?: string
  key?: string
  value?: string
}

export interface AlertPolicy {
  enabled: boolean
  threshold: number
  responseTimeMs: number
  email: boolean
  slackWebhook: boolean
  cooldownMinutes: number
}

export interface Monitor {
  id: string
  applicationId?: string
  name: string
  description: string
  scheduleMode: ScheduleMode
  scheduleLabel: string
  cron: string
  timezone: string
  timeoutMs: number
  retryCount: number
  failureThreshold: number
  responseBodyLimitKb: number
  isActive: boolean
  variables: Record<string, string>
  secretAliases: string[]
  steps: MonitorStep[]
  alertPolicy: AlertPolicy
  status: MonitorStatus
  lastRunAt: string
  lastDurationMs: number
  successRate24h: number
  publishedVersion?: number
  hasUnpublishedDraft?: boolean
}

export interface MonitorVersionSummary {
  id: string
  monitorId: string
  versionNumber: number
  changeNote?: string
  createdBy?: string
  source: string
  createdAt: string
}

export interface MonitorVersion extends MonitorVersionSummary {
  config: Monitor
}

export interface MonitorDetail {
  published: Monitor
  draft?: Monitor
  publishedVersion: number
  hasUnpublishedDraft: boolean
}

export interface MonitorConfigChange {
  path: string
  oldValue: unknown
  newValue: unknown
}

export interface Application {
  id: string
  name: string
  carId: string
  description?: string
  owner?: string
  environment?: string
  tags?: string[]
  createdAt?: string
  updatedAt?: string
}

export interface ApplicationRunSummary {
  applicationId: string
  queued: number
  skipped: number
  monitorIds: string[]
}

export interface StepRun {
  id: string
  stepId: string
  stepName: string
  type: StepType
  status: MonitorStatus
  latencyMs: number
  timing?: HttpTiming
  requestSummary: string
  requestBody?: string
  requestHeaders?: Record<string, string>
  responseSummary: string
  statusCode?: number
  responseBody?: string
  responseHeaders?: Record<string, string>
  assertions: PulseAssertion[]
  extractors: PulseExtractor[]
  extractedVars?: Record<string, string>
  errorMessage?: string
  consoleOutput?: string[]
}

export interface HttpTiming {
  dnsLookupMs?: number
  tcpConnectMs?: number
  tlsHandshakeMs?: number
  timeToFirstByteMs?: number
  downloadMs?: number
  totalMs?: number
}

export interface MonitorRun {
  id: string
  monitorId: string
  monitorName: string
  status: MonitorStatus
  triggeredBy: TriggeredBy
  startedAt: string
  endedAt: string
  durationMs: number
  failureCategory?: FailureCategory
  failureReason?: string
  steps: StepRun[]
}

export interface AlertDelivery {
  channel: string
  status: "sent" | "failed" | "skipped" | "suppressed" | string
  detail?: string
  sentAt?: string
}

export interface AlertEvent {
  id: string
  monitorId: string
  runId?: string
  status: "open" | "suppressed" | "resolved" | string
  severity: "critical" | "warning" | string
  title: string
  description: string
  failureCategory?: FailureCategory
  channels: string[]
  deliveries: AlertDelivery[]
  firstTriggeredAt: string
  lastTriggeredAt: string
  lastDeliveredAt?: string
  resolvedAt?: string
}

export interface NotificationSettings {
  smtp: {
    addrConfigured: boolean
    fromConfigured: boolean
    toConfigured: boolean
    userConfigured: boolean
    passwordConfigured: boolean
  }
  slack: {
    webhookConfigured: boolean
  }
}

export interface NotificationSettingsInput {
  smtpHost: string
  smtpPort: string
  smtpFrom: string
  smtpTo: string
  smtpUser: string
  smtpPassword: string
  slackWebhookUrl: string
}
