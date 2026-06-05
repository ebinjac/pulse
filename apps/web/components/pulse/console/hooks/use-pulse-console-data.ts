"use client"

import { useEffect, useMemo, useState } from "react"
import type {
  Application,
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
} from "@/lib/pulse-types"
import type { SecretInput } from "@/components/pulse/secrets-view"
import type { DeploymentValidationCreateInput, PulseConsoleProps } from "../types"

export function usePulseConsoleData({
  applicationId,
  monitorId,
  runId,
  alertId,
  validationId,
}: PulseConsoleProps) {
  const [applications, setApplications] = useState<Application[]>([])
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [runs, setRuns] = useState<MonitorRun[]>([])
  const [deploymentValidations, setDeploymentValidations] = useState<DeploymentValidation[]>([])
  const [secrets, setSecrets] = useState<SecretReference[]>([])
  const [certificateProfiles, setCertificateProfiles] = useState<CertificateProfile[]>([])
  const [alerts, setAlerts] = useState<AlertEvent[]>([])
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null)
  const [retentionSettings, setRetentionSettings] = useState<RetentionSettings | null>(null)
  const [sloSummary, setSloSummary] = useState<SLOSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [isImportExportOpen, setIsImportExportOpen] = useState(false)

  const [activeMonitor, setActiveMonitor] = useState<Monitor | null>(null)
  const [activeRun, setActiveRun] = useState<MonitorRun | null>(null)
  const [activeValidation, setActiveValidation] = useState<DeploymentValidation | null>(null)
  const [activeValidationRuns, setActiveValidationRuns] = useState<{ preRuns: MonitorRun[]; postRuns: MonitorRun[] }>({ preRuns: [], postRuns: [] })
  const activeApplication = useMemo(() => {
    return applications.find((application) => application.id === applicationId) || null
  }, [applications, applicationId])

  // Filters for "/monitors" page
  const [monitorsSearch, setMonitorsSearch] = useState("")
  const [monitorsStatusFilter, setMonitorsStatusFilter] = useState<"all" | "active" | "inactive" | "failed" | "healthy">("all")
  const [monitorsScheduleFilter, setMonitorsScheduleFilter] = useState<"all" | "scheduled" | "manual">("all")

  // Confirmation Alert Dialog States
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    type: "disable" | "delete"
    monitorId: string
    monitorName: string
    currentActive?: boolean
  }>({
    isOpen: false,
    type: "disable",
    monitorId: "",
    monitorName: "",
    currentActive: false,
  })
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("")
  const [runningApp, setRunningApp] = useState<Application | null>(null)
  const [appRunStatus, setAppRunStatus] = useState<Record<string, { status: "queued" | "running" | "success" | "failed" | "skipped"; durationMs?: number; error?: string }>>({})
  const [appRunCompleted, setAppRunCompleted] = useState(false)

  const filteredMonitors = useMemo(() => {
    return monitors.filter((m) => {
      const q = monitorsSearch.toLowerCase()
      const matchesSearch = !monitorsSearch || 
        m.name.toLowerCase().includes(q) || 
        (m.description || "").toLowerCase().includes(q)

      const matchesStatus = 
        monitorsStatusFilter === "all" ||
        (monitorsStatusFilter === "active" && m.isActive) ||
        (monitorsStatusFilter === "inactive" && !m.isActive) ||
        (monitorsStatusFilter === "failed" && (m.status || "").toLowerCase() === "failed") ||
        (monitorsStatusFilter === "healthy" && (m.status || "").toLowerCase() !== "failed")

      const matchesSchedule = 
        monitorsScheduleFilter === "all" ||
        (monitorsScheduleFilter === "scheduled" && m.scheduleMode !== "manual") ||
        (monitorsScheduleFilter === "manual" && m.scheduleMode === "manual")

      return matchesSearch && matchesStatus && matchesSchedule
    })
  }, [monitors, monitorsSearch, monitorsStatusFilter, monitorsScheduleFilter])

  const fetchMonitors = async () => {
    try {
      const res = await fetch("/api/monitors")
      if (res.ok) {
        const data = await res.json()
        setMonitors(data.monitors || [])
      }
    } catch (err) {
      console.error("Failed to fetch monitors:", err)
    }
  }

  const fetchApplications = async () => {
    try {
      const res = await fetch("/api/applications")
      if (res.ok) {
        const data = await res.json()
        setApplications(data.applications || [])
      }
    } catch (err) {
      console.error("Failed to fetch applications:", err)
    }
  }

  const fetchDeploymentValidations = async (applicationIdVal?: string) => {
    try {
      const query = applicationIdVal ? `?applicationId=${encodeURIComponent(applicationIdVal)}` : ""
      const res = await fetch(`/api/deployment-validations${query}`)
      if (res.ok) {
        const data = await res.json()
        setDeploymentValidations(data.validations || [])
      }
    } catch (err) {
      console.error("Failed to fetch deployment validations:", err)
    }
  }

  const fetchSecrets = async () => {
    try {
      const res = await fetch("/api/secrets")
      if (res.ok) {
        const data = await res.json()
        setSecrets(data.secrets || [])
      }
    } catch (err) {
      console.error("Failed to fetch secrets:", err)
    }
  }

  const fetchCertificateProfiles = async () => {
    try {
      const res = await fetch("/api/settings/certificates")
      if (res.ok) {
        const data = await res.json()
        setCertificateProfiles(data.profiles || [])
      }
    } catch (err) {
      console.error("Failed to fetch certificate profiles:", err)
    }
  }

  const fetchAlerts = async () => {
    try {
      const res = await fetch("/api/alerts")
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.alerts || [])
      }
    } catch (err) {
      console.error("Failed to fetch alerts:", err)
    }
  }

  const fetchRuns = async () => {
    try {
      const res = await fetch("/api/runs")
      if (res.ok) {
        const data = await res.json()
        setRuns(data.runs || [])
      }
    } catch (err) {
      console.error("Failed to fetch runs:", err)
    }
  }

  const fetchNotificationSettings = async () => {
    try {
      const res = await fetch("/api/settings/notifications")
      if (res.ok) {
        const data = await res.json()
        setNotificationSettings(data.settings || null)
      }
    } catch (err) {
      console.error("Failed to fetch notification settings:", err)
    }
  }

  const fetchRetentionSettings = async () => {
    try {
      const res = await fetch("/api/settings/retention")
      if (res.ok) {
        const data = await res.json()
        setRetentionSettings(data.settings || null)
      }
    } catch (err) {
      console.error("Failed to fetch retention settings:", err)
    }
  }

  const fetchSLOSummary = async () => {
    try {
      const res = await fetch("/api/metrics/slo")
      if (res.ok) {
        const data = await res.json()
        setSloSummary(data.summary || null)
      }
    } catch (err) {
      console.error("Failed to fetch SLO summary:", err)
    }
  }

  const fetchSingleMonitor = async (id: string) => {
    try {
      const res = await fetch(`/api/monitors/${id}`)
      if (res.ok) {
        const data = await res.json()
        setActiveMonitor((data.draft ?? data.published ?? data.monitor) || null)
      }
    } catch (err) {
      console.error(`Failed to fetch monitor ${id}:`, err)
    }
  }

  const fetchSingleRun = async (id: string) => {
    try {
      const res = await fetch(`/api/runs/${id}`)
      if (res.ok) {
        const data = await res.json()
        setActiveRun(data.run || null)
      }
    } catch (err) {
      console.error(`Failed to fetch run ${id}:`, err)
    }
  }

  const fetchSingleDeploymentValidation = async (id: string) => {
    try {
      const res = await fetch(`/api/deployment-validations/${id}`)
      if (res.ok) {
        const data = await res.json()
        setActiveValidation(data.validation || null)
        setActiveValidationRuns({ preRuns: data.preRuns || [], postRuns: data.postRuns || [] })
      }
    } catch (err) {
      console.error(`Failed to fetch deployment validation ${id}:`, err)
    }
  }

  useEffect(() => {
    setLoading(true)
    const promises = [
      fetchApplications(),
      fetchMonitors(),
      fetchSecrets(),
      fetchCertificateProfiles(),
      fetchAlerts(),
      fetchRuns(),
      fetchNotificationSettings(),
      fetchRetentionSettings(),
      fetchSLOSummary(),
      fetchDeploymentValidations(applicationId),
    ]
    if (monitorId) {
      promises.push(fetchSingleMonitor(monitorId))
    }
    if (runId) {
      promises.push(fetchSingleRun(runId))
    }
    if (validationId) {
      promises.push(fetchSingleDeploymentValidation(validationId))
    }
    Promise.all(promises).finally(() => {
      setLoading(false)
    })
  }, [applicationId, monitorId, runId, alertId, validationId])

  const handleRunNow = async (monitorIdVal: string) => {
    try {
      const res = await fetch(`/api/monitors/${monitorIdVal}/run`, { method: "POST" })
      if (res.ok) {
        await Promise.all([fetchMonitors(), fetchRuns(), fetchAlerts(), fetchSLOSummary()])
      }
    } catch (err) {
      console.error("Failed to trigger monitor run:", err)
    }
  }

  const handleRunApplication = async (applicationIdVal: string) => {
    const app = applications.find(a => a.id === applicationIdVal)
    if (!app) return
    
    setRunningApp(app)
    setAppRunCompleted(false)
    const appMonitors = monitors.filter(m => m.applicationId === applicationIdVal)
    
    const initialStates: Record<string, any> = {}
    appMonitors.forEach(m => {
      initialStates[m.id] = {
        status: m.isActive ? "running" : "skipped",
      }
    })
    setAppRunStatus(initialStates)
    
    const clickTime = new Date()
    
    try {
      const res = await fetch(`/api/applications/${applicationIdVal}/run`, { method: "POST" })
      if (!res.ok) {
        throw new Error("Failed to trigger application run")
      }
      
      let ticks = 0
      const maxTicks = 15
      const interval = setInterval(async () => {
        ticks++
        const [updatedMonitors, updatedRunsRes] = await Promise.all([
          fetch(`/api/monitors`).then(r => r.json()).catch(() => ({ monitors: [] })),
          fetch(`/api/runs`).then(r => r.json()).catch(() => ({ runs: [] })),
        ])
        
        const latestMonitors = updatedMonitors.monitors || []
        const latestRuns = updatedRunsRes.runs || []
        
        setMonitors(latestMonitors)
        setRuns(latestRuns)
        
        const newStates = { ...initialStates }
        let allDone = true
        
        appMonitors.forEach(m => {
          if (!m.isActive) {
            newStates[m.id] = { status: "skipped" }
            return
          }
          
          const monitorRuns = latestRuns.filter((r: any) => r.monitorId === m.id)
          monitorRuns.sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
          const latestRun = monitorRuns[0]
          
          if (latestRun && new Date(latestRun.startedAt).getTime() >= clickTime.getTime() - 5000) {
            const isCompleted = ["success", "failed", "timeout", "error"].includes(latestRun.status)
            newStates[m.id] = {
              status: latestRun.status === "success" ? "success" : "failed",
              durationMs: latestRun.durationMs,
              error: latestRun.failureReason,
            }
            if (!isCompleted) {
              allDone = false
            }
          } else {
            newStates[m.id] = { status: "running" }
            allDone = false
          }
        })
        
        setAppRunStatus(newStates)
        
        if (allDone || ticks >= maxTicks) {
          clearInterval(interval)
          setAppRunCompleted(true)
          await fetchAlerts()
        }
      }, 1500)
    } catch (err) {
      console.error("Failed to run application:", err)
      setRunningApp(null)
    }
  }

  const handleSaveApplication = async (input: Application) => {
    const res = await fetch(input.id ? `/api/applications/${input.id}` : "/api/applications", {
      method: input.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to save application.")
    }
    await fetchApplications()
  }

  const handleCreateDeploymentValidation = async (input: DeploymentValidationCreateInput) => {
    const res = await fetch("/api/deployment-validations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to create deployment validation.")
    }
    await fetchDeploymentValidations(input.applicationId)
    const validation = (data.validation || null) as DeploymentValidation | null
    if (validation) {
      window.location.href = `/deployments/${validation.id}`
    }
    return validation
  }

  const handleRunDeploymentValidationPost = async (id: string) => {
    const res = await fetch(`/api/deployment-validations/${id}/run-post`, { method: "POST" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to run post-deploy checks.")
    }
  }

  const handleGenerateDeploymentAIReport = async (validation: DeploymentValidation, preRuns: MonitorRun[], postRuns: MonitorRun[]) => {
    const copilotRes = await fetch("/api/copilot/deployment-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validation, preRuns, postRuns }),
    })
    const copilotData = await copilotRes.json().catch(() => ({}))
    if (!copilotRes.ok) {
      throw new Error(copilotData.error || "Failed to generate AI deployment report.")
    }

    const saveRes = await fetch(`/api/deployment-validations/${validation.id}/ai-report`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(copilotData.result || {}),
    })
    const saveData = await saveRes.json().catch(() => ({}))
    if (!saveRes.ok) {
      throw new Error(saveData.error || "Failed to save AI deployment report.")
    }
    const updated = (saveData.validation || null) as DeploymentValidation | null
    if (updated) {
      setActiveValidation(updated)
      await fetchDeploymentValidations(updated.applicationId)
    }
    return updated
  }

  const executeToggleActive = async (monitorIdVal: string, currentActive: boolean) => {
    const monitorItem = monitors.find((m) => m.id === monitorIdVal) || activeMonitor
    if (!monitorItem) return
    try {
      const res = await fetch(`/api/monitors/${monitorIdVal}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...monitorItem, isActive: !currentActive }),
      })
      if (res.ok) {
        await Promise.all([fetchMonitors(), monitorIdVal ? fetchSingleMonitor(monitorIdVal) : Promise.resolve()])
      }
    } catch (err) {
      console.error("Failed to toggle monitor active status:", err)
    }
  }

  const executeDeleteMonitor = async (monitorIdVal: string) => {
    try {
      const res = await fetch(`/api/monitors/${monitorIdVal}`, {
        method: "DELETE",
      })
      if (res.ok) {
        await Promise.all([fetchMonitors(), fetchRuns(), fetchAlerts(), fetchSLOSummary()])
      }
    } catch (err) {
      console.error("Failed to delete monitor:", err)
    }
  }

  const handleToggleActive = async (monitorIdVal: string, currentActive: boolean) => {
    if (currentActive) {
      const mName = monitors.find((m) => m.id === monitorIdVal)?.name || activeMonitor?.name || "Monitor"
      setConfirmDialog({
        isOpen: true,
        type: "disable",
        monitorId: monitorIdVal,
        monitorName: mName,
        currentActive,
      })
    } else {
      await executeToggleActive(monitorIdVal, currentActive)
    }
  }

  const handleDeleteMonitor = async (monitorIdVal: string) => {
    const mName = monitors.find((m) => m.id === monitorIdVal)?.name || activeMonitor?.name || "Monitor"
    setDeleteConfirmInput("")
    setConfirmDialog({
      isOpen: true,
      type: "delete",
      monitorId: monitorIdVal,
      monitorName: mName,
    })
  }

  const handleSaveSecret = async (secret: SecretReference | null, input: SecretInput) => {
    const payload = {
      name: input.name.trim(),
      alias: input.alias.trim(),
      description: input.description.trim(),
      provider: "encrypted-db",
      value: input.value,
      isActive: input.isActive,
    }
    const res = await fetch(secret ? `/api/secrets/${secret.id}` : "/api/secrets", {
      method: secret ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to save secret.")
    }
    await fetchSecrets()
  }

  const handleTestSecret = async (secret: SecretReference) => {
    const res = await fetch(`/api/secrets/${secret.id}/test`, { method: "POST" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to test secret.")
    }
    const data = await res.json()
    return Boolean(data.ok)
  }

  const handleDeleteSecret = async (secretIdVal: string) => {
    try {
      const res = await fetch(`/api/secrets/${secretIdVal}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to delete secret.")
      }
      await fetchSecrets()
    } catch (err) {
      console.error("Failed to delete secret:", err)
      throw err
    }
  }

  const handleSaveNotificationSettings = async (input: NotificationSettingsInput) => {
    const res = await fetch("/api/settings/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to save notification settings.")
    }
    setNotificationSettings(data.settings || null)
    await fetchSecrets()
  }

  const handleTestNotificationSettings = async (input: NotificationSettingsInput): Promise<NotificationTestResult> => {
    const res = await fetch("/api/settings/notifications/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to send test alert.")
    }
    return data as NotificationTestResult
  }

  const handleSaveRetentionSettings = async (settings: RetentionSettings): Promise<RetentionSettings> => {
    const res = await fetch("/api/settings/retention", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to save retention settings.")
    }
    const updated = (data.settings || settings) as RetentionSettings
    setRetentionSettings(updated)
    return updated
  }

  const handlePurgeRetention = async (): Promise<RetentionPurgeResult> => {
    const res = await fetch("/api/settings/retention/purge", { method: "POST" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to purge expired runs.")
    }
    await fetchRuns()
    return data as RetentionPurgeResult
  }

  const handleSaveCertificateProfile = async (input: CertificateProfileInput) => {
    const url = input.id ? `/api/settings/certificates/${input.id}` : "/api/settings/certificates"
    const res = await fetch(url, {
      method: input.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to save certificate profile.")
    }
    await Promise.all([fetchCertificateProfiles(), fetchSecrets()])
  }

  const handleTestCertificateProfile = async (profile: CertificateProfile): Promise<boolean> => {
    const res = await fetch(`/api/settings/certificates/${profile.id}/test`, { method: "POST" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to test certificate profile.")
    }
    await fetchCertificateProfiles()
    if (data.error) {
      throw new Error(data.error)
    }
    return Boolean(data.ok)
  }

  const handleDeleteCertificateProfile = async (profileId: string) => {
    const res = await fetch(`/api/settings/certificates/${profileId}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to delete certificate profile.")
    }
    await fetchCertificateProfiles()
  }

  return {
    data: {
      applications,
      monitors,
      runs,
      deploymentValidations,
      secrets,
      certificateProfiles,
      alerts,
      notificationSettings,
      retentionSettings,
      sloSummary,
      filteredMonitors,
    },
    active: {
      activeMonitor,
      activeRun,
      activeValidation,
      activeValidationRuns,
      activeApplication,
      runningApp,
      setRunningApp,
      appRunStatus,
      appRunCompleted,
    },
    ui: {
      loading,
      isImportExportOpen,
      setIsImportExportOpen,
      confirmDialog,
      setConfirmDialog,
      deleteConfirmInput,
      setDeleteConfirmInput,
      monitorsSearch,
      setMonitorsSearch,
      monitorsStatusFilter,
      setMonitorsStatusFilter,
      monitorsScheduleFilter,
      setMonitorsScheduleFilter,
    },
    actions: {
      fetchMonitors,
      fetchApplications,
      fetchDeploymentValidations,
      fetchSecrets,
      fetchCertificateProfiles,
      fetchAlerts,
      fetchRuns,
      fetchNotificationSettings,
      fetchRetentionSettings,
      fetchSLOSummary,
      fetchSingleMonitor,
      fetchSingleRun,
      fetchSingleDeploymentValidation,
      handleRunNow,
      handleRunApplication,
      handleSaveApplication,
      handleCreateDeploymentValidation,
      handleRunDeploymentValidationPost,
      handleGenerateDeploymentAIReport,
      executeToggleActive,
      executeDeleteMonitor,
      handleToggleActive,
      handleDeleteMonitor,
      handleSaveSecret,
      handleTestSecret,
      handleDeleteSecret,
      handleSaveNotificationSettings,
      handleTestNotificationSettings,
      handleSaveRetentionSettings,
      handlePurgeRetention,
      handleSaveCertificateProfile,
      handleTestCertificateProfile,
      handleDeleteCertificateProfile,
    },
  }
}
