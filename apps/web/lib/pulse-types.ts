export type MonitorStatus = "success" | "failed" | "timeout" | "error" | "skipped"

export type StepType = "http" | "preRequest" | "delay" | "dns" | "tcp" | "tls"

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
  | "certExpiryDays"
  | "dnsRecords"

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

export type RequestAuthType = "noAuth" | "apiKey" | "bearer" | "basic" | "jwtBearer"

export interface RequestAuthConfig {
  type?: RequestAuthType
  key?: string
  value?: string
  addTo?: "header" | "query"
  token?: string
  username?: string
  password?: string
  algorithm?: "HS256" | "HS384" | "HS512"
  secret?: string
  secretBase64Encoded?: boolean
  payload?: string
  headers?: string
  headerPrefix?: string
  headerName?: string
  queryKey?: string
}

export interface RequestCookieConfig {
  enabled?: boolean
  mode?: "jar"
  manual?: Array<{
    name: string
    value: string
    domain?: string
    path?: string
  }>
}

export interface RequestMTLSConfig {
  mode?: "global" | "none" | "profile" | "custom"
  profileId?: string
  enabled?: boolean
  certSecretAlias?: string
  keySecretAlias?: string
  caCertSecretAlias?: string
  insecureSkipVerify?: boolean
}

export interface RequestProxyConfig {
  enabled?: boolean
  url?: string
  username?: string
  password?: string
}

export interface CertificateProfile {
  id: string
  name: string
  host: string
  port: number
  certType: "pem" | "pfx"
  certSecretAlias?: string
  keySecretAlias?: string
  pfxSecretAlias?: string
  caCertSecretAlias?: string
  passphraseSecretAlias?: string
  insecureSkipVerify: boolean
  isActive: boolean
  lastTestedAt?: string
  createdAt: string
  updatedAt: string
}

export interface CertificateProfileInput {
  id?: string
  name: string
  host: string
  port: number
  certType: "pem" | "pfx"
  certFile?: string
  keyFile?: string
  pfxFile?: string
  caCertFile?: string
  passphrase?: string
  insecureSkipVerify: boolean
  isActive: boolean
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
  config?: Record<string, any> & {
    auth?: RequestAuthConfig
    cookies?: RequestCookieConfig
    mtls?: RequestMTLSConfig
    proxy?: RequestProxyConfig
  }
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

export interface AlertRouting {
  enabled?: boolean
  severity?: string
  threshold?: number
  responseTimeMs?: number
  cooldownMinutes?: number
  email?: boolean
  slackWebhook?: boolean
  emailTo?: string[]
  onCallTargets?: string[]
  slackWebhookSecret?: string
  inheritFromApplication?: boolean
}

export interface AlertPolicy {
  enabled: boolean
  threshold: number
  responseTimeMs: number
  email: boolean
  slackWebhook: boolean
  cooldownMinutes: number
  severity?: string
  emailTo?: string[]
  onCallTargets?: string[]
  slackWebhookSecret?: string
  inheritFromApplication?: boolean
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
  alertRouting?: AlertRouting
  createdAt?: string
  updatedAt?: string
}

export interface ApplicationRunSummary {
  applicationId: string
  queued: number
  skipped: number
  monitorIds: string[]
}

export type DeploymentValidationStatus =
  | "draft"
  | "pre_running"
  | "pre_complete"
  | "post_running"
  | "report_ready"
  | "incomplete"

export type DeploymentValidationPhase = "pre_deploy" | "post_deploy"

export interface DeploymentValidationSummary {
  totalMonitors: number
  comparedMonitors: number
  preSuccessRate: number
  postSuccessRate: number
  successRateDelta: number
  preP95LatencyMs: number
  postP95LatencyMs: number
  p95LatencyDeltaMs: number
  p95LatencyDeltaPct: number
  newFailures: number
  resolvedFailures: number
}

export interface MonitorValidationComparison {
  monitorId: string
  monitorName: string
  preRunId?: string
  postRunId?: string
  preStatus?: MonitorStatus
  postStatus?: MonitorStatus
  preDurationMs: number
  postDurationMs: number
  durationDeltaMs: number
  durationDeltaPct: number
  result: "pass" | "warning" | "fail" | "incomplete" | string
  reason?: string
  slowestTimingPhase?: string
  slowestTimingDeltaMs?: number
}

export interface DeploymentValidationReport {
  status: "pass" | "warning" | "fail" | "incomplete" | string
  summary: DeploymentValidationSummary
  regressions: string[]
  monitorComparisons: MonitorValidationComparison[]
  generatedAt?: string
  incompleteReason?: string
}

export interface DeploymentValidationAIReport {
  generatedAt?: string
  executiveSummary?: string
  recommendation?: string
  riskLevel?: string
  keyFindings?: string[]
  nextActions?: string[]
}

export interface DeploymentValidation {
  id: string
  applicationId: string
  applicationName: string
  carId: string
  name: string
  version?: string
  buildId?: string
  environment?: string
  status: DeploymentValidationStatus
  monitorIds: string[]
  report?: DeploymentValidationReport
  aiReport?: DeploymentValidationAIReport
  sampleCount: number
  intervalSeconds: number
  deploymentStartedAt?: string
  baselineWindowHours: number
  baselineRunCount: number
  createdAt: string
  updatedAt: string
  preStartedAt?: string
  preCompletedAt?: string
  postStartedAt?: string
  postCompletedAt?: string
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
  status: "open" | "acknowledged" | "suppressed" | "resolved" | string
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
  acknowledgedBy?: string
  acknowledgedAt?: string
  snoozedUntil?: string
  suppressionReason?: string
}

export interface MaintenanceWindow {
  id: string
  scopeType: "global" | "application" | "monitor" | string
  scopeId?: string
  startsAt: string
  endsAt: string
  reason?: string
  createdBy?: string
  createdAt?: string
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

export interface NotificationTestResult {
  ok: boolean
  deliveries: AlertDelivery[]
}

export interface RetentionSettings {
  runsRetentionDays: number
  enabled: boolean
}

export interface RetentionPurgeResult {
  deleted: number
  runsRetentionDays?: number
  enabled?: boolean
  message?: string
}

export interface UptimeWindow {
  uptimePct: number
  totalRuns: number
  successfulRuns: number
}

export interface LatencyPercentiles {
  p50Ms: number
  p95Ms: number
  p99Ms: number
  avgMs: number
}

export interface MonitorSLO {
  monitorId: string
  uptime7d: UptimeWindow
  uptime30d: UptimeWindow
  runLatency7d: LatencyPercentiles
  runLatency30d: LatencyPercentiles
  stepLatency7d: LatencyPercentiles
  stepLatency30d: LatencyPercentiles
}

export interface ApplicationSLO {
  applicationId: string
  uptime7d: UptimeWindow
  uptime30d: UptimeWindow
  runLatency7d: LatencyPercentiles
  runLatency30d: LatencyPercentiles
}

export interface ErrorBudgetSummary {
  targetUptimePct: number
  actualUptime30dPct: number
  errorBudgetRemainingPct: number
  allowedDowntimeMinutes30d: number
  consumedDowntimeMinutes30d: number
}

export interface SLOSummary {
  targetUptimePct: number
  global: UptimeWindow
  globalLatency30d: LatencyPercentiles
  errorBudget: ErrorBudgetSummary
  monitors: MonitorSLO[]
  applications: ApplicationSLO[]
}
