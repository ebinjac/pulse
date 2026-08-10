"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreHorizontal, Pencil, Play, Plus, RotateCw, Users, Workflow } from "lucide-react"
import {
  AlertDialog,
  Button,
  Card,
  Chip,
  Description,
  Dropdown,
  EmptyState,
  Input,
  Label,
  ListBox,
  Modal,
  SearchField,
  Select,
  Table,
  TextArea,
  TextField,
} from "@workspace/ui/components/ui"
import { cn } from "@workspace/ui/lib/utils"
import { isFailedStatus, PageShell } from "@/components/pulse/console-shared"
import { notifyPulseToast } from "@/components/pulse/pulse-toast-queue"
import type { Application, ApplicationSLO, Monitor } from "@/lib/pulse-types"
import { formatUptimePct } from "@/lib/pulse-slo"
import { applicationHealth } from "../utils/console-utils"

const ENVIRONMENT_OPTIONS = [
  { id: "production", label: "Production" },
  { id: "staging", label: "Staging" },
  { id: "development", label: "Development" },
] as const

const EMPTY_DRAFT = {
  name: "",
  carId: "",
  elfAppId: "",
  indexPathTemplate: "",
  owner: "",
  environment: "production",
  description: "",
}

function environmentChipClass(environment: string) {
  if (environment === "production") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  }
  if (environment === "staging") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  }
  return "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300"
}

type ApplicationDraft = typeof EMPTY_DRAFT

function draftFromApplication(application: Application): ApplicationDraft {
  return {
    name: application.name,
    carId: application.carId,
    elfAppId: application.elfAppId || "",
    indexPathTemplate: application.indexPathTemplate || "",
    owner: application.owner || "",
    environment: application.environment || "production",
    description: application.description || "",
  }
}

function ApplicationFormModal({
  open,
  onOpenChange,
  mode,
  draft,
  onDraftChange,
  saving,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  draft: ApplicationDraft
  onDraftChange: (draft: ApplicationDraft) => void
  saving: boolean
  onSave: () => Promise<void>
}) {
  const update = (patch: Partial<ApplicationDraft>) => onDraftChange({ ...draft, ...patch })
  const isEdit = mode === "edit"

  return (
    <Modal isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{isEdit ? "Edit application" : "Create application group"}</Modal.Heading>
              <Description className="text-sm text-muted">
                {isEdit
                  ? "Update application registry details. Monitors linked to this group are unchanged."
                  : "Register a new application group to organize and execute synthetic monitor checks."}
              </Description>
            </Modal.Header>
            <Modal.Body className="space-y-4">
              <TextField className="w-full" name="applicationName" isRequired>
                <Label className="text-xs font-semibold">Application name</Label>
                <Input
                  variant="secondary"
                  fullWidth
                  value={draft.name}
                  onChange={(event) => update({ name: event.target.value })}
                  placeholder="e.g., Authentication Service, Billing API"
                />
              </TextField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField className="w-full" name="carId" isRequired>
                  <Label className="text-xs font-semibold">Registry CAR ID</Label>
                  <Input
                    variant="secondary"
                    fullWidth
                    value={draft.carId}
                    onChange={(event) => update({ carId: event.target.value })}
                    placeholder="e.g., CAR-1025"
                  />
                  <Description className="text-[10px] leading-normal">
                    Central Application Registry ID. Use shorthand name if unregistered.
                  </Description>
                </TextField>

                <TextField className="w-full sm:col-span-2" name="indexPathTemplate">
                  <Label className="text-xs font-semibold">Log index pattern</Label>
                  <Input
                    variant="secondary"
                    fullWidth
                    value={draft.indexPathTemplate}
                    onChange={(event) => update({ indexPathTemplate: event.target.value })}
                    placeholder="e.g., app-logs-*"
                  />
                  <Description className="text-[10px] leading-normal">
                    OpenSearch index pattern for ELF log checks on this application (for example <code className="text-[10px]">app-logs-*</code>).
                  </Description>
                </TextField>

                <TextField className="w-full" name="elfAppId">
                  <Label className="text-xs font-semibold">ELF app ID (optional)</Label>
                  <Input
                    variant="secondary"
                    fullWidth
                    value={draft.elfAppId}
                    onChange={(event) => update({ elfAppId: event.target.value })}
                    placeholder="Only if your index pattern uses {{elfAppId}}"
                  />
                </TextField>

                <TextField className="w-full" name="owner">
                  <Label className="text-xs font-semibold">Owner team</Label>
                  <Input
                    variant="secondary"
                    fullWidth
                    value={draft.owner}
                    onChange={(event) => update({ owner: event.target.value })}
                    placeholder="e.g., SRE, Payment Dev"
                  />
                  <Description className="text-[10px] leading-normal">
                    The engineering team responsible for maintaining checks.
                  </Description>
                </TextField>
              </div>

              <Select
                className="w-full"
                variant="secondary"
                aria-label="Environment"
                selectedKey={draft.environment}
                onSelectionChange={(key) => {
                  if (key != null) update({ environment: String(key) })
                }}
              >
                <Label className="text-xs font-semibold">Environment</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {ENVIRONMENT_OPTIONS.map((option) => (
                      <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
                        {option.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>

              <TextField className="w-full" name="description">
                <Label className="text-xs font-semibold">Description</Label>
                <TextArea
                  variant="secondary"
                  fullWidth
                  className="min-h-[70px] resize-none"
                  value={draft.description}
                  onChange={(event) => update({ description: event.target.value })}
                  placeholder="Provide a brief summary of what this application group represents..."
                />
              </TextField>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" slot="close" isDisabled={saving}>
                Cancel
              </Button>
              <Button
                className="gap-1.5"
                isDisabled={saving || !draft.name.trim() || !draft.carId.trim()}
                onPress={() => void onSave()}
              >
                {saving ? (
                  <RotateCw className="size-3.5 animate-spin" />
                ) : isEdit ? (
                  <Pencil className="size-3.5" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                {isEdit ? "Save changes" : "Create application"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export function ApplicationsView({
  applications,
  monitors,
  applicationSloMap: appSloLookup,
  onSaveApplication,
  onDeleteApplication,
  onRunApplication,
  runningAppId,
  embedded = false,
}: {
  applications: Application[]
  monitors: Monitor[]
  applicationSloMap?: Map<string, ApplicationSLO>
  onSaveApplication: (input: Application) => Promise<void>
  onDeleteApplication: (applicationId: string) => Promise<void>
  onRunApplication: (applicationId: string) => Promise<void>
  runningAppId?: string
  embedded?: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingApplication, setEditingApplication] = useState<Application | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Application | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const filteredApplications = useMemo(() => {
    const q = search.toLowerCase()
    return applications.filter((application) => {
      if (!q) return true
      return (
        application.name.toLowerCase().includes(q) ||
        application.carId.toLowerCase().includes(q) ||
        (application.owner || "").toLowerCase().includes(q)
      )
    })
  }, [applications, search])

  const sortedApplications = useMemo(() => {
    return [...filteredApplications].sort((a, b) => {
      const aMonitors = monitors.filter((m) => m.applicationId === a.id)
      const bMonitors = monitors.filter((m) => m.applicationId === b.id)
      const aFailing = aMonitors.filter((m) => isFailedStatus(m.status)).length
      const bFailing = bMonitors.filter((m) => isFailedStatus(m.status)).length

      if (aFailing > 0 && bFailing === 0) return -1
      if (bFailing > 0 && aFailing === 0) return 1

      return a.name.localeCompare(b.name)
    })
  }, [filteredApplications, monitors])

  function openCreateForm() {
    setFormMode("create")
    setEditingApplication(null)
    setDraft(EMPTY_DRAFT)
    setIsFormOpen(true)
  }

  function openEditForm(application: Application) {
    setFormMode("edit")
    setEditingApplication(application)
    setDraft(draftFromApplication(application))
    setIsFormOpen(true)
  }

  async function saveApplication() {
    if (!draft.name.trim() || !draft.carId.trim() || saving) return
    const applicationName = draft.name.trim()
    setSaving(true)
    try {
      const payload: Application =
        formMode === "edit" && editingApplication
          ? {
              ...editingApplication,
              name: applicationName,
              carId: draft.carId.trim(),
              elfAppId: draft.elfAppId.trim(),
              indexPathTemplate: draft.indexPathTemplate.trim(),
              owner: draft.owner.trim(),
              environment: draft.environment.trim() || "production",
              description: draft.description.trim(),
            }
          : {
              id: "",
              name: applicationName,
              carId: draft.carId.trim(),
              elfAppId: draft.elfAppId.trim(),
              indexPathTemplate: draft.indexPathTemplate.trim(),
              owner: draft.owner.trim(),
              environment: draft.environment.trim() || "production",
              description: draft.description.trim(),
              tags: [],
            }
      await onSaveApplication(payload)
      setDraft(EMPTY_DRAFT)
      setEditingApplication(null)
      setIsFormOpen(false)
      notifyPulseToast(
        "success",
        formMode === "edit" ? "Application updated" : "Application created",
        `${applicationName} saved successfully.`,
      )
    } catch (err) {
      notifyPulseToast(
        "danger",
        formMode === "edit" ? "Failed to update application" : "Failed to create application",
        err instanceof Error ? err.message : "Please try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function deleteApplication() {
    if (!confirmDelete || deleting) return
    const applicationName = confirmDelete.name
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDeleteApplication(confirmDelete.id)
      setConfirmDelete(null)
      notifyPulseToast("success", "Application deleted", `${applicationName} was removed from the registry.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete application."
      setDeleteError(message)
      notifyPulseToast("danger", "Failed to delete application", message)
    } finally {
      setDeleting(false)
    }
  }

  async function runApplication(applicationId: string) {
    const application = applications.find((item) => item.id === applicationId)
    try {
      notifyPulseToast(
        "info",
        "Running application checks",
        application?.name ? `Triggering monitors for ${application.name}.` : undefined,
      )
      await onRunApplication(applicationId)
    } catch (err) {
      notifyPulseToast(
        "danger",
        "Failed to run application",
        err instanceof Error ? err.message : "Please try again.",
      )
    }
  }

  const searchField = (
    <SearchField
      aria-label="Search applications"
      className={embedded ? "flex-1" : "w-full"}
      value={search}
      onChange={setSearch}
      variant="secondary"
    >
      <SearchField.Group className="h-10">
        <SearchField.SearchIcon />
        <SearchField.Input placeholder="Search applications by name, CAR ID, or owner..." />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  )

  const createButton = (
    <Button className="gap-2 whitespace-nowrap" onPress={openCreateForm}>
      <Plus className="size-4" />
      Create application
    </Button>
  )

  const tableCard = (

      <Table aria-label="Applications">
        <Table.ScrollContainer>
          <Table.Content className="min-w-[960px]">
            <Table.Header>
              <Table.Column isRowHeader className="w-[6%] text-center">
                Status
              </Table.Column>
              <Table.Column className="w-[30%]">Application</Table.Column>
              <Table.Column className="w-[12%]">Environment</Table.Column>
              <Table.Column className="w-[14%]">Owner team</Table.Column>
              <Table.Column className="w-[10%] text-center">Monitors</Table.Column>
              <Table.Column className="w-[8%] text-center">Uptime 7d</Table.Column>
              <Table.Column className="w-[8%] text-center">Uptime 30d</Table.Column>
              <Table.Column className="w-[8%] text-center">Avg latency</Table.Column>
              <Table.Column className="w-[14%] text-end">Actions</Table.Column>
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <EmptyState className="flex h-full min-h-52 w-full flex-col items-center justify-center gap-3 py-10 text-center">
                  <Workflow className="size-6 text-muted" aria-hidden />
                  <p className="text-sm font-semibold text-foreground">No applications found</p>
                  <Card.Description className="max-w-sm">
                    Create your first application group to start tracking endpoint availability.
                  </Card.Description>
                </EmptyState>
              )}
            >
              {sortedApplications.map((application) => {
                const appMonitors = monitors.filter((monitor) => monitor.applicationId === application.id)
                const appSlo = appSloLookup?.get(application.id)
                const health = applicationHealth(appMonitors, appSlo)
                const isRunning = runningAppId === application.id

                return (
                  <Table.Row key={application.id} id={application.id} className="hover:bg-default/40">
                    <Table.Cell className="text-center align-middle">
                      <span className="inline-flex items-center justify-center">
                        <span className="relative flex size-2.5">
                          {health.failing > 0 ? (
                            <>
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                              <span className="relative inline-flex size-2.5 rounded-full bg-rose-500" />
                            </>
                          ) : health.total > 0 ? (
                            <>
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                            </>
                          ) : (
                            <span className="relative inline-flex size-2.5 rounded-full bg-muted" />
                          )}
                        </span>
                      </span>
                    </Table.Cell>

                    <Table.Cell className="align-middle font-medium">
                      <div className="min-w-0 pr-2">
                        <Link
                          href={`/applications/${application.id}`}
                          className="block text-sm font-semibold text-foreground hover:text-accent hover:underline"
                        >
                          {application.name}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2">
                          <Chip size="sm" variant="soft" className="font-mono text-[9px]">
                            <Chip.Label>CAR {application.carId}</Chip.Label>
                          </Chip>
                          {application.description ? (
                            <Description className="max-w-[200px] truncate text-xs" title={application.description}>
                              {application.description}
                            </Description>
                          ) : null}
                        </div>
                      </div>
                    </Table.Cell>

                    <Table.Cell className="align-middle">
                      {application.environment ? (
                        <Chip size="sm" variant="soft" className={cn("uppercase", environmentChipClass(application.environment))}>
                          <Chip.Label className="text-[9px] font-bold tracking-wide">
                            {application.environment}
                          </Chip.Label>
                        </Chip>
                      ) : (
                        <Description className="text-[10px]">—</Description>
                      )}
                    </Table.Cell>

                    <Table.Cell className="align-middle">
                      {application.owner ? (
                        <span className="inline-flex items-center gap-1.5 rounded border border-separator bg-default px-2 py-0.5 text-xs font-medium text-foreground">
                          <Users className="size-3 text-muted" />
                          {application.owner}
                        </span>
                      ) : (
                        <Description className="text-[10px]">—</Description>
                      )}
                    </Table.Cell>

                    <Table.Cell className="text-center align-middle">
                      <div className="text-xs font-semibold text-foreground">{health.total}</div>
                      <Description className="text-[9px] font-medium">{health.active} active</Description>
                    </Table.Cell>

                    <Table.Cell className="text-center align-middle text-xs font-bold text-foreground">
                      {formatUptimePct(health.uptime7d)}
                    </Table.Cell>
                    <Table.Cell className="text-center align-middle text-xs font-bold text-foreground">
                      {formatUptimePct(health.successRate)}
                    </Table.Cell>

                    <Table.Cell className="text-center align-middle">
                      <div className="text-xs font-semibold text-foreground">{health.avgLatency}ms</div>
                      <Description className="text-[9px] font-medium">last avg</Description>
                    </Table.Cell>

                    <Table.Cell className="pr-6 text-end align-middle">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          className="min-w-[110px] justify-center gap-1"
                          isDisabled={!!runningAppId || health.active === 0 || isRunning}
                          onPress={() => void runApplication(application.id)}
                        >
                          {isRunning ? (
                            <>
                              <RotateCw className="size-3 animate-spin" />
                              Running
                            </>
                          ) : (
                            <>
                              <Play className="size-3" />
                              Run execution
                            </>
                          )}
                        </Button>
                        <Dropdown>
                          <Button variant="ghost" size="sm" isIconOnly aria-label={`Actions for ${application.name}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                          <Dropdown.Popover>
                            <Dropdown.Menu
                              onAction={(key) => {
                                if (key === "view") router.push(`/applications/${application.id}`)
                                if (key === "edit") openEditForm(application)
                                if (key === "delete") {
                                  setDeleteError(null)
                                  setConfirmDelete(application)
                                }
                              }}
                            >
                              <Dropdown.Item id="view" textValue="View application">
                                View application
                              </Dropdown.Item>
                              <Dropdown.Item id="edit" textValue="Edit application">
                                Edit application
                              </Dropdown.Item>
                              <Dropdown.Item id="delete" textValue="Delete application" className="text-danger">
                                Delete application
                              </Dropdown.Item>
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

  )

  const innerLayout = (
    <div className="flex flex-col gap-4">
      {embedded ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {searchField}
          {createButton}
        </div>
      ) : (
        <Card>
          <Card.Content className="gap-4">
            <Description className="text-sm">
              Search the application registry by name, CAR ID, or owner team.
            </Description>
            {searchField}
            <Description className="text-xs">
              Showing {sortedApplications.length} application{sortedApplications.length === 1 ? "" : "s"}
            </Description>
          </Card.Content>
        </Card>
      )}
      {tableCard}
    </div>
  )

  return (
    <>
      {embedded ? (
        innerLayout
      ) : (
        <PageShell
          eyebrow="Application registry"
          title="Applications"
          description="Group monitors by application and CAR ID for service health checking across owned environments."
          action={createButton}
        >
          {innerLayout}
        </PageShell>
      )}

      <ApplicationFormModal
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) {
            setEditingApplication(null)
            setDraft(EMPTY_DRAFT)
          }
        }}
        mode={formMode}
        draft={draft}
        onDraftChange={setDraft}
        saving={saving}
        onSave={saveApplication}
      />

      <AlertDialog.Backdrop
        isOpen={confirmDelete !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !deleting) {
            setConfirmDelete(null)
            setDeleteError(null)
          }
        }}
      >
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete application?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="space-y-2 text-left text-sm text-muted">
              <p>
                Are you sure you want to permanently delete{" "}
                <strong className="text-foreground">{confirmDelete?.name}</strong>?
              </p>
              <p>
                Monitors assigned to this application will be unlinked but not deleted. Deployment validations and
                historical runs remain in the system.
              </p>
              {deleteError ? <p className="text-danger text-xs font-medium">{deleteError}</p> : null}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" slot="close" isDisabled={deleting}>
                Cancel
              </Button>
              <Button variant="danger" isDisabled={deleting} onPress={() => void deleteApplication()}>
                {deleting ? <RotateCw className="size-3.5 animate-spin" /> : null}
                Delete application
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  )
}
