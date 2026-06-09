"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  MoreHorizontal,
  Plus,
  RotateCw,
  Workflow,
} from "lucide-react"

import {
  formatDate,
  Metric,
  PageShell,
} from "@/components/pulse/console-shared"
import { ValidationResultPill } from "@/components/pulse/console/components/validation-result-pill"
import type { Application, DeploymentValidation } from "@/lib/pulse-types"
import {
  AlertDialog,
  Button,
  Card,
  Chip,
  Dropdown,
  EmptyState,
  Input,
  Label,
  ListBox,
  Select,
  Table,
  TextField,
} from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"

import { validationStatusLabel } from "../utils/console-utils"
import {
  deploymentAttentionItems,
  deploymentProgressSummary,
} from "../deployment-detail/deployment-workflow-view-models"

export function DeploymentsView({
  applications,
  validations,
  onDeleteValidation,
}: {
  applications: Application[]
  validations: DeploymentValidation[]
  onDeleteValidation: (validationId: string) => Promise<void>
}) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState<DeploymentValidation | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [appFilter, setAppFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [verdictFilter, setVerdictFilter] = useState("all")
  const [environmentFilter, setEnvironmentFilter] = useState("all")

  const environments = useMemo(
    () => Array.from(new Set(validations.map((validation) => validation.environment).filter((value): value is string => Boolean(value)))).sort(),
    [validations],
  )
  const attentionItems = useMemo(() => deploymentAttentionItems(validations), [validations])
  const filteredValidations = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return validations.filter((validation) => {
      if (appFilter !== "all" && validation.applicationId !== appFilter) return false
      if (statusFilter !== "all" && validation.status !== statusFilter) return false
      if (verdictFilter !== "all" && (validation.report?.status || "incomplete") !== verdictFilter) return false
      if (environmentFilter !== "all" && validation.environment !== environmentFilter) return false
      if (!needle) return true
      return [
        validation.name,
        validation.applicationName,
        validation.carId,
        validation.environment,
        validation.version,
        validation.buildId,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [appFilter, environmentFilter, query, statusFilter, validations, verdictFilter])

  async function deleteValidation() {
    if (!confirmDelete || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDeleteValidation(confirmDelete.id)
      setConfirmDelete(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete deployment check.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageShell
      eyebrow="Release checks"
      title="Deployments"
      description="Compare historical baseline behavior against sampled post-deployment checks."
      action={
        <Link href="/deployments/create">
          <Button className="h-9 gap-2">
            <Plus className="size-4" />
            New deployment check
          </Button>
        </Link>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Deployment checks" value={String(validations.length)} icon={Workflow} detail="All applications" />
          <Metric label="Ready reports" value={String(validations.filter((validation) => validation.status === "report_ready").length)} icon={CheckCircle2} detail="Completed comparisons" tone="success" />
          <Metric label="Failing reports" value={String(validations.filter((validation) => validation.report?.status === "fail").length)} icon={AlertTriangle} detail="Needs investigation" tone="danger" />
          <Metric label="Applications" value={String(applications.length)} icon={Boxes} detail="CAR groups" />
        </div>

        {attentionItems.length > 0 ? (
          <Card className="border-warning/30 bg-warning/[0.04]">
            <Card.Header className="border-b border-warning/20 pb-3">
              <Card.Title className="text-sm font-semibold">Needs attention</Card.Title>
              <Card.Description>Running checks and reports with warning or failure verdicts.</Card.Description>
            </Card.Header>
            <Card.Content className="grid gap-2 pt-4 md:grid-cols-2 xl:grid-cols-4">
              {attentionItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/deployments/${item.id}`}
                  className={cn(
                    "rounded-lg border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-muted/20",
                    item.tone === "danger" ? "border-danger/30" : item.tone === "warning" ? "border-warning/30" : "border-primary/30",
                  )}
                >
                  <div className="truncate text-xs font-semibold text-foreground">{item.title}</div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{item.detail}</p>
                </Link>
              ))}
            </Card.Content>
          </Card>
        ) : null}

        <Card className="gap-0 p-0">
          <Card.Header className="flex flex-col gap-4 border-b border-border/40 p-5">
            <div>
              <Card.Title className="text-base font-semibold">Deployment history</Card.Title>
              <Card.Description>
                Baseline versus post-deploy validation reports across application groups.
              </Card.Description>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px_150px_150px]">
              <TextField aria-label="Search deployments" variant="secondary">
                <Label className="sr-only">Search deployments</Label>
                <Input
                  variant="secondary"
                  placeholder="Search name, app, CAR, version..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </TextField>
              <FilterSelect label="Application" value={appFilter} onChange={setAppFilter} items={[
                { id: "all", label: "All applications" },
                ...applications.map((application) => ({ id: application.id, label: application.name })),
              ]} />
              <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} items={[
                { id: "all", label: "All statuses" },
                { id: "draft", label: "Draft" },
                { id: "post_running", label: "Sampling" },
                { id: "log_running", label: "Log checks" },
                { id: "report_ready", label: "Report ready" },
              ]} />
              <FilterSelect label="Verdict" value={verdictFilter} onChange={setVerdictFilter} items={[
                { id: "all", label: "All verdicts" },
                { id: "pass", label: "Pass" },
                { id: "warning", label: "Warning" },
                { id: "fail", label: "Fail" },
                { id: "incomplete", label: "Incomplete" },
              ]} />
              <FilterSelect label="Environment" value={environmentFilter} onChange={setEnvironmentFilter} items={[
                { id: "all", label: "All envs" },
                ...environments.map((environment) => ({ id: environment, label: environment || "Unknown" })),
              ]} />
            </div>
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
                  <Link href="/deployments/create" className="mt-2">
                    <Button size="sm" className="gap-1.5">
                      <Plus className="size-3.5" />
                      New deployment check
                    </Button>
                  </Link>
                </EmptyState>
              </div>
            ) : filteredValidations.length === 0 ? (
              <div className="px-5 py-12">
                <EmptyState className="flex flex-col items-center justify-center gap-2 border-0 bg-transparent text-center">
                  <Workflow className="size-6 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">No deployment checks match filters</span>
                  <span className="text-xs text-muted-foreground max-w-sm">
                    Clear a filter or search term to see more deployment checks.
                  </span>
                </EmptyState>
              </div>
            ) : (
              <Table aria-label="Deployment history">
                <Table.ScrollContainer>
                  <Table.Content className="min-w-[980px]">
                    <Table.Header>
                      <Table.Column isRowHeader className="px-5">Deployment</Table.Column>
                      <Table.Column className="px-3">Application</Table.Column>
                      <Table.Column className="px-3">Progress</Table.Column>
                      <Table.Column className="px-3">Samples</Table.Column>
                      <Table.Column className="px-3">Status</Table.Column>
                      <Table.Column className="px-3">Report</Table.Column>
                      <Table.Column className="px-5 text-end">Action</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {filteredValidations.map((validation) => {
                        const envVersion = [validation.environment, validation.version, validation.buildId]
                          .filter(Boolean)
                          .join(" · ")
                        const progress = deploymentProgressSummary(validation)
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
                            <Table.Cell className="px-3 align-top py-4">
                              <div className="min-w-40 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <Chip size="sm" variant="soft" className="capitalize">
                                    <Chip.Label>{progress.label}</Chip.Label>
                                  </Chip>
                                  <span className="text-[11px] font-semibold text-muted-foreground">{progress.progressPct}%</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full rounded-full bg-primary" style={{ width: `${progress.progressPct}%` }} />
                                </div>
                                <p className="truncate text-[11px] text-muted-foreground">{progress.detail}</p>
                              </div>
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
                              <div className="flex items-center justify-end gap-1.5">
                                <Link
                                  href={`/deployments/${validation.id}`}
                                  className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                                >
                                  Open <ChevronRight className="size-3" />
                                </Link>
                                <Dropdown>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    isIconOnly
                                    aria-label={`Actions for ${validation.name}`}
                                  >
                                    <MoreHorizontal className="size-4" />
                                  </Button>
                                  <Dropdown.Popover>
                                    <Dropdown.Menu
                                      onAction={(key) => {
                                        if (key === "view") router.push(`/deployments/${validation.id}`)
                                        if (key === "edit") router.push(`/deployments/${validation.id}/edit`)
                                        if (key === "delete") {
                                          setDeleteError(null)
                                          setConfirmDelete(validation)
                                        }
                                      }}
                                    >
                                      <Dropdown.Item id="view" textValue="View deployment check">
                                        View deployment check
                                      </Dropdown.Item>
                                      <Dropdown.Item id="edit" textValue="Edit deployment check">
                                        Edit deployment check
                                      </Dropdown.Item>
                                      <Dropdown.Item id="delete" textValue="Delete deployment check" className="text-danger">
                                        Delete deployment check
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
            )}
          </Card.Content>
        </Card>
      </div>

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
              <AlertDialog.Heading>Delete deployment check?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="space-y-2 text-left text-sm text-muted">
              <p>
                Are you sure you want to permanently delete{" "}
                <strong className="text-foreground">{confirmDelete?.name}</strong>?
              </p>
              <p>
                Linked baseline and post-deploy run samples will be removed. Monitor run history is preserved.
              </p>
              {deleteError ? <p className="text-danger text-xs font-medium">{deleteError}</p> : null}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" slot="close" isDisabled={deleting}>
                Cancel
              </Button>
              <Button variant="danger" isDisabled={deleting} onPress={() => void deleteValidation()}>
                {deleting ? <RotateCw className="size-3.5 animate-spin" /> : null}
                Delete deployment check
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </PageShell>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  items,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  items: Array<{ id: string; label: string }>
}) {
  return (
    <Select selectedKey={value} onSelectionChange={(key) => onChange(String(key))} variant="secondary">
      <Label className="sr-only">{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {items.map((item) => (
            <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
              {item.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}
