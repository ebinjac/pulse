"use client"

import { useState, type ReactNode } from "react"
import type { Application, ElfQuery, Monitor } from "@/lib/pulse-types"
import { Alert, Button, Card, Description, Input, Label, TextField } from "@heroui/react"
import { formatDate } from "@/components/pulse/console-shared"
import { dateTimeLocalToISOString } from "../utils/console-utils"
import type { DeploymentCheckDraft } from "./types"
import { buildWizardWarnings, formatEstimate } from "./deployment-check-wizard-models"

export function DeploymentCheckStepReview({
  draft,
  onDraftChange,
  selectedApplication,
  selectedMonitorIds,
  activeMonitors,
  selectedElfQueryIds,
  scopedElfQueries,
  samplingLocked,
}: {
  draft: DeploymentCheckDraft
  onDraftChange: (patch: Partial<DeploymentCheckDraft>) => void
  selectedApplication: Application | undefined
  selectedMonitorIds: string[]
  activeMonitors: Monitor[]
  selectedElfQueryIds: string[]
  scopedElfQueries: ElfQuery[]
  samplingLocked: boolean
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showAllMonitors, setShowAllMonitors] = useState(false)
  const selectedMonitors = activeMonitors.filter((m) => selectedMonitorIds.includes(m.id))
  const selectedQueries = scopedElfQueries.filter((q) => selectedElfQueryIds.includes(q.id))
  const logChecksSkipped = selectedQueries.length === 0
  const checkName =
    draft.name ||
    (selectedApplication ? `${selectedApplication.name} deployment validation` : "Deployment validation")
  const estimate = formatEstimate(draft.sampleCount, draft.intervalSeconds)

  let deploymentTimeLabel = draft.deploymentStartedAt
  try {
    deploymentTimeLabel = formatDate(dateTimeLocalToISOString(draft.deploymentStartedAt))
  } catch {
    // keep raw value
  }

  const monitorNames = selectedMonitors.map((m) => m.name)
  const visibleMonitors = showAllMonitors ? monitorNames : monitorNames.slice(0, 3)
  const hiddenMonitorCount = Math.max(0, monitorNames.length - visibleMonitors.length)

  const warnings = buildWizardWarnings({
    logChecksSkipped,
    estimate,
    sampleCount: draft.sampleCount,
    intervalSeconds: draft.intervalSeconds,
  })

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Sampling plan</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Defaults work for most releases.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/50 bg-background shadow-sm">
          <dl className="divide-y divide-border/40 text-sm">
            <SamplingRow label="Baseline window" value={`${draft.baselineWindowHours}h`} />
            <SamplingRow label="Baseline samples" value={String(draft.baselineRunCount)} />
            <SamplingRow label="Post-deploy samples" value={String(draft.sampleCount)} />
            <SamplingRow label="Sample interval" value={`${draft.intervalSeconds}s`} />
            <SamplingRow label="Estimated duration" value={`~${estimate}`} highlight />
          </dl>
        </div>

        {!samplingLocked && (
          <Button variant="secondary" size="sm" className="h-9" onPress={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "Hide advanced sampling settings" : "Advanced sampling settings"}
          </Button>
        )}

        {(showAdvanced || samplingLocked) && (
          <div className="grid gap-4 rounded-xl border border-border/50 bg-muted/5 p-4 md:grid-cols-2">
            <TextField className="w-full" name="baselineWindowHours" variant="secondary">
              <Label>Baseline window</Label>
              <Input
                variant="secondary"
                className="min-h-11"
                type="number"
                min={1}
                max={720}
                disabled={samplingLocked}
                value={String(draft.baselineWindowHours)}
                onChange={(event) =>
                  onDraftChange({ baselineWindowHours: Number(event.target.value) })
                }
              />
            </TextField>

            <TextField className="w-full" name="baselineRunCount" variant="secondary">
              <Label>Baseline sample count</Label>
              <Input
                variant="secondary"
                className="min-h-11"
                type="number"
                min={1}
                max={500}
                disabled={samplingLocked}
                value={String(draft.baselineRunCount)}
                onChange={(event) =>
                  onDraftChange({ baselineRunCount: Number(event.target.value) })
                }
              />
            </TextField>

            <TextField className="w-full" name="sampleCount" variant="secondary">
              <Label>Post sample count</Label>
              <Input
                variant="secondary"
                className="min-h-11"
                type="number"
                min={1}
                max={100}
                disabled={samplingLocked}
                value={String(draft.sampleCount)}
                onChange={(event) => onDraftChange({ sampleCount: Number(event.target.value) })}
              />
            </TextField>

            <TextField className="w-full" name="intervalSeconds" variant="secondary">
              <Label>Sample interval</Label>
              <Input
                variant="secondary"
                className="min-h-11"
                type="number"
                min={0}
                max={3600}
                disabled={samplingLocked}
                value={String(draft.intervalSeconds)}
                onChange={(event) =>
                  onDraftChange({ intervalSeconds: Number(event.target.value) })
                }
              />
            </TextField>
          </div>
        )}

        {samplingLocked && (
          <p className="text-sm text-warning">
            Sampling settings are locked because this check has already started.
          </p>
        )}
      </section>

      {warnings.length > 0 ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Warnings</Alert.Title>
            <Alert.Description>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <Card className="gap-0 rounded-xl border-border/50 p-0 shadow-sm">
        <Card.Header className="border-b border-border/40 p-5">
          <Card.Title className="text-sm font-semibold">Review</Card.Title>
          <Card.Description>Confirm scope before creating your deployment check.</Card.Description>
        </Card.Header>
        <Card.Content className="space-y-6 p-5">
          <ReviewSection title="Release">
            <ReviewField label="Name" value={checkName} />
            <ReviewField
              label="Application"
              value={
                selectedApplication
                  ? `${selectedApplication.name} · CAR ${selectedApplication.carId}`
                  : "—"
              }
            />
            <ReviewField label="Environment" value={draft.environment || "—"} />
            <ReviewField
              label="Version / Build"
              value={[draft.version, draft.buildId].filter(Boolean).join(" · ") || "—"}
            />
            <ReviewField label="Deployment time" value={deploymentTimeLabel} />
          </ReviewSection>

          <ReviewSection title="Validation scope">
            <ReviewField
              label="Monitors"
              value={
                selectedMonitors.length > 0
                  ? `${selectedMonitors.length} selected`
                  : "None selected"
              }
              detail={
                visibleMonitors.length > 0 ? (
                  <span>
                    {visibleMonitors.join(", ")}
                    {hiddenMonitorCount > 0 && !showAllMonitors ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="font-semibold text-primary underline"
                          onClick={() => setShowAllMonitors(true)}
                        >
                          +{hiddenMonitorCount} more
                        </button>
                      </>
                    ) : null}
                  </span>
                ) : undefined
              }
            />
            <ReviewField
              label="Log checks"
              value={
                selectedQueries.length > 0
                  ? `${selectedQueries.length} ELF gate${selectedQueries.length === 1 ? "" : "s"}`
                  : "Skipped — monitor-only validation"
              }
              detail={
                draft.autoRunLogCheck && selectedQueries.length > 0
                  ? "Auto-run after post samples"
                  : undefined
              }
            />
          </ReviewSection>

          <ReviewSection title="Sampling">
            <ReviewField
              label="Baseline"
              value={`${draft.baselineRunCount} samples from ${draft.baselineWindowHours}h window`}
            />
            <ReviewField
              label="Post-deploy"
              value={`${draft.sampleCount} samples every ${draft.intervalSeconds}s`}
            />
            <ReviewField label="Estimated run" value={`~${estimate} after deployment starts`} />
          </ReviewSection>
        </Card.Content>
      </Card>
    </div>
  )
}

function SamplingRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={highlight ? "font-semibold text-foreground" : "font-medium text-foreground"}>
        {value}
      </dd>
    </div>
  )
}

function ReviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="space-y-2 rounded-lg border border-border/30 bg-muted/5 p-3">{children}</div>
    </section>
  )
}

function ReviewField({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: ReactNode
}) {
  return (
    <div className="grid gap-1 text-sm sm:grid-cols-[8rem_1fr] sm:gap-3">
      <span className="text-muted-foreground">{label}</span>
      <div>
        <div className="font-medium text-foreground">{value}</div>
        {detail ? <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div> : null}
      </div>
    </div>
  )
}
