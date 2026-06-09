import type {
  Application,
  ApplicationRunSummary,
  ApplicationService,
  AlertEvent,
  CertificateProfile,
  CertificateProfileInput,
  DeploymentValidation,
  Monitor,
  MonitorRun,
  NotificationSettings,
  NotificationSettingsInput,
  NotificationTestResult,
  RetentionPurgeResult,
  RetentionSettings,
  SecretReference,
  SLOSummary,
  ElfProxySettings,
  ElfProxySettingsInput,
  ElfQuery,
  ElfQueryInput,
  ElfQueryProbeResult,
  ElfQueryRunResult,
  ElfQueryValidateCheckResult,
} from "@/lib/pulse-types"
import type { SecretInput } from "@/components/pulse/secrets-view"
import type { DeploymentValidationCreateInput } from "@/components/pulse/console/types"
import { PulseClientError } from "./types"
import type { PulseClient } from "./types"

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new PulseClientError(
      (data as { error?: string }).error || `Request failed: ${url}`,
      res.status
    )
  }
  return data as T
}

async function requestOk(url: string, init?: RequestInit): Promise<void> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new PulseClientError(
      (data as { error?: string }).error || `Request failed: ${url}`,
      res.status
    )
  }
}

export const pulseClient: PulseClient = {
  async listApplications() {
    const data = await requestJson<{ applications?: Application[] }>("/api/applications")
    return data.applications || []
  },

  async saveApplication(application) {
    await requestJson(
      application.id ? `/api/applications/${application.id}` : "/api/applications",
      {
        method: application.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(application),
      }
    )
  },

  async deleteApplication(applicationId) {
    await requestOk(`/api/applications/${applicationId}`, { method: "DELETE" })
  },

  async runApplication(applicationId) {
    const data = await requestJson<{ summary?: ApplicationRunSummary }>(
      `/api/applications/${applicationId}/run`,
      { method: "POST" },
    )
    return (
      data.summary || {
        applicationId,
        queued: 0,
        skipped: 0,
        monitorIds: [],
      }
    )
  },

  async listApplicationServices(applicationId) {
    const data = await requestJson<{ services?: ApplicationService[] }>(
      `/api/applications/${applicationId}/services`
    )
    return data.services || []
  },

  async saveApplicationService(applicationId, serviceId, input) {
    const data = await requestJson<{ service?: ApplicationService }>(
      serviceId
        ? `/api/applications/${applicationId}/services/${serviceId}`
        : `/api/applications/${applicationId}/services`,
      {
        method: serviceId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    )
    return data.service || null
  },

  async deleteApplicationService(applicationId, serviceId) {
    await requestOk(`/api/applications/${applicationId}/services/${serviceId}`, { method: "DELETE" })
  },

  async listMonitors() {
    const data = await requestJson<{ monitors?: Monitor[] }>("/api/monitors")
    return data.monitors || []
  },

  async getMonitor(id) {
    const data = await requestJson<{ draft?: Monitor; published?: Monitor; monitor?: Monitor }>(
      `/api/monitors/${id}`
    )
    return (data.draft ?? data.published ?? data.monitor) || null
  },

  async updateMonitor(monitor) {
    await requestOk(`/api/monitors/${monitor.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(monitor),
    })
  },

  async deleteMonitor(id) {
    await requestOk(`/api/monitors/${id}`, { method: "DELETE" })
  },

  async runMonitor(id) {
    await requestOk(`/api/monitors/${id}/run`, { method: "POST" })
  },

  async listRuns() {
    const data = await requestJson<{ runs?: MonitorRun[] }>("/api/runs")
    return data.runs || []
  },

  async getRun(id) {
    const data = await requestJson<{ run?: MonitorRun }>(`/api/runs/${id}`)
    return data.run || null
  },

  async listAlerts() {
    const data = await requestJson<{ alerts?: AlertEvent[] }>("/api/alerts")
    return data.alerts || []
  },

  async listSecrets() {
    const data = await requestJson<{ secrets?: SecretReference[] }>("/api/secrets")
    return data.secrets || []
  },

  async saveSecret(secret, input) {
    const payload = {
      name: input.name.trim(),
      alias: input.alias.trim(),
      description: input.description.trim(),
      provider: "encrypted-db",
      value: input.value,
      isActive: input.isActive,
    }
    await requestJson(secret ? `/api/secrets/${secret.id}` : "/api/secrets", {
      method: secret ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  },

  async testSecret(secret) {
    const data = await requestJson<{ ok?: boolean }>(`/api/secrets/${secret.id}/test`, { method: "POST" })
    return Boolean(data.ok)
  },

  async deleteSecret(id) {
    await requestOk(`/api/secrets/${id}`, { method: "DELETE" })
  },

  async listCertificateProfiles() {
    const data = await requestJson<{ profiles?: CertificateProfile[] }>("/api/settings/certificates")
    return data.profiles || []
  },

  async saveCertificateProfile(input) {
    const url = input.id ? `/api/settings/certificates/${input.id}` : "/api/settings/certificates"
    await requestJson(url, {
      method: input.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  },

  async testCertificateProfile(profile) {
    const data = await requestJson<{ ok?: boolean; error?: string }>(
      `/api/settings/certificates/${profile.id}/test`,
      { method: "POST" }
    )
    if (data.error) throw new PulseClientError(data.error)
    return Boolean(data.ok)
  },

  async deleteCertificateProfile(id) {
    await requestOk(`/api/settings/certificates/${id}`, { method: "DELETE" })
  },

  async getNotificationSettings() {
    const data = await requestJson<{ settings?: NotificationSettings }>("/api/settings/notifications")
    return data.settings || null
  },

  async saveNotificationSettings(input) {
    const data = await requestJson<{ settings?: NotificationSettings }>("/api/settings/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    return data.settings || null
  },

  async testNotificationSettings(input) {
    return requestJson<NotificationTestResult>("/api/settings/notifications/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  },

  async getRetentionSettings() {
    const data = await requestJson<{ settings?: RetentionSettings }>("/api/settings/retention")
    return data.settings || null
  },

  async saveRetentionSettings(settings) {
    const data = await requestJson<{ settings?: RetentionSettings }>("/api/settings/retention", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
    return (data.settings || settings) as RetentionSettings
  },

  async purgeRetention() {
    return requestJson<RetentionPurgeResult>("/api/settings/retention/purge", { method: "POST" })
  },

  async getSLOSummary() {
    const data = await requestJson<{ summary?: SLOSummary }>("/api/metrics/slo")
    return data.summary || null
  },

  async listDeploymentValidations(applicationId) {
    const query = applicationId ? `?applicationId=${encodeURIComponent(applicationId)}` : ""
    const data = await requestJson<{ validations?: DeploymentValidation[] }>(
      `/api/deployment-validations${query}`
    )
    return data.validations || []
  },

  async getDeploymentValidation(id) {
    const data = await requestJson<{
      validation?: DeploymentValidation
      preRuns?: MonitorRun[]
      postRuns?: MonitorRun[]
    }>(`/api/deployment-validations/${id}`)
    return {
      validation: data.validation || null,
      preRuns: data.preRuns || [],
      postRuns: data.postRuns || [],
    }
  },

  async createDeploymentValidation(input) {
    const data = await requestJson<{ validation?: DeploymentValidation }>("/api/deployment-validations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    return data.validation || null
  },

  async updateDeploymentValidation(input) {
    const data = await requestJson<{ validation?: DeploymentValidation }>(
      `/api/deployment-validations/${input.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    )
    return data.validation || null
  },

  async deleteDeploymentValidation(validationId) {
    await requestOk(`/api/deployment-validations/${validationId}`, { method: "DELETE" })
  },

  async runDeploymentValidationPost(id) {
    await requestOk(`/api/deployment-validations/${id}/run-post`, { method: "POST" })
  },

  async runDeploymentValidationLogCheck(id) {
    await requestOk(`/api/deployment-validations/${id}/run-log-check`, { method: "POST" })
  },

  async getElfProxySettings() {
    const data = await requestJson<{ settings?: ElfProxySettings }>("/api/settings/elf-proxy")
    return data.settings || null
  },

  async saveElfProxySettings(input) {
    const data = await requestJson<{ settings?: ElfProxySettings }>("/api/settings/elf-proxy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    return data.settings || null
  },

  async testElfProxySettings(input) {
    return requestJson<{
      ok: boolean
      curl?: string
      searchUrl?: string
      indexPath?: string
      error?: string
      result?: ElfQueryRunResult
    }>("/api/settings/elf-proxy/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  },

  async listElfQueries(applicationId) {
    const query = applicationId ? `?applicationId=${encodeURIComponent(applicationId)}` : ""
    const data = await requestJson<{ queries?: ElfQuery[] }>(`/api/elf-queries${query}`)
    return data.queries || []
  },

  async saveElfQuery(queryId, input) {
    const data = await requestJson<{ query?: ElfQuery }>(
      queryId ? `/api/elf-queries/${queryId}` : "/api/elf-queries",
      {
        method: queryId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    )
    return data.query || null
  },

  async deleteElfQuery(queryId) {
    await requestOk(`/api/elf-queries/${queryId}`, { method: "DELETE" })
  },

  async testElfQuery(queryId, input = {}) {
    return requestJson<{ ok: boolean; result?: ElfQueryRunResult }>(`/api/elf-queries/${queryId}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  },

  async probeElfQuery(queryId, input = {}) {
    return requestJson<{ ok: boolean; probe?: ElfQueryProbeResult; query?: ElfQuery }>(
      `/api/elf-queries/${queryId}/probe`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    )
  },

  async validateElfQueryCheck(queryId, input = {}) {
    return requestJson<ElfQueryValidateCheckResult>(`/api/elf-queries/${queryId}/validate-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  },

  async generateDeploymentAIReport(validation, preRuns, postRuns) {
    const data = await requestJson<{ result?: unknown }>("/api/copilot/deployment-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validation, preRuns, postRuns }),
    })
    return data.result
  },

  async saveDeploymentAIReport(validationId, report) {
    const data = await requestJson<{ validation?: DeploymentValidation }>(
      `/api/deployment-validations/${validationId}/ai-report`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      }
    )
    return data.validation || null
  },
}
