"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Eye, Plus, RotateCw } from "lucide-react"
import type { Application, DeploymentValidation, Monitor } from "@/lib/pulse-types"
import { formatDate } from "@/components/pulse/console-shared"
import { Button, Card, Checkbox, Description, EmptyState, Input, Label, Modal, Table, TextField } from "@heroui/react"
import type { DeploymentValidationCreateInput } from "../types"
import { dateTimeLocalToISOString, toDateTimeLocalInput, validationStatusLabel } from "../utils/console-utils"
import { ValidationResultPill } from "./validation-result-pill"

export function DeploymentValidationPanel({
  application,
  monitors,
  validations,
  onCreateValidation,
}: {
  application: Application
  monitors: Monitor[]
  validations: DeploymentValidation[]
  onCreateValidation: (input: DeploymentValidationCreateInput) => Promise<DeploymentValidation | null>
}) {
  const activeMonitors = monitors.filter((monitor) => monitor.isActive)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedMonitorIds, setSelectedMonitorIds] = useState<string[]>(activeMonitors.map((monitor) => monitor.id))
  const [draft, setDraft] = useState({
    name: "",
    version: "",
    buildId: "",
    environment: application.environment || "production",
    deploymentStartedAt: toDateTimeLocalInput(),
    baselineWindowHours: 24,
    baselineRunCount: 30,
    sampleCount: 30,
    intervalSeconds: 30,
  })

  useEffect(() => {
    if (open) {
      setSelectedMonitorIds(activeMonitors.map((monitor) => monitor.id))
      setDraft((current) => ({ ...current, deploymentStartedAt: toDateTimeLocalInput() }))
    }
  }, [open, activeMonitors.length])

  async function createValidation() {
    if (saving || selectedMonitorIds.length === 0) return
    setSaving(true)
    try {
      const created = await onCreateValidation({
        applicationId: application.id,
        name: draft.name || `${application.name} deployment validation`,
        version: draft.version,
        buildId: draft.buildId,
        environment: draft.environment,
        monitorIds: selectedMonitorIds,
        sampleCount: draft.sampleCount,
        intervalSeconds: draft.intervalSeconds,
        deploymentStartedAt: dateTimeLocalToISOString(draft.deploymentStartedAt),
        baselineWindowHours: draft.baselineWindowHours,
        baselineRunCount: draft.baselineRunCount,
      })
      if (created) {
        setOpen(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <Card.Header className="border-b pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <Card.Title className="text-sm font-semibold">Deployment validations</Card.Title>
            <Card.Description>Compare historical baseline metrics against sampled post-deploy checks.</Card.Description>
          </div>
          <Button size="sm" className="h-8 gap-2" onPress={() => setOpen(true)}>
            <Plus className="size-3.5" />
            New validation
          </Button>
        </div>
      </Card.Header>
      <Card.Content className="pt-4">
        {validations.length === 0 ? (
          <div className="rounded-md border border-dashed bg-default/30 p-4 text-xs text-muted-foreground">
            No deployment validations yet. Create one before your next release to compare baseline and post-deploy behavior.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table aria-label="Deployment validations">
              <Table.ScrollContainer>
                <Table.Content className="min-w-[640px]">
                  <Table.Header>
                    <Table.Column isRowHeader className="text-xs">
                      Validation
                    </Table.Column>
                    <Table.Column className="text-xs">Status</Table.Column>
                    <Table.Column className="text-xs">Report</Table.Column>
                    <Table.Column className="text-xs">Created</Table.Column>
                    <Table.Column className="text-end text-xs">Action</Table.Column>
                  </Table.Header>
                  <Table.Body
                    renderEmptyState={() => (
                      <EmptyState className="flex h-24 w-full items-center justify-center text-xs text-muted-foreground">
                        No validations yet.
                      </EmptyState>
                    )}
                  >
                    {validations.slice(0, 5).map((validation) => (
                      <Table.Row key={validation.id} id={validation.id}>
                        <Table.Cell>
                          <div className="text-sm font-semibold">{validation.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {[validation.environment, validation.version, validation.buildId].filter(Boolean).join(" · ") || `CAR ${validation.carId}`}
                          </div>
                        </Table.Cell>
                        <Table.Cell className="text-xs font-semibold capitalize">{validationStatusLabel(validation.status)}</Table.Cell>
                        <Table.Cell>
                          <ValidationResultPill status={validation.report?.status || "incomplete"} />
                        </Table.Cell>
                        <Table.Cell className="text-xs text-muted-foreground">{formatDate(validation.createdAt)}</Table.Cell>
                        <Table.Cell className="text-end">
                          <Link href={`/deployments/${validation.id}`}>
                            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                              <Eye className="size-3" />
                              Open
                            </Button>
                          </Link>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
        )}
      </Card.Content>

      <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
        <Modal.Container className="sm:max-w-2xl">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Create deployment validation</Modal.Heading>
              <Description>
                Pick the deployment time, baseline history, and post-deploy sampling plan for CAR {application.carId}.
              </Description>
            </Modal.Header>
            <Modal.Body className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <TextField>
                  <Label className="text-xs font-semibold">Name</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    variant="secondary"
                    value={draft.name}
                    placeholder={`${application.name} deployment validation`}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </TextField>
                <TextField>
                  <Label className="text-xs font-semibold">Environment</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    variant="secondary"
                    value={draft.environment}
                    onChange={(e) => setDraft({ ...draft, environment: e.target.value })}
                  />
                </TextField>
                <TextField>
                  <Label className="text-xs font-semibold">Version</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    variant="secondary"
                    value={draft.version}
                    placeholder="v1.8.0"
                    onChange={(e) => setDraft({ ...draft, version: e.target.value })}
                  />
                </TextField>
                <TextField>
                  <Label className="text-xs font-semibold">Build ID</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    variant="secondary"
                    value={draft.buildId}
                    placeholder="release-2026.06.04"
                    onChange={(e) => setDraft({ ...draft, buildId: e.target.value })}
                  />
                </TextField>
                <TextField>
                  <Label className="text-xs font-semibold">Deployment time</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    variant="secondary"
                    type="datetime-local"
                    value={draft.deploymentStartedAt}
                    onChange={(e) => setDraft({ ...draft, deploymentStartedAt: e.target.value })}
                  />
                </TextField>
                <TextField>
                  <Label className="text-xs font-semibold">Baseline window hours</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    variant="secondary"
                    type="number"
                    min={1}
                    max={720}
                    value={String(draft.baselineWindowHours)}
                    onChange={(e) => setDraft({ ...draft, baselineWindowHours: Number(e.target.value) })}
                  />
                </TextField>
                <TextField>
                  <Label className="text-xs font-semibold">Baseline runs per monitor</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    variant="secondary"
                    type="number"
                    min={1}
                    max={500}
                    value={String(draft.baselineRunCount)}
                    onChange={(e) => setDraft({ ...draft, baselineRunCount: Number(e.target.value) })}
                  />
                </TextField>
                <TextField>
                  <Label className="text-xs font-semibold">Post samples per monitor</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    variant="secondary"
                    type="number"
                    min={1}
                    max={100}
                    value={String(draft.sampleCount)}
                    onChange={(e) => setDraft({ ...draft, sampleCount: Number(e.target.value) })}
                  />
                </TextField>
                <TextField>
                  <Label className="text-xs font-semibold">Post sample interval seconds</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    variant="secondary"
                    type="number"
                    min={0}
                    max={3600}
                    value={String(draft.intervalSeconds)}
                    onChange={(e) => setDraft({ ...draft, intervalSeconds: Number(e.target.value) })}
                  />
                </TextField>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold">Monitors</div>
                <div className="max-h-64 overflow-auto rounded-md border">
                  {activeMonitors.length === 0 ? (
                    <div className="p-4 text-xs text-muted-foreground">No active monitors are assigned to this application.</div>
                  ) : (
                    activeMonitors.map((monitor) => (
                      <Checkbox
                        key={monitor.id}
                        isSelected={selectedMonitorIds.includes(monitor.id)}
                        onChange={(isSelected: boolean) => {
                          setSelectedMonitorIds((current) =>
                            isSelected ? [...current, monitor.id] : current.filter((id) => id !== monitor.id)
                          )
                        }}
                        className="w-full border-b px-3 py-2 last:border-b-0 [&_[data-slot=label]]:w-full"
                      >
                        <div className="min-w-0">
                          <span className="block font-semibold text-foreground text-xs">{monitor.name}</span>
                          <span className="block truncate text-muted-foreground text-xs">
                            {monitor.description || monitor.scheduleLabel || "Synthetic monitor"}
                          </span>
                        </div>
                      </Checkbox>
                    ))
                  )}
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline" onPress={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onPress={createValidation} isDisabled={saving || selectedMonitorIds.length === 0}>
                {saving ? <RotateCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                Create validation
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Card>
  )
}
