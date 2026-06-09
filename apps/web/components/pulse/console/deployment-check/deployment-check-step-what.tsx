"use client"

import { useState } from "react"
import { Lock } from "lucide-react"
import type { Application } from "@/lib/pulse-types"
import { formatDate } from "@/components/pulse/console-shared"
import { dateTimeLocalToISOString } from "../utils/console-utils"
import {
  Button,
  Card,
  Description,
  Input,
  Label,
  ListBox,
  Select,
  Separator,
  TextField,
} from "@heroui/react"
import { DeploymentCheckTimelineCollapsible } from "./deployment-check-timeline"
import type { DeploymentCheckDraft } from "./types"

export function DeploymentCheckStepWhat({
  mode,
  applications,
  applicationId,
  onApplicationIdChange,
  draft,
  onDraftChange,
  samplingLocked,
  initialApplicationId,
}: {
  mode: "create" | "edit"
  applications: Application[]
  applicationId: string
  onApplicationIdChange: (id: string) => void
  draft: DeploymentCheckDraft
  onDraftChange: (patch: Partial<DeploymentCheckDraft>) => void
  samplingLocked: boolean
  initialApplicationId?: string
}) {
  const selectedApplication = applications.find((app) => app.id === applicationId)
  const [showAppPicker, setShowAppPicker] = useState(false)
  const lockToPrefilledApp = mode === "create" && Boolean(initialApplicationId) && !showAppPicker
  const environmentFromCar = Boolean(selectedApplication?.environment && lockToPrefilledApp)

  let deploymentPreview = draft.deploymentStartedAt
  try {
    if (draft.deploymentStartedAt) {
      deploymentPreview = formatDate(dateTimeLocalToISOString(draft.deploymentStartedAt))
    }
  } catch {
    // keep raw
  }

  return (
    <div className="space-y-8">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Set the release identity and deploy time. Monitor runs before the deploy time count as
        baseline; runs after count as post-deploy.
      </p>

      <DeploymentCheckTimelineCollapsible defaultExpanded={!initialApplicationId} />

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Release identity</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Which application and build you are validating.
          </p>
        </div>

        {lockToPrefilledApp && selectedApplication ? (
          <Card className="rounded-xl border-border/50 bg-background p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {selectedApplication.name}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  CAR {selectedApplication.carId}
                </div>
              </div>
              {applications.length > 1 ? (
                <Button variant="secondary" size="sm" className="h-9 shrink-0" onPress={() => setShowAppPicker(true)}>
                  Change
                </Button>
              ) : null}
            </div>
          </Card>
        ) : (
          <Select
            aria-label="Application"
            className="w-full"
            variant="secondary"
            isDisabled={mode === "edit"}
            selectedKey={applicationId}
            onSelectionChange={(key) => {
              if (key != null) onApplicationIdChange(String(key))
            }}
          >
            <Label>Application</Label>
            <Description>CAR group whose monitors and logs will be checked.</Description>
            <Select.Trigger className="min-h-11">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {applications.map((application) => (
                  <ListBox.Item
                    key={application.id}
                    id={application.id}
                    textValue={`${application.name} · CAR ${application.carId}`}
                  >
                    {application.name}{" "}
                    <span className="text-muted-foreground">· CAR {application.carId}</span>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        )}

        <TextField className="w-full" name="name" variant="secondary">
          <Label>Check name</Label>
          <Description>A label you&apos;ll recognize in deployment history.</Description>
          <Input
            variant="secondary"
            className="min-h-11"
            value={draft.name}
            placeholder={
              selectedApplication
                ? `${selectedApplication.name} deployment validation`
                : "Deployment validation"
            }
            onChange={(event) => onDraftChange({ name: event.target.value })}
          />
        </TextField>

        <div className="grid gap-4 md:grid-cols-3">
          {environmentFromCar ? (
            <div className="space-y-1.5">
              <Label>Environment</Label>
              <div className="flex min-h-11 items-center gap-2 rounded-lg border border-border/50 bg-muted/10 px-3 text-sm font-medium text-foreground">
                <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {draft.environment || selectedApplication?.environment}
              </div>
              <Description>Read-only from CAR metadata</Description>
            </div>
          ) : (
            <TextField className="w-full" name="environment" variant="secondary">
              <Label>Environment</Label>
              <Input
                variant="secondary"
                className="min-h-11"
                value={draft.environment}
                placeholder="production"
                onChange={(event) => onDraftChange({ environment: event.target.value })}
              />
            </TextField>
          )}

          <TextField className="w-full" name="version" variant="secondary">
            <Label>Version</Label>
            <Input
              variant="secondary"
              className="min-h-11"
              value={draft.version}
              placeholder="v1.8.0"
              onChange={(event) => onDraftChange({ version: event.target.value })}
            />
          </TextField>

          <TextField className="w-full" name="buildId" variant="secondary">
            <Label>Build ID</Label>
            <Input
              variant="secondary"
              className="min-h-11"
              value={draft.buildId}
              placeholder="release-2026.06.05"
              onChange={(event) => onDraftChange({ buildId: event.target.value })}
            />
          </TextField>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Deploy window</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Runs before this time are baseline. Runs after are post-deploy samples.
          </p>
        </div>

        <TextField className="w-full max-w-md" name="deploymentStartedAt" variant="secondary">
          <Label>Deployment time</Label>
          <Input
            variant="secondary"
            className="min-h-11"
            type="datetime-local"
            disabled={samplingLocked}
            value={draft.deploymentStartedAt}
            onChange={(event) => onDraftChange({ deploymentStartedAt: event.target.value })}
          />
          {draft.deploymentStartedAt ? (
            <Description>Baseline cutoff: {deploymentPreview}</Description>
          ) : null}
        </TextField>
      </section>
    </div>
  )
}
