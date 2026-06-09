export class PulseClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message)
    this.name = "PulseClientError"
  }
}

export interface PulseClient {
  listApplications(): Promise<import("@/lib/pulse-types").Application[]>
  saveApplication(application: import("@/lib/pulse-types").Application): Promise<void>
  deleteApplication(applicationId: string): Promise<void>
  runApplication(applicationId: string): Promise<import("@/lib/pulse-types").ApplicationRunSummary>
  listApplicationServices(applicationId: string): Promise<import("@/lib/pulse-types").ApplicationService[]>
  saveApplicationService(
    applicationId: string,
    serviceId: string | null,
    input: import("@/lib/pulse-types").ApplicationServiceInput
  ): Promise<import("@/lib/pulse-types").ApplicationService | null>
  deleteApplicationService(applicationId: string, serviceId: string): Promise<void>

  listMonitors(): Promise<import("@/lib/pulse-types").Monitor[]>
  getMonitor(id: string): Promise<import("@/lib/pulse-types").Monitor | null>
  updateMonitor(monitor: import("@/lib/pulse-types").Monitor): Promise<void>
  deleteMonitor(id: string): Promise<void>
  runMonitor(id: string): Promise<void>

  listRuns(): Promise<import("@/lib/pulse-types").MonitorRun[]>
  getRun(id: string): Promise<import("@/lib/pulse-types").MonitorRun | null>

  listAlerts(): Promise<import("@/lib/pulse-types").AlertEvent[]>

  listSecrets(): Promise<import("@/lib/pulse-types").SecretReference[]>
  saveSecret(
    secret: import("@/lib/pulse-types").SecretReference | null,
    input: import("@/components/pulse/secrets-view").SecretInput
  ): Promise<void>
  testSecret(secret: import("@/lib/pulse-types").SecretReference): Promise<boolean>
  deleteSecret(id: string): Promise<void>

  listCertificateProfiles(): Promise<import("@/lib/pulse-types").CertificateProfile[]>
  saveCertificateProfile(input: import("@/lib/pulse-types").CertificateProfileInput): Promise<void>
  testCertificateProfile(profile: import("@/lib/pulse-types").CertificateProfile): Promise<boolean>
  deleteCertificateProfile(id: string): Promise<void>

  getNotificationSettings(): Promise<import("@/lib/pulse-types").NotificationSettings | null>
  saveNotificationSettings(input: import("@/lib/pulse-types").NotificationSettingsInput): Promise<import("@/lib/pulse-types").NotificationSettings | null>
  testNotificationSettings(input: import("@/lib/pulse-types").NotificationSettingsInput): Promise<import("@/lib/pulse-types").NotificationTestResult>

  getRetentionSettings(): Promise<import("@/lib/pulse-types").RetentionSettings | null>
  saveRetentionSettings(settings: import("@/lib/pulse-types").RetentionSettings): Promise<import("@/lib/pulse-types").RetentionSettings>
  purgeRetention(): Promise<import("@/lib/pulse-types").RetentionPurgeResult>

  getSLOSummary(): Promise<import("@/lib/pulse-types").SLOSummary | null>

  listDeploymentValidations(applicationId?: string): Promise<import("@/lib/pulse-types").DeploymentValidation[]>
  getDeploymentValidation(id: string): Promise<{
    validation: import("@/lib/pulse-types").DeploymentValidation | null
    preRuns: import("@/lib/pulse-types").MonitorRun[]
    postRuns: import("@/lib/pulse-types").MonitorRun[]
  }>
  createDeploymentValidation(input: import("@/components/pulse/console/types").DeploymentValidationCreateInput): Promise<import("@/lib/pulse-types").DeploymentValidation | null>
  updateDeploymentValidation(input: import("@/components/pulse/console/types").DeploymentValidationUpdateInput): Promise<import("@/lib/pulse-types").DeploymentValidation | null>
  deleteDeploymentValidation(validationId: string): Promise<void>
  runDeploymentValidationPost(id: string): Promise<void>
  saveDeploymentAIReport(
    validationId: string,
    report: unknown
  ): Promise<import("@/lib/pulse-types").DeploymentValidation | null>
  generateDeploymentAIReport(
    validation: import("@/lib/pulse-types").DeploymentValidation,
    preRuns: import("@/lib/pulse-types").MonitorRun[],
    postRuns: import("@/lib/pulse-types").MonitorRun[]
  ): Promise<unknown>

  getElfProxySettings(): Promise<import("@/lib/pulse-types").ElfProxySettings | null>
  saveElfProxySettings(input: import("@/lib/pulse-types").ElfProxySettingsInput): Promise<import("@/lib/pulse-types").ElfProxySettings | null>
  testElfProxySettings(input: {
    baseUrl?: string
    indexPathTemplate?: string
    elfAppId?: string
    pretty?: boolean
  }): Promise<{
    ok: boolean
    curl?: string
    searchUrl?: string
    indexPath?: string
    error?: string
    result?: import("@/lib/pulse-types").ElfQueryRunResult
  }>

  listElfQueries(applicationId?: string): Promise<import("@/lib/pulse-types").ElfQuery[]>
  saveElfQuery(queryId: string | null, input: import("@/lib/pulse-types").ElfQueryInput): Promise<import("@/lib/pulse-types").ElfQuery | null>
  deleteElfQuery(queryId: string): Promise<void>
  testElfQuery(queryId: string, input?: { elfAppId?: string; applicationId?: string }): Promise<{ ok: boolean; result?: import("@/lib/pulse-types").ElfQueryRunResult }>
  probeElfQuery(
    queryId: string,
    input?: import("@/lib/pulse-types").ElfQueryProbeInput
  ): Promise<{ ok: boolean; probe?: import("@/lib/pulse-types").ElfQueryProbeResult; query?: import("@/lib/pulse-types").ElfQuery }>
  validateElfQueryCheck(
    queryId: string,
    input?: import("@/lib/pulse-types").ElfQueryValidateCheckInput
  ): Promise<import("@/lib/pulse-types").ElfQueryValidateCheckResult>

  runDeploymentValidationLogCheck(id: string): Promise<void>
}
