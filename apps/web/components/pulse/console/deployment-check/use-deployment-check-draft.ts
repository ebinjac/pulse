"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { Application, ApplicationService, DeploymentValidation, ElfQuery, Monitor } from "@/lib/pulse-types"
import { pulseClient } from "@/lib/pulse-client/http-client"
import { dateTimeLocalToISOString, toDateTimeLocalInput } from "../utils/console-utils"
import type { DeploymentValidationCreateInput } from "../types"
import type { DeploymentCheckDraft, WizardStep } from "./types"

export function createEmptyDraft(environment = "production"): DeploymentCheckDraft {
  return {
    name: "",
    version: "",
    buildId: "",
    environment,
    deploymentStartedAt: "",
    baselineWindowHours: 24,
    baselineRunCount: 30,
    sampleCount: 30,
    intervalSeconds: 30,
    autoRunLogCheck: false,
    observabilityProfile: "custom",
  }
}

export function draftFromValidation(validation: DeploymentValidation): DeploymentCheckDraft {
  const deploymentStartedAt = validation.deploymentStartedAt
    ? toDateTimeLocalInput(new Date(validation.deploymentStartedAt))
    : toDateTimeLocalInput()

  return {
    name: validation.name,
    version: validation.version || "",
    buildId: validation.buildId || "",
    environment: validation.environment || "production",
    deploymentStartedAt,
    baselineWindowHours: validation.baselineWindowHours || 24,
    baselineRunCount: validation.baselineRunCount || 30,
    sampleCount: validation.sampleCount || 30,
    intervalSeconds: validation.intervalSeconds || 30,
    autoRunLogCheck: validation.autoRunLogCheck || false,
    observabilityProfile: validation.observabilityProfile || "custom",
  }
}

export function useDeploymentCheckDraft({
  mode,
  applications,
  monitors,
  elfQueries,
  initialApplicationId,
  editingValidation,
}: {
  mode: "create" | "edit"
  applications: Application[]
  monitors: Monitor[]
  elfQueries: ElfQuery[]
  initialApplicationId?: string
  editingValidation?: DeploymentValidation | null
}) {
  const defaultApplication = applications.find((app) => app.id === initialApplicationId) || applications[0]
  const [applicationId, setApplicationId] = useState(
    editingValidation?.applicationId || initialApplicationId || defaultApplication?.id || "",
  )
  const selectedApplication = applications.find((app) => app.id === applicationId) || defaultApplication

  const [draft, setDraft] = useState<DeploymentCheckDraft>(() => {
    if (editingValidation) return draftFromValidation(editingValidation)
    return createEmptyDraft(defaultApplication?.environment || "production")
  })

  const [selectedMonitorIds, setSelectedMonitorIds] = useState<string[]>(
    editingValidation?.monitorIds || [],
  )
  const [selectedElfQueryIds, setSelectedElfQueryIds] = useState<string[]>(
    editingValidation?.elfQueryIds || [],
  )
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(
    editingValidation?.serviceIds || [],
  )
  const [applicationServices, setApplicationServices] = useState<ApplicationService[]>([])

  const isDraftEdit = mode === "edit" && editingValidation?.status === "draft"
  const samplingLocked = mode === "edit" && !isDraftEdit

  const activeMonitors = useMemo(
    () => monitors.filter((monitor) => monitor.applicationId === selectedApplication?.id && monitor.isActive),
    [monitors, selectedApplication?.id],
  )

  const scopedElfQueries = useMemo(
    () =>
      elfQueries.filter(
        (query) => query.isActive && (!query.applicationId || query.applicationId === applicationId),
      ),
    [elfQueries, applicationId],
  )

  useEffect(() => {
    if (!applicationId && defaultApplication?.id) {
      setApplicationId(defaultApplication.id)
    }
  }, [applicationId, defaultApplication?.id])

  useEffect(() => {
    if (!applicationId) {
      setApplicationServices([])
      return
    }
    void pulseClient.listApplicationServices(applicationId).then((services) => {
      const active = services.filter((service) => service.isActive)
      setApplicationServices(active)
      if (mode === "create" && selectedServiceIds.length === 0) {
        setSelectedServiceIds(active.map((service) => service.id))
      }
    })
  }, [applicationId, mode, selectedServiceIds.length])

  useEffect(() => {
    if (mode === "create" && !editingValidation) {
      setSelectedMonitorIds(activeMonitors.map((monitor) => monitor.id))
      setSelectedElfQueryIds([])
      setDraft((current) => ({
        ...current,
        environment: selectedApplication?.environment || current.environment || "production",
      }))
    }
  }, [mode, editingValidation, applicationId, activeMonitors])

  useEffect(() => {
    if (mode === "create" && !editingValidation) {
      setDraft((current) => ({
        ...current,
        deploymentStartedAt: current.deploymentStartedAt || toDateTimeLocalInput(),
      }))
    }
  }, [mode, editingValidation])

  const buildPayload = useCallback((): DeploymentValidationCreateInput | null => {
    if (!selectedApplication) return null
    return {
      applicationId: selectedApplication.id,
      name: draft.name || `${selectedApplication.name} deployment validation`,
      version: draft.version,
      buildId: draft.buildId,
      environment: draft.environment,
      monitorIds: selectedMonitorIds,
      sampleCount: draft.sampleCount,
      intervalSeconds: draft.intervalSeconds,
      deploymentStartedAt: dateTimeLocalToISOString(draft.deploymentStartedAt),
      baselineWindowHours: draft.baselineWindowHours,
      baselineRunCount: draft.baselineRunCount,
      elfQueryIds: selectedElfQueryIds,
      autoRunLogCheck: draft.autoRunLogCheck,
      observabilityProfile: draft.observabilityProfile,
      serviceIds: selectedServiceIds,
    }
  }, [selectedApplication, draft, selectedMonitorIds, selectedElfQueryIds, selectedServiceIds])

  const validateStep = useCallback(
    (step: WizardStep): string | null => {
      if (step === 1) {
        if (!selectedApplication) return "Select an application."
        if (!draft.deploymentStartedAt) return "Set a deployment time."
        return null
      }
      if (step === 2) {
        if (!samplingLocked && selectedMonitorIds.length === 0) {
          return "Select at least one monitor."
        }
        return null
      }
      return null
    },
    [selectedApplication, draft.deploymentStartedAt, samplingLocked, selectedMonitorIds.length],
  )

  return {
    applicationId,
    setApplicationId,
    selectedApplication,
    draft,
    setDraft,
    selectedMonitorIds,
    setSelectedMonitorIds,
    selectedElfQueryIds,
    setSelectedElfQueryIds,
    selectedServiceIds,
    setSelectedServiceIds,
    applicationServices,
    activeMonitors,
    scopedElfQueries,
    samplingLocked,
    isDraftEdit,
    buildPayload,
    validateStep,
  }
}
