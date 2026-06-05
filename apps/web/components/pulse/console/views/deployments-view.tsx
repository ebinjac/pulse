"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Plus,
  Workflow,
} from "lucide-react"

import {
  formatDate,
  Metric,
  PageShell,
} from "@/components/pulse/console-shared"
import { ValidationResultPill } from "@/components/pulse/console/components/validation-result-pill"
import type { Application, DeploymentValidation, Monitor } from "@/lib/pulse-types"
import {
  Button,
  Card,
  Checkbox,
  CheckboxGroup,
  EmptyState,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  Spinner,
  Table,
  TextField,
} from "@heroui/react"

import { dateTimeLocalToISOString, toDateTimeLocalInput, validationStatusLabel } from "../utils/console-utils"
import type { DeploymentValidationCreateInput } from "../types"

export function DeploymentsView({
  applications,
  monitors,
  validations,
  onCreateValidation,
}: {
  applications: Application[]
  monitors: Monitor[]
  validations: DeploymentValidation[]
  onCreateValidation: (input: DeploymentValidationCreateInput) => Promise<DeploymentValidation | null>
}) {
  const defaultApplication = applications[0]
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [applicationId, setApplicationId] = useState(defaultApplication?.id || "")
  const selectedApplication = applications.find((app) => app.id === applicationId) || defaultApplication
  const activeMonitors = monitors.filter((monitor) => monitor.applicationId === selectedApplication?.id && monitor.isActive)
  const [selectedMonitorIds, setSelectedMonitorIds] = useState<string[]>([])
  const [draft, setDraft] = useState({
    name: "",
    version: "",
    buildId: "",
    environment: defaultApplication?.environment || "production",
    deploymentStartedAt: toDateTimeLocalInput(),
    baselineWindowHours: 24,
    baselineRunCount: 30,
    sampleCount: 30,
    intervalSeconds: 30,
  })

  useEffect(() => {
    if (!applicationId && defaultApplication?.id) {
      setApplicationId(defaultApplication.id)
    }
  }, [applicationId, defaultApplication?.id])

  useEffect(() => {
    if (open) {
      setSelectedMonitorIds(activeMonitors.map((monitor) => monitor.id))
      setDraft((current) => ({
        ...current,
        deploymentStartedAt: toDateTimeLocalInput(),
        environment: selectedApplication?.environment || current.environment || "production",
      }))
    }
  }, [open, selectedApplication?.id, activeMonitors.length])

  async function createValidation() {
    if (!selectedApplication || saving || selectedMonitorIds.length === 0) return
    setSaving(true)
    try {
      await onCreateValidation({
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
      })
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell
      eyebrow="Release checks"
      title="Deployments"
      description="Compare historical baseline behavior against sampled post-deployment checks."
      action={
        <Button onPress={() => setOpen(true)} className="h-9 gap-2">
          <Plus className="size-4" />
          New deployment check
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Deployment checks" value={String(validations.length)} icon={Workflow} detail="All applications" />
          <Metric label="Ready reports" value={String(validations.filter((validation) => validation.status === "report_ready").length)} icon={CheckCircle2} detail="Completed comparisons" tone="success" />
          <Metric label="Failing reports" value={String(validations.filter((validation) => validation.report?.status === "fail").length)} icon={AlertTriangle} detail="Needs investigation" tone="danger" />
          <Metric label="Applications" value={String(applications.length)} icon={Boxes} detail="CAR groups" />
        </div>

        <Card className="gap-0 p-0">
          <Card.Header className="flex flex-col gap-1.5 border-b border-border/40 p-5">
            <Card.Title className="text-base font-semibold">Deployment history</Card.Title>
            <Card.Description>
              Baseline versus post-deploy validation reports across application groups.
            </Card.Description>
          </Card.Header>
          <Card.Content className="p-0">
            {validations.length === 0 ? (
              <div className="px-5 py-12">
                <EmptyState className="flex flex-col items-center justify-center gap-2 border-0 bg-transparent text-center">
                  <Workflow className="size-6 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">No deployment checks yet</span>
                  <span className="text-xs text-muted-foreground max-w-sm">
                    Create one to compare historical baseline metrics with post-deploy samples.
                  </span>
                </EmptyState>
              </div>
            ) : (
              <Table aria-label="Deployment history">
                <Table.ScrollContainer>
                  <Table.Content className="min-w-[860px]">
                    <Table.Header>
                      <Table.Column isRowHeader className="px-5">Deployment</Table.Column>
                      <Table.Column className="px-3">Application</Table.Column>
                      <Table.Column className="px-3">Samples</Table.Column>
                      <Table.Column className="px-3">Status</Table.Column>
                      <Table.Column className="px-3">Report</Table.Column>
                      <Table.Column className="px-5 text-end">Action</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {validations.map((validation) => {
                        const envVersion = [validation.environment, validation.version, validation.buildId]
                          .filter(Boolean)
                          .join(" · ")
                        return (
                          <Table.Row key={validation.id} id={validation.id} className="hover:bg-muted/30">
                            <Table.Cell className="max-w-[320px] px-5 align-top py-4">
                              <Link
                                href={`/deployments/${validation.id}`}
                                className="font-semibold text-foreground hover:text-primary hover:underline"
                              >
                                {validation.name}
                              </Link>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {envVersion || formatDate(validation.createdAt)}
                              </p>
                            </Table.Cell>
                            <Table.Cell className="px-3 align-top py-4">
                              <span className="text-xs font-semibold text-foreground">{validation.applicationName}</span>
                              <p className="text-[11px] text-muted-foreground">CAR {validation.carId}</p>
                            </Table.Cell>
                            <Table.Cell className="px-3 align-top py-4 text-xs">
                              <span className="font-semibold text-foreground">
                                {validation.baselineRunCount || 30} baseline + {validation.sampleCount || 30} post
                              </span>
                              <p className="text-[11px] text-muted-foreground">
                                {validation.intervalSeconds || 0}s post interval
                              </p>
                            </Table.Cell>
                            <Table.Cell className="px-3 align-top py-4 text-xs font-semibold capitalize">
                              {validationStatusLabel(validation.status)}
                            </Table.Cell>
                            <Table.Cell className="px-3 align-top py-4">
                              <ValidationResultPill status={validation.report?.status || "incomplete"} />
                            </Table.Cell>
                            <Table.Cell className="px-5 align-top py-4 text-end">
                              <Link
                                href={`/deployments/${validation.id}`}
                                className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                              >
                                Open <ChevronRight className="size-3" />
                              </Link>
                            </Table.Cell>
                          </Table.Row>
                        )
                      })}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            )}
          </Card.Content>
        </Card>
      </div>

      <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-2xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>New deployment check</Modal.Heading>
              <p className="mt-1.5 text-sm leading-5 text-muted">
                Select an application, choose the deployment time, and configure baseline plus post-deploy sampling.
              </p>
            </Modal.Header>
            <Modal.Body className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Select
                  aria-label="Application"
                  className="w-full"
                  variant="secondary"
                  selectedKey={applicationId}
                  onSelectionChange={(key) => {
                    if (key != null) setApplicationId(String(key))
                  }}
                >
                  <Label>Application</Label>
                  <Select.Trigger>
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
                          {application.name} <span className="text-muted-foreground">· CAR {application.carId}</span>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>

                <TextField className="w-full" name="environment" variant="secondary">
                  <Label>Environment</Label>
                  <Input
                    variant="secondary"
                    value={draft.environment}
                    onChange={(event) => setDraft({ ...draft, environment: event.target.value })}
                    className="h-9 text-xs"
                  />
                </TextField>

                <TextField className="w-full md:col-span-2" name="name" variant="secondary">
                  <Label>Name</Label>
                  <Input
                    variant="secondary"
                    value={draft.name}
                    placeholder={selectedApplication ? `${selectedApplication.name} deployment validation` : "Deployment validation"}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    className="h-9 text-xs"
                  />
                </TextField>

                <TextField className="w-full" name="version" variant="secondary">
                  <Label>Version</Label>
                  <Input
                    variant="secondary"
                    value={draft.version}
                    placeholder="v1.8.0"
                    onChange={(event) => setDraft({ ...draft, version: event.target.value })}
                    className="h-9 text-xs"
                  />
                </TextField>

                <TextField className="w-full" name="buildId" variant="secondary">
                  <Label>Build ID</Label>
                  <Input
                    variant="secondary"
                    value={draft.buildId}
                    placeholder="release-2026.06.05"
                    onChange={(event) => setDraft({ ...draft, buildId: event.target.value })}
                    className="h-9 text-xs"
                  />
                </TextField>

                <TextField className="w-full" name="deploymentStartedAt" variant="secondary">
                  <Label>Deployment time</Label>
                  <Input
                    variant="secondary"
                    type="datetime-local"
                    value={draft.deploymentStartedAt}
                    onChange={(event) => setDraft({ ...draft, deploymentStartedAt: event.target.value })}
                    className="h-9 text-xs"
                  />
                </TextField>

                <div className="hidden md:block" />

                <TextField className="w-full" name="baselineWindowHours" variant="secondary">
                  <Label>Baseline window (hours)</Label>
                  <Input
                    variant="secondary"
                    type="number"
                    min={1}
                    max={720}
                    value={String(draft.baselineWindowHours)}
                    onChange={(event) => setDraft({ ...draft, baselineWindowHours: Number(event.target.value) })}
                    className="h-9 text-xs"
                  />
                </TextField>

                <TextField className="w-full" name="baselineRunCount" variant="secondary">
                  <Label>Baseline runs / monitor</Label>
                  <Input
                    variant="secondary"
                    type="number"
                    min={1}
                    max={500}
                    value={String(draft.baselineRunCount)}
                    onChange={(event) => setDraft({ ...draft, baselineRunCount: Number(event.target.value) })}
                    className="h-9 text-xs"
                  />
                </TextField>

                <TextField className="w-full" name="sampleCount" variant="secondary">
                  <Label>Post samples / monitor</Label>
                  <Input
                    variant="secondary"
                    type="number"
                    min={1}
                    max={100}
                    value={String(draft.sampleCount)}
                    onChange={(event) => setDraft({ ...draft, sampleCount: Number(event.target.value) })}
                    className="h-9 text-xs"
                  />
                </TextField>

                <TextField className="w-full" name="intervalSeconds" variant="secondary">
                  <Label>Post sample interval (s)</Label>
                  <Input
                    variant="secondary"
                    type="number"
                    min={0}
                    max={3600}
                    value={String(draft.intervalSeconds)}
                    onChange={(event) => setDraft({ ...draft, intervalSeconds: Number(event.target.value) })}
                    className="h-9 text-xs"
                  />
                </TextField>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Active monitors</Label>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {selectedMonitorIds.length} of {activeMonitors.length} selected
                  </span>
                </div>
                <div className="max-h-64 overflow-auto rounded-lg border border-border/40 bg-muted/5">
                  {activeMonitors.length === 0 ? (
                    <div className="p-4 text-xs text-muted-foreground">
                      No active monitors are assigned to this application.
                    </div>
                  ) : (
                    <CheckboxGroup
                      aria-label="Active monitors"
                      className="gap-0 p-1"
                      value={selectedMonitorIds}
                      onChange={setSelectedMonitorIds}
                    >
                      {activeMonitors.map((monitor) => (
                        <Checkbox
                          key={monitor.id}
                          value={monitor.id}
                          className="w-full max-w-full items-start gap-3 rounded-md px-3 py-2 hover:bg-muted/30 data-[selected=true]:bg-muted/20"
                        >
                          <Checkbox.Control className="mt-0.5">
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                          <Checkbox.Content className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold text-foreground">{monitor.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {monitor.description || monitor.scheduleLabel || "Synthetic monitor"}
                            </span>
                          </Checkbox.Content>
                        </Checkbox>
                      ))}
                    </CheckboxGroup>
                  )}
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" slot="close" isDisabled={saving}>
                Cancel
              </Button>
              <Button
                onPress={createValidation}
                isDisabled={saving || !selectedApplication || selectedMonitorIds.length === 0}
                className="gap-1.5"
              >
                {saving ? <Spinner color="current" size="sm" /> : <Plus className="size-3.5" />}
                Create check
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </PageShell>
  )
}
