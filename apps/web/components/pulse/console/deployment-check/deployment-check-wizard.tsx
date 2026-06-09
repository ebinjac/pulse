"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Minus, Pencil, Plus } from "lucide-react"
import type { Application, DeploymentValidation, ElfQuery, Monitor } from "@/lib/pulse-types"
import { PageShell } from "@/components/pulse/console-shared"
import { notifyPulseToast } from "@/components/pulse/pulse-toast-queue"
import { Alert, Button, Card, Spinner } from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"
import type { DeploymentValidationCreateInput, DeploymentValidationUpdateInput } from "../types"
import {
  DeploymentCheckStepper,
  WizardCardProgress,
} from "./deployment-check-stepper"
import { DeploymentCheckStepWhat } from "./deployment-check-step-what"
import { DeploymentCheckStepMonitors } from "./deployment-check-step-monitors"
import { DeploymentCheckStepLogs } from "./deployment-check-step-logs"
import { DeploymentCheckStepReview } from "./deployment-check-step-review"
import { useDeploymentCheckDraft } from "./use-deployment-check-draft"
import { WIZARD_STEPS, type WizardStep } from "./types"
import { formatEstimate, nextStepButtonLabel } from "./deployment-check-wizard-models"

export function DeploymentCheckWizard({
  mode,
  applications,
  monitors,
  elfQueries,
  initialApplicationId,
  editingValidation,
  onCreateValidation,
  onUpdateValidation,
}: {
  mode: "create" | "edit"
  applications: Application[]
  monitors: Monitor[]
  elfQueries: ElfQuery[]
  initialApplicationId?: string
  editingValidation?: DeploymentValidation | null
  onCreateValidation: (input: DeploymentValidationCreateInput) => Promise<DeploymentValidation | null>
  onUpdateValidation: (input: DeploymentValidationUpdateInput) => Promise<DeploymentValidation | null>
}) {
  const router = useRouter()
  const [step, setStep] = useState<WizardStep>(1)
  const [saving, setSaving] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)
  const [logsSkipped, setLogsSkipped] = useState(false)

  const draftState = useDeploymentCheckDraft({
    mode,
    applications,
    monitors,
    elfQueries,
    initialApplicationId,
    editingValidation,
  })

  const {
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
    buildPayload,
    validateStep,
  } = draftState

  const currentStepMeta = WIZARD_STEPS.find((s) => s.step === step)!
  const estimate = formatEstimate(draft.sampleCount, draft.intervalSeconds)
  const logChecksSkipped = logsSkipped || (step >= 4 && selectedElfQueryIds.length === 0)

  function goToStep(next: WizardStep) {
    setStepError(null)
    setStep(next)
  }

  function goNext() {
    const error = validateStep(step)
    if (error) {
      setStepError(error)
      return
    }
    setStepError(null)
    if (step === 3 && selectedElfQueryIds.length > 0) {
      setLogsSkipped(false)
    }
    setStep((s) => Math.min(4, s + 1) as WizardStep)
  }

  function goBack() {
    setStepError(null)
    setStep((s) => Math.max(1, s - 1) as WizardStep)
  }

  function skipLogs() {
    setStepError(null)
    setSelectedElfQueryIds([])
    setLogsSkipped(true)
    setStep(4)
  }

  async function save() {
    const error = validateStep(2)
    if (error) {
      setStepError(error)
      setStep(2)
      return
    }

    const payload = buildPayload()
    if (!payload || saving) return

    setSaving(true)
    try {
      if (mode === "edit" && editingValidation) {
        await onUpdateValidation({ ...payload, id: editingValidation.id })
        notifyPulseToast("success", "Deployment check updated", editingValidation.name)
        router.push(`/deployments/${editingValidation.id}`)
      } else {
        const created = await onCreateValidation(payload)
        if (created) {
          notifyPulseToast("success", "Deployment check created", "Run post samples after your deploy finishes.")
          router.push(`/deployments/${created.id}`)
        }
      }
    } catch (err) {
      notifyPulseToast(
        "danger",
        mode === "edit" ? "Failed to update" : "Failed to create",
        err instanceof Error ? err.message : "Please try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  const cancelHref =
    mode === "edit" && editingValidation
      ? `/deployments/${editingValidation.id}`
      : "/deployments"

  const title = mode === "edit" ? "Edit deployment check" : "Create deployment check"

  const headerMeta = selectedApplication
    ? [
        `CAR ${selectedApplication.carId}`,
        selectedApplication.name,
        draft.environment || selectedApplication.environment || "production",
        mode === "edit" ? "Editing" : "Draft",
      ].join(" · ")
    : currentStepMeta.subtitle

  const step1Complete = Boolean(selectedApplication && draft.deploymentStartedAt)
  const step2Complete = selectedMonitorIds.length > 0
  const step3Complete = selectedElfQueryIds.length > 0
  const readyToCreate = Boolean(selectedApplication && (samplingLocked || selectedMonitorIds.length > 0))

  return (
    <PageShell
      eyebrow="Release checks"
      title={title}
      description={headerMeta}
      action={
        <Link href={cancelHref}>
          <Button variant="secondary" className="h-10 gap-2">
            <ArrowLeft className="size-4" />
            Cancel
          </Button>
        </Link>
      }
    >
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)_minmax(0,1fr)] lg:gap-6">
        <DeploymentCheckStepper
          activeStep={step}
          onStepChange={goToStep}
          monitorCount={selectedMonitorIds.length}
          elfQueryCount={selectedElfQueryIds.length}
          logsSkipped={logChecksSkipped}
          hasError={Boolean(stepError)}
        />

        <div className="min-w-0 space-y-4 lg:col-start-2">
          {samplingLocked && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Sampling settings are locked</Alert.Title>
                <Alert.Description>
                  This check has already started. You can update deployment metadata but not monitors,
                  sampling, or log configuration.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <Card className="gap-0 rounded-xl border-border/50 p-0 shadow-sm">
            <Card.Header className="border-b border-border/40 p-5">
              <Card.Title className="text-base font-semibold">{currentStepMeta.title}</Card.Title>
              <Card.Description className="text-sm">{currentStepMeta.subtitle}</Card.Description>
              <WizardCardProgress activeStep={step} />
            </Card.Header>
            <Card.Content className="p-5">
              {step === 1 && (
                <DeploymentCheckStepWhat
                  mode={mode}
                  applications={applications}
                  applicationId={applicationId}
                  onApplicationIdChange={setApplicationId}
                  draft={draft}
                  onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
                  samplingLocked={samplingLocked}
                  initialApplicationId={initialApplicationId}
                />
              )}
              {step === 2 && (
                <DeploymentCheckStepMonitors
                  activeMonitors={activeMonitors}
                  selectedMonitorIds={selectedMonitorIds}
                  onSelectedMonitorIdsChange={setSelectedMonitorIds}
                  samplingLocked={samplingLocked}
                />
              )}
              {step === 3 && (
                <DeploymentCheckStepLogs
                  draft={draft}
                  onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
                  applicationServices={applicationServices}
                  selectedServiceIds={selectedServiceIds}
                  onSelectedServiceIdsChange={setSelectedServiceIds}
                  scopedElfQueries={scopedElfQueries}
                  selectedElfQueryIds={selectedElfQueryIds}
                  onSelectedElfQueryIdsChange={(ids) => {
                    setLogsSkipped(false)
                    setSelectedElfQueryIds(ids)
                  }}
                  samplingLocked={samplingLocked}
                />
              )}
              {step === 4 && (
                <DeploymentCheckStepReview
                  draft={draft}
                  onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
                  selectedApplication={selectedApplication}
                  selectedMonitorIds={selectedMonitorIds}
                  activeMonitors={activeMonitors}
                  selectedElfQueryIds={selectedElfQueryIds}
                  scopedElfQueries={scopedElfQueries}
                  samplingLocked={samplingLocked}
                />
              )}
            </Card.Content>

            {stepError ? (
              <div className="border-t border-border/40 px-5 pt-4">
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{stepError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              </div>
            ) : null}

            <Card.Footer className="flex flex-col gap-3 border-t border-border/40 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                {step > 1 ? (
                  <Button variant="secondary" onPress={goBack} className="h-10 gap-1.5">
                    <ChevronLeft className="size-4" />
                    Back
                  </Button>
                ) : (
                  <span />
                )}
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                {step === 3 ? (
                  <p className="text-xs text-muted-foreground sm:text-right">
                    Skipping log checks means the validation will be monitor-only.
                  </p>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  {step === 3 && (
                    <Button variant="secondary" onPress={skipLogs} className="h-10">
                      Skip log checks
                    </Button>
                  )}
                  {step < 4 ? (
                    <Button onPress={goNext} className="h-10 gap-1.5">
                      {nextStepButtonLabel(step)}
                      <ChevronRight className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      onPress={() => void save()}
                      isDisabled={saving || !readyToCreate}
                      className="h-10 gap-1.5"
                    >
                      {saving ? (
                        <Spinner color="current" size="sm" />
                      ) : mode === "edit" ? (
                        <Pencil className="size-3.5" />
                      ) : (
                        <Plus className="size-3.5" />
                      )}
                      {mode === "edit" ? "Save changes" : "Create deployment check"}
                    </Button>
                  )}
                </div>
              </div>
            </Card.Footer>
          </Card>
        </div>

        <DeploymentCheckSummaryPanel
          applicationName={selectedApplication?.name || "No application"}
          carId={selectedApplication?.carId || "—"}
          environment={draft.environment || selectedApplication?.environment || "production"}
          monitorCount={selectedMonitorIds.length}
          elfQueryCount={selectedElfQueryIds.length}
          autoRunLogCheck={draft.autoRunLogCheck}
          sampleCount={draft.sampleCount}
          intervalSeconds={draft.intervalSeconds}
          baselineRunCount={draft.baselineRunCount}
          baselineWindowHours={draft.baselineWindowHours}
          estimate={estimate}
          step1Complete={step1Complete}
          step2Complete={step2Complete}
          step3Complete={step3Complete}
          step3Skipped={logChecksSkipped}
          readyToCreate={readyToCreate}
        />
      </div>
    </PageShell>
  )
}

function DeploymentCheckSummaryPanel({
  applicationName,
  carId,
  environment,
  monitorCount,
  elfQueryCount,
  autoRunLogCheck,
  sampleCount,
  intervalSeconds,
  baselineRunCount,
  baselineWindowHours,
  estimate,
  step1Complete,
  step2Complete,
  step3Complete,
  step3Skipped,
  readyToCreate,
}: {
  applicationName: string
  carId: string
  environment: string
  monitorCount: number
  elfQueryCount: number
  autoRunLogCheck: boolean
  sampleCount: number
  intervalSeconds: number
  baselineRunCount: number
  baselineWindowHours: number
  estimate: string
  step1Complete: boolean
  step2Complete: boolean
  step3Complete: boolean
  step3Skipped: boolean
  readyToCreate: boolean
}) {
  return (
    <aside className="lg:sticky lg:top-6 lg:col-start-3 lg:max-h-[calc(100vh-8rem)] lg:self-start lg:overflow-auto">
      <Card className="gap-0 rounded-xl border-border/50 p-0 shadow-sm">
        <Card.Header className="border-b border-border/40 p-4">
          <Card.Title className="text-sm font-semibold">Run plan</Card.Title>
          <Card.Description className="text-sm">What will run after you create this check.</Card.Description>
        </Card.Header>
        <Card.Content className="space-y-5 p-4">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Estimated duration
            </div>
            <div className="mt-1 text-xl font-bold text-foreground">~{estimate}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              after deployment starts · {intervalSeconds}s between samples
            </div>
          </div>

          <RunPlanSection title="Release">
            <RunPlanRow
              state={step1Complete ? "complete" : "pending"}
              label={applicationName}
              detail={`${environment} · CAR ${carId}`}
            />
          </RunPlanSection>

          <RunPlanSection title="Validation">
            <RunPlanRow
              state={step2Complete ? "complete" : "pending"}
              label={`${monitorCount} monitor${monitorCount === 1 ? "" : "s"} selected`}
            />
            <RunPlanRow
              state={step3Skipped ? "skipped" : step3Complete ? "complete" : "pending"}
              label={
                step3Skipped
                  ? "Log checks skipped"
                  : elfQueryCount
                    ? `${elfQueryCount} ELF gate${elfQueryCount === 1 ? "" : "s"}`
                    : "Log checks not configured"
              }
              detail={
                step3Skipped
                  ? "Monitor-only validation"
                  : autoRunLogCheck && elfQueryCount
                    ? "Auto-run after post samples"
                    : undefined
              }
            />
            <RunPlanRow
              state="pending"
              label={`${baselineRunCount} baseline + ${sampleCount} post samples`}
              detail={`${baselineWindowHours}h baseline window`}
            />
          </RunPlanSection>

          <RunPlanSection title="Status">
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm",
                readyToCreate
                  ? "border-success/30 bg-success/5 text-success"
                  : "border-border/40 bg-muted/10 text-muted-foreground",
              )}
            >
              <StatusDot state={readyToCreate ? "complete" : "pending"} />
              <span className="font-medium">
                {readyToCreate ? "Ready to create" : "Complete required steps"}
              </span>
            </div>
          </RunPlanSection>
        </Card.Content>
      </Card>
    </aside>
  )
}

type RunPlanState = "complete" | "active" | "pending" | "skipped" | "error"

function RunPlanSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function RunPlanRow({
  state,
  label,
  detail,
}: {
  state: RunPlanState
  label: string
  detail?: string
}) {
  return (
    <div className="flex gap-2 text-sm">
      <StatusDot state={state} />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{label}</div>
        {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
      </div>
    </div>
  )
}

function StatusDot({ state }: { state: RunPlanState }) {
  if (state === "complete") {
    return (
      <span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
        <Check className="size-2.5" strokeWidth={3} />
      </span>
    )
  }
  if (state === "skipped") {
    return (
      <span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Minus className="size-2.5" />
      </span>
    )
  }
  if (state === "active") {
    return <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary ring-4 ring-primary/20" />
  }
  if (state === "error") {
    return <span className="mt-1.5 size-2 shrink-0 rounded-full bg-danger" />
  }
  return <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40" />
}
