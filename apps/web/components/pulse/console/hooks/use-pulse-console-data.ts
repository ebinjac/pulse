"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
  ElfQuery,
  ElfQueryInput,
  ElfQueryProbeInput,
  ElfProxySettings,
  ElfProxySettingsInput,
} from "@/lib/pulse-types"
import type { SecretInput } from "@/components/pulse/secrets-view"
import { notifyPulseToast } from "@/components/pulse/pulse-toast-queue"
import { pulseClient } from "@/lib/pulse-client"
import type {
  DeploymentValidationCreateInput,
  DeploymentValidationUpdateInput,
  PulseConsoleProps,
} from "../types"
import {
  PULSE_EVENT_TYPES,
  topicAlerts,
  topicApplicationRunBatch,
  type AlertEventData,
  type AlertResolvedData,
  type RunBatchEventData,
} from "@/lib/pulse-events"
import { getViewDataRequirements } from "./view-data-requirements"
import { useMonitorFilters } from "./use-monitor-filters"
import { usePulseEventStream } from "./use-pulse-event-stream"

export function usePulseConsoleData({
  view = "dashboard",
  applicationId,
  monitorId,
  runId,
  alertId,
  validationId,
  queryId,
}: PulseConsoleProps) {
  const requirements = useMemo(() => getViewDataRequirements(view), [view])

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
  const [elfQueries, setElfQueries] = useState<ElfQuery[]>([])
  const [elfProxySettings, setElfProxySettings] = useState<ElfProxySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [isImportExportOpen, setIsImportExportOpen] = useState(false)

  const [activeMonitor, setActiveMonitor] = useState<Monitor | null>(null)
  const [activeRun, setActiveRun] = useState<MonitorRun | null>(null)
  const [activeValidation, setActiveValidation] = useState<DeploymentValidation | null>(null)
  const [activeValidationRuns, setActiveValidationRuns] = useState<{ preRuns: MonitorRun[]; postRuns: MonitorRun[] }>({ preRuns: [], postRuns: [] })

  const activeApplication = useMemo(() => {
    return applications.find((application) => application.id === applicationId) || null
  }, [applications, applicationId])

  const {
    monitorsSearch,
    setMonitorsSearch,
    monitorsStatusFilter,
    setMonitorsStatusFilter,
    monitorsScheduleFilter,
    setMonitorsScheduleFilter,
    filteredMonitors,
  } = useMonitorFilters(monitors)

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
  const [appRunBatch, setAppRunBatch] = useState<{ applicationId: string; batchId: string } | null>(null)

  usePulseEventStream(
    requirements.alerts ? [topicAlerts()] : [],
    (event) => {
      if (event.type === PULSE_EVENT_TYPES.alertCreated) {
        const data = event.data as AlertEventData
        setAlerts((prev) => {
          if (prev.some((alert) => alert.id === data.alert.id)) return prev
          return [data.alert, ...prev]
        })
        return
      }
      if (event.type === PULSE_EVENT_TYPES.alertAcknowledged) {
        const data = event.data as AlertEventData
        setAlerts((prev) => prev.map((alert) => (alert.id === data.alert.id ? data.alert : alert)))
        return
      }
      if (event.type === PULSE_EVENT_TYPES.alertResolved) {
        const data = event.data as AlertResolvedData
        setAlerts((prev) =>
          prev.map((alert) =>
            alert.monitorId === data.monitorId && alert.status === "open"
              ? { ...alert, status: "resolved" }
              : alert,
          ),
        )
      }
    },
    requirements.alerts,
  )

  usePulseEventStream(
    appRunBatch ? [topicApplicationRunBatch(appRunBatch.applicationId, appRunBatch.batchId)] : [],
    (event) => {
      if (event.type === PULSE_EVENT_TYPES.runQueued) {
        const data = event.data as RunBatchEventData
        setAppRunStatus((prev) => ({
          ...prev,
          [data.monitorId]: { status: "running" },
        }))
        return
      }
      if (event.type === PULSE_EVENT_TYPES.runCompleted) {
        const data = event.data as RunBatchEventData
        const succeeded = String(data.status || "").toUpperCase() === "SUCCESS"
        setAppRunStatus((prev) => ({
          ...prev,
          [data.monitorId]: {
            status: succeeded ? "success" : "failed",
            durationMs: data.durationMs,
            error: data.failureReason,
          },
        }))
      }
    },
    Boolean(appRunBatch),
  )

  const fetchMonitors = useCallback(async () => {
    try {
      setMonitors(await pulseClient.listMonitors())
    } catch (err) {
      console.error("Failed to fetch monitors:", err)
    }
  }, [])

  const fetchApplications = useCallback(async () => {
    try {
      setApplications(await pulseClient.listApplications())
    } catch (err) {
      console.error("Failed to fetch applications:", err)
    }
  }, [])

  const fetchDeploymentValidations = useCallback(async (applicationIdVal?: string) => {
    try {
      setDeploymentValidations(await pulseClient.listDeploymentValidations(applicationIdVal))
    } catch (err) {
      console.error("Failed to fetch deployment validations:", err)
    }
  }, [])

  const fetchSecrets = useCallback(async () => {
    try {
      setSecrets(await pulseClient.listSecrets())
    } catch (err) {
      console.error("Failed to fetch secrets:", err)
    }
  }, [])

  const fetchCertificateProfiles = useCallback(async () => {
    try {
      setCertificateProfiles(await pulseClient.listCertificateProfiles())
    } catch (err) {
      console.error("Failed to fetch certificate profiles:", err)
    }
  }, [])

  const fetchAlerts = useCallback(async () => {
    try {
      setAlerts(await pulseClient.listAlerts())
    } catch (err) {
      console.error("Failed to fetch alerts:", err)
    }
  }, [])

  const fetchRuns = useCallback(async () => {
    try {
      setRuns(await pulseClient.listRuns())
    } catch (err) {
      console.error("Failed to fetch runs:", err)
    }
  }, [])

  useEffect(() => {
    if (!runningApp || !appRunBatch) return
    const activeMonitors = monitors.filter(
      (monitor) => monitor.applicationId === runningApp.id && monitor.isActive,
    )
    if (activeMonitors.length === 0) return

    const allDone = activeMonitors.every((monitor) => {
      const status = appRunStatus[monitor.id]?.status
      return status === "success" || status === "failed"
    })

    if (!allDone) return

    setAppRunCompleted(true)
    setAppRunBatch(null)
    void fetchAlerts()
    void fetchRuns()
    void fetchMonitors()
  }, [appRunBatch, appRunStatus, runningApp, monitors, fetchAlerts, fetchRuns, fetchMonitors])

  const fetchNotificationSettings = useCallback(async () => {
    try {
      setNotificationSettings(await pulseClient.getNotificationSettings())
    } catch (err) {
      console.error("Failed to fetch notification settings:", err)
    }
  }, [])

  const fetchRetentionSettings = useCallback(async () => {
    try {
      setRetentionSettings(await pulseClient.getRetentionSettings())
    } catch (err) {
      console.error("Failed to fetch retention settings:", err)
    }
  }, [])

  const fetchSLOSummary = useCallback(async () => {
    try {
      setSloSummary(await pulseClient.getSLOSummary())
    } catch (err) {
      console.error("Failed to fetch SLO summary:", err)
    }
  }, [])

  const fetchSingleMonitor = useCallback(async (id: string) => {
    try {
      setActiveMonitor(await pulseClient.getMonitor(id))
    } catch (err) {
      console.error(`Failed to fetch monitor ${id}:`, err)
    }
  }, [])

  const fetchSingleRun = useCallback(async (id: string) => {
    try {
      setActiveRun(await pulseClient.getRun(id))
    } catch (err) {
      console.error(`Failed to fetch run ${id}:`, err)
    }
  }, [])

  const fetchElfQueries = useCallback(async (applicationIdVal?: string) => {
    try {
      setElfQueries(await pulseClient.listElfQueries(applicationIdVal))
    } catch (err) {
      console.error("Failed to fetch ELF queries:", err)
    }
  }, [])

  const fetchElfProxySettings = useCallback(async () => {
    try {
      setElfProxySettings(await pulseClient.getElfProxySettings())
    } catch (err) {
      console.error("Failed to fetch ELF proxy settings:", err)
    }
  }, [])

  const fetchSingleDeploymentValidation = useCallback(async (id: string) => {
    try {
      const data = await pulseClient.getDeploymentValidation(id)
      setActiveValidation(data.validation)
      setActiveValidationRuns({ preRuns: data.preRuns, postRuns: data.postRuns })
    } catch (err) {
      console.error(`Failed to fetch deployment validation ${id}:`, err)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    const promises: Promise<unknown>[] = []

    if (requirements.applications) promises.push(fetchApplications())
    if (requirements.monitors) promises.push(fetchMonitors())
    if (requirements.secrets) promises.push(fetchSecrets())
    if (requirements.certificateProfiles) promises.push(fetchCertificateProfiles())
    if (requirements.alerts) promises.push(fetchAlerts())
    if (requirements.runs) promises.push(fetchRuns())
    if (requirements.notificationSettings) promises.push(fetchNotificationSettings())
    if (requirements.retentionSettings) promises.push(fetchRetentionSettings())
    if (requirements.sloSummary) promises.push(fetchSLOSummary())
    if (requirements.deploymentValidations) promises.push(fetchDeploymentValidations(applicationId))
    if (requirements.elfQueries) promises.push(fetchElfQueries(applicationId))
    if (requirements.elfProxySettings) promises.push(fetchElfProxySettings())

    if (monitorId) promises.push(fetchSingleMonitor(monitorId))
    if (runId) promises.push(fetchSingleRun(runId))
    if (validationId) promises.push(fetchSingleDeploymentValidation(validationId))

    Promise.all(promises).finally(() => setLoading(false))
  }, [
    requirements,
    applicationId,
    monitorId,
    runId,
    alertId,
    validationId,
    fetchApplications,
    fetchMonitors,
    fetchSecrets,
    fetchCertificateProfiles,
    fetchAlerts,
    fetchRuns,
    fetchNotificationSettings,
    fetchRetentionSettings,
    fetchSLOSummary,
    fetchDeploymentValidations,
    fetchElfQueries,
    fetchElfProxySettings,
    fetchSingleMonitor,
    fetchSingleRun,
    fetchSingleDeploymentValidation,
  ])

  const handleRunNow = async (monitorIdVal: string) => {
    try {
      await pulseClient.runMonitor(monitorIdVal)
      const refresh: Promise<unknown>[] = []
      if (requirements.monitors) refresh.push(fetchMonitors())
      if (requirements.runs) refresh.push(fetchRuns())
      if (requirements.alerts) refresh.push(fetchAlerts())
      if (requirements.sloSummary) refresh.push(fetchSLOSummary())
      await Promise.all(refresh)
    } catch (err) {
      console.error("Failed to trigger monitor run:", err)
      throw err
    }
  }

  const handleRunApplication = async (applicationIdVal: string) => {
    const app = applications.find((a) => a.id === applicationIdVal)
    if (!app) return

    setRunningApp(app)
    setAppRunCompleted(false)
    const appMonitors = monitors.filter((m) => m.applicationId === applicationIdVal)

    const initialStates: Record<string, { status: "queued" | "running" | "success" | "failed" | "skipped"; durationMs?: number; error?: string }> = {}
    appMonitors.forEach((m) => {
      initialStates[m.id] = { status: m.isActive ? "running" : "skipped" }
    })
    setAppRunStatus(initialStates)

    const clickTime = new Date()

    try {
      const summary = await pulseClient.runApplication(applicationIdVal)
      if (summary.batchId) {
        setAppRunBatch({ applicationId: applicationIdVal, batchId: summary.batchId })
      } else {
        // Fallback when streaming metadata is unavailable.
        let ticks = 0
        const maxTicks = 120
        const interval = setInterval(async () => {
          ticks++
          const [latestMonitors, latestRuns] = await Promise.all([
            pulseClient.listMonitors().catch(() => []),
            pulseClient.listRuns().catch(() => []),
          ])

          setMonitors(latestMonitors)
          setRuns(latestRuns)

          const newStates = { ...initialStates }
          let allDone = true

          appMonitors.forEach((m) => {
            if (!m.isActive) {
              newStates[m.id] = { status: "skipped" }
              return
            }

            const monitorRuns = latestRuns.filter((r) => r.monitorId === m.id)
            monitorRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
            const latestRun = monitorRuns[0]

            if (latestRun && new Date(latestRun.startedAt).getTime() >= clickTime.getTime() - 5000) {
              const isCompleted = ["success", "failed", "timeout", "error"].includes(latestRun.status)
              newStates[m.id] = {
                status: latestRun.status === "success" ? "success" : "failed",
                durationMs: latestRun.durationMs,
                error: latestRun.failureReason,
              }
              if (!isCompleted) allDone = false
            } else {
              newStates[m.id] = { status: "running" }
              allDone = false
            }
          })

          setAppRunStatus(newStates)

          if (allDone || ticks >= maxTicks) {
            clearInterval(interval)
            setAppRunCompleted(true)
            if (requirements.alerts) await fetchAlerts()
          }
        }, 1500)
      }
    } catch (err) {
      console.error("Failed to run application:", err)
      setRunningApp(null)
    }
  }

  const handleSaveApplication = async (input: Application) => {
    await pulseClient.saveApplication(input)
    await fetchApplications()
  }

  const handleDeleteApplication = async (applicationId: string) => {
    await pulseClient.deleteApplication(applicationId)
    await Promise.all([
      fetchApplications(),
      requirements.monitors ? fetchMonitors() : Promise.resolve(),
      requirements.deploymentValidations ? fetchDeploymentValidations() : Promise.resolve(),
    ])
  }

  const handleCreateDeploymentValidation = async (input: DeploymentValidationCreateInput) => {
    const validation = await pulseClient.createDeploymentValidation(input)
    await fetchDeploymentValidations(input.applicationId)
    return validation
  }

  const handleUpdateDeploymentValidation = async (input: DeploymentValidationUpdateInput) => {
    const validation = await pulseClient.updateDeploymentValidation(input)
    await fetchDeploymentValidations()
    return validation
  }

  const handleDeleteDeploymentValidation = async (validationId: string) => {
    await pulseClient.deleteDeploymentValidation(validationId)
    await fetchDeploymentValidations()
  }

  const handleRunDeploymentValidationPost = async (id: string) => {
    await pulseClient.runDeploymentValidationPost(id)
  }

  const handleRunDeploymentValidationLogCheck = async (id: string) => {
    await pulseClient.runDeploymentValidationLogCheck(id)
  }

  const handleSaveElfQuery = async (queryId: string | null, input: ElfQueryInput) => {
    const query = await pulseClient.saveElfQuery(queryId, input)
    await fetchElfQueries()
    return query
  }

  const handleDeleteElfQuery = async (queryId: string) => {
    await pulseClient.deleteElfQuery(queryId)
    await fetchElfQueries()
  }

  const handleTestElfQuery = async (queryId: string, input?: { elfAppId?: string; applicationId?: string }) => {
    return pulseClient.testElfQuery(queryId, input)
  }

  const handleProbeElfQuery = async (id: string, input: ElfQueryProbeInput = {}) => {
    const result = await pulseClient.probeElfQuery(id, input)
    await fetchElfQueries()
    return result
  }

  const activeElfQuery = useMemo(() => {
    return elfQueries.find((query) => query.id === queryId) || null
  }, [elfQueries, queryId])

  const handleSaveElfProxySettings = async (input: ElfProxySettingsInput) => {
    const settings = await pulseClient.saveElfProxySettings(input)
    await fetchElfProxySettings()
    return settings
  }

  const handleTestElfProxySettings = async (input: {
    baseUrl?: string
    indexPathTemplate?: string
    elfAppId?: string
    pretty?: boolean
  }) => {
    return pulseClient.testElfProxySettings(input)
  }

  const handleGenerateDeploymentAIReport = async (validation: DeploymentValidation, preRuns: MonitorRun[], postRuns: MonitorRun[]) => {
    const report = await pulseClient.generateDeploymentAIReport(validation, preRuns, postRuns)
    const updated = await pulseClient.saveDeploymentAIReport(validation.id, report)
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
      await pulseClient.updateMonitor({ ...monitorItem, isActive: !currentActive })
      await Promise.all([
        requirements.monitors ? fetchMonitors() : Promise.resolve(),
        monitorIdVal ? fetchSingleMonitor(monitorIdVal) : Promise.resolve(),
      ])
      notifyPulseToast(
        "success",
        currentActive ? "Monitor disabled" : "Monitor enabled",
        `${monitorItem.name} is now ${currentActive ? "paused" : "active"}.`,
      )
    } catch (err) {
      console.error("Failed to toggle monitor active status:", err)
      notifyPulseToast(
        "danger",
        "Failed to update monitor",
        err instanceof Error ? err.message : "Please try again.",
      )
      throw err
    }
  }

  const executeDeleteMonitor = async (monitorIdVal: string) => {
    const monitorItem = monitors.find((m) => m.id === monitorIdVal) || activeMonitor
    try {
      await pulseClient.deleteMonitor(monitorIdVal)
      const refresh: Promise<unknown>[] = []
      if (requirements.monitors) refresh.push(fetchMonitors())
      if (requirements.runs) refresh.push(fetchRuns())
      if (requirements.alerts) refresh.push(fetchAlerts())
      if (requirements.sloSummary) refresh.push(fetchSLOSummary())
      await Promise.all(refresh)
      notifyPulseToast(
        "success",
        "Monitor deleted",
        monitorItem ? `${monitorItem.name} was removed from the inventory.` : undefined,
      )
    } catch (err) {
      console.error("Failed to delete monitor:", err)
      notifyPulseToast(
        "danger",
        "Failed to delete monitor",
        err instanceof Error ? err.message : "Please try again.",
      )
      throw err
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
    await pulseClient.saveSecret(secret, input)
    await fetchSecrets()
  }

  const handleTestSecret = async (secret: SecretReference) => {
    return pulseClient.testSecret(secret)
  }

  const handleDeleteSecret = async (secretIdVal: string) => {
    await pulseClient.deleteSecret(secretIdVal)
    await fetchSecrets()
  }

  const handleSaveNotificationSettings = async (input: NotificationSettingsInput) => {
    const settings = await pulseClient.saveNotificationSettings(input)
    setNotificationSettings(settings)
    if (requirements.secrets) await fetchSecrets()
  }

  const handleTestNotificationSettings = async (input: NotificationSettingsInput): Promise<NotificationTestResult> => {
    return pulseClient.testNotificationSettings(input)
  }

  const handleSaveRetentionSettings = async (settings: RetentionSettings): Promise<RetentionSettings> => {
    const updated = await pulseClient.saveRetentionSettings(settings)
    setRetentionSettings(updated)
    return updated
  }

  const handlePurgeRetention = async (): Promise<RetentionPurgeResult> => {
    const result = await pulseClient.purgeRetention()
    if (requirements.runs) await fetchRuns()
    return result
  }

  const handleSaveCertificateProfile = async (input: CertificateProfileInput) => {
    await pulseClient.saveCertificateProfile(input)
    await Promise.all([
      requirements.certificateProfiles ? fetchCertificateProfiles() : Promise.resolve(),
      requirements.secrets ? fetchSecrets() : Promise.resolve(),
    ])
  }

  const handleTestCertificateProfile = async (profile: CertificateProfile): Promise<boolean> => {
    const ok = await pulseClient.testCertificateProfile(profile)
    if (requirements.certificateProfiles) await fetchCertificateProfiles()
    return ok
  }

  const handleDeleteCertificateProfile = async (profileId: string) => {
    await pulseClient.deleteCertificateProfile(profileId)
    if (requirements.certificateProfiles) await fetchCertificateProfiles()
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
      elfQueries,
      elfProxySettings,
      filteredMonitors,
    },
    active: {
      activeMonitor,
      activeRun,
      activeValidation,
      activeValidationRuns,
      activeApplication,
      activeElfQuery,
      runningApp,
      setRunningApp,
      appRunStatus,
      appRunCompleted,
      setAppRunBatch,
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
      handleDeleteApplication,
      handleCreateDeploymentValidation,
      handleUpdateDeploymentValidation,
      handleDeleteDeploymentValidation,
      handleRunDeploymentValidationPost,
      handleRunDeploymentValidationLogCheck,
      handleGenerateDeploymentAIReport,
      handleSaveElfQuery,
      handleDeleteElfQuery,
      handleTestElfQuery,
      handleProbeElfQuery,
      handleSaveElfProxySettings,
      handleTestElfProxySettings,
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
