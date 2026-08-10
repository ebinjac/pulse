"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Editor from "@monaco-editor/react"
import { useTheme } from "next-themes"
import { Braces, ExternalLink, MoreHorizontal, Pencil, Play, Plus, RotateCw, Trash2 } from "lucide-react"
import type { Application, ElfQuery, ElfQueryInput, ElfPassCriteria } from "@/lib/pulse-types"
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
  Select,
  Switch,
  Table,
  TextField,
} from "@workspace/ui/components/ui"
import { cn } from "@workspace/ui/lib/utils"
import { PageShell } from "@/components/pulse/console-shared"
import { notifyPulseToast } from "@/components/pulse/pulse-toast-queue"
import { checkKindLabel } from "./elf-expression-builder"

const DEFAULT_SEARCH_BODY = `{
  "query": {
    "bool": {
      "must": [{ "match_phrase": { "message": "Received event=BatchSummaryRequest" } }],
      "filter": [{
        "range": {
          "timestamp": { "gte": "now-15m/m", "lte": "now-5m/m" }
        }
      }]
    }
  },
  "size": 10
}`

const DEFAULT_PASS_CRITERIA: ElfPassCriteria = {
  type: "max_hits",
  threshold: 0,
}

type ElfQueryDraft = ElfQueryInput & { searchBodyText: string }

function emptyDraft(applicationId?: string): ElfQueryDraft {
  return {
    name: "",
    description: "",
    elfAppId: "",
    indexPathTemplate: "",
    searchBody: {},
    searchBodyText: DEFAULT_SEARCH_BODY,
    gateMode: "advisory",
    passCriteria: DEFAULT_PASS_CRITERIA,
    applicationId: applicationId || "",
    isActive: true,
  }
}

function draftFromQuery(query: ElfQuery): ElfQueryDraft {
  const body =
    typeof query.searchBody === "string"
      ? query.searchBody
      : JSON.stringify(query.searchBody, null, 2)
  return {
    name: query.name,
    description: query.description || "",
    elfAppId: query.elfAppId || "",
    indexPathTemplate: query.indexPathTemplate || "",
    searchBody: typeof query.searchBody === "object" ? query.searchBody : {},
    searchBodyText: body,
    gateMode: query.gateMode,
    passCriteria: query.passCriteria || DEFAULT_PASS_CRITERIA,
    applicationId: query.applicationId || "",
    isActive: query.isActive,
  }
}

export function ElfQueriesView({
  applications,
  queries,
  onSaveQuery,
  onDeleteQuery,
  onTestQuery,
}: {
  applications: Application[]
  queries: ElfQuery[]
  onSaveQuery: (queryId: string | null, input: ElfQueryInput) => Promise<ElfQuery | null>
  onDeleteQuery: (queryId: string) => Promise<void>
  onTestQuery: (queryId: string, input?: { elfAppId?: string; applicationId?: string }) => Promise<{ ok: boolean }>
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [editingQuery, setEditingQuery] = useState<ElfQuery | null>(null)
  const [draft, setDraft] = useState<ElfQueryDraft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ElfQuery | null>(null)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const editorTheme = resolvedTheme === "light" ? "light" : "vs-dark"

  const applicationMap = useMemo(() => new Map(applications.map((app) => [app.id, app])), [applications])

  function openCreate() {
    setEditingQuery(null)
    setDraft(emptyDraft(applications[0]?.id))
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(query: ElfQuery) {
    setEditingQuery(query)
    setDraft(draftFromQuery(query))
    setFormError(null)
    setFormOpen(true)
  }

  async function saveQuery() {
    if (!draft.name.trim()) {
      setFormError("Name is required")
      notifyPulseToast("warning", "Name is required", "Give this ELF query a name before saving.")
      return
    }
    let searchBody: Record<string, unknown>
    try {
      searchBody = JSON.parse(draft.searchBodyText) as Record<string, unknown>
    } catch {
      setFormError("Search body must be valid JSON")
      notifyPulseToast("warning", "Invalid search body", "Search body must be valid JSON.")
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const input: ElfQueryInput = {
        name: draft.name.trim(),
        description: draft.description?.trim(),
        elfAppId: draft.elfAppId?.trim(),
        indexPathTemplate: draft.indexPathTemplate?.trim(),
        searchBody,
        gateMode: draft.gateMode,
        passCriteria: draft.passCriteria,
        applicationId: draft.applicationId || undefined,
        isActive: draft.isActive,
      }
      await onSaveQuery(editingQuery?.id || null, input)
      setFormOpen(false)
      setEditingQuery(null)
      notifyPulseToast(
        "success",
        editingQuery ? "ELF query updated" : "ELF query created",
        `${draft.name.trim()} saved successfully.`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save ELF query."
      setFormError(message)
      notifyPulseToast("danger", "Failed to save ELF query", message)
    } finally {
      setSaving(false)
    }
  }

  async function testQuery(query: ElfQuery) {
    setTestingId(query.id)
    try {
      const app = query.applicationId ? applicationMap.get(query.applicationId) : undefined
      const result = await onTestQuery(query.id, {
        elfAppId: query.elfAppId || app?.elfAppId,
        applicationId: query.applicationId,
      })
      notifyPulseToast(
        result.ok ? "success" : "danger",
        result.ok ? "ELF query test passed" : "ELF query test failed",
        query.name,
      )
    } catch (err) {
      notifyPulseToast(
        "danger",
        "Failed to test ELF query",
        err instanceof Error ? err.message : "Please try again.",
      )
    } finally {
      setTestingId(null)
    }
  }

  async function deleteQuery() {
    if (!confirmDelete || deleting) return
    const queryName = confirmDelete.name
    setDeleting(true)
    try {
      await onDeleteQuery(confirmDelete.id)
      setConfirmDelete(null)
      notifyPulseToast("success", "ELF query deleted", `${queryName} was removed from the registry.`)
    } catch (err) {
      notifyPulseToast(
        "danger",
        "Failed to delete ELF query",
        err instanceof Error ? err.message : "Please try again.",
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageShell
      eyebrow="Log checks"
      title="ELF queries"
      description="Reusable OpenSearch queries against the company ELF proxy for deployment log validation."
      action={
        <Button onPress={openCreate} className="h-9 gap-2">
          <Plus className="size-4" />
          New query
        </Button>
      }
    >
      <Card>
        <Card.Content className="p-0">
          {queries.length === 0 ? (
            <EmptyState className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center">
              <Braces className="size-8 text-muted" />
              <p className="text-sm font-semibold">No ELF queries yet</p>
              <Description>Create a query template to search logs via the ELF proxy during deployment checks.</Description>
            </EmptyState>
          ) : (
            <Table aria-label="ELF queries">
              <Table.ScrollContainer>
                <Table.Content className="min-w-[720px]">
                  <Table.Header>
                    <Table.Column isRowHeader>Name</Table.Column>
                    <Table.Column>Gate</Table.Column>
                    <Table.Column>Check</Table.Column>
                    <Table.Column>Last probe</Table.Column>
                    <Table.Column>Index pattern</Table.Column>
                    <Table.Column>Application</Table.Column>
                    <Table.Column>Status</Table.Column>
                    <Table.Column className="text-end">Actions</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {queries.map((query) => {
                      const app = query.applicationId ? applicationMap.get(query.applicationId) : undefined
                      return (
                        <Table.Row key={query.id}>
                          <Table.Cell>
                            <div className="font-semibold">{query.name}</div>
                            {query.description ? <Description className="text-xs">{query.description}</Description> : null}
                          </Table.Cell>
                          <Table.Cell>
                            <Chip variant="secondary" className="capitalize">
                              <Chip.Label>{query.gateMode}</Chip.Label>
                            </Chip>
                          </Table.Cell>
                          <Table.Cell>
                            {query.checkKind && query.checkKind !== "raw" ? (
                              <Chip size="sm" variant="secondary">
                                <Chip.Label>{checkKindLabel(query.checkKind, query.checkConfig?.rules?.length)}</Chip.Label>
                              </Chip>
                            ) : (
                              <span className="text-xs text-muted-foreground">Raw</span>
                            )}
                          </Table.Cell>
                          <Table.Cell className="text-xs text-muted-foreground">
                            {query.lastProbeSummary?.hitCount != null ? (
                              <div>
                                <div>{query.lastProbeSummary.hitCount} hits</div>
                                {query.lastProbeSummary.gte ? (
                                  <div className="font-mono text-[10px]">{query.lastProbeSummary.gte}</div>
                                ) : null}
                              </div>
                            ) : (
                              "—"
                            )}
                          </Table.Cell>
                          <Table.Cell className="font-mono text-xs">
                            {query.indexPathTemplate || app?.indexPathTemplate || "default"}
                          </Table.Cell>
                          <Table.Cell>{app?.name || "—"}</Table.Cell>
                          <Table.Cell>{query.isActive ? "Active" : "Disabled"}</Table.Cell>
                          <Table.Cell className="text-end">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-8 gap-1"
                                onPress={() => router.push(`/elf-queries/${query.id}`)}
                              >
                                <ExternalLink className="size-3.5" />
                                Open
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-8"
                                onPress={() => testQuery(query)}
                                isDisabled={testingId === query.id}
                              >
                                {testingId === query.id ? <RotateCw className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                                Test
                              </Button>
                              <Dropdown>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  isIconOnly
                                  className="h-8 w-8 min-w-8"
                                  aria-label="Query actions"
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                                <Dropdown.Popover>
                                  <Dropdown.Menu onAction={(key) => {
                                    if (key === "edit") openEdit(query)
                                    if (key === "delete") setConfirmDelete(query)
                                  }}>
                                    <Dropdown.Item id="edit" textValue="Edit">
                                      <Pencil className="size-4" />
                                      <Label>Edit</Label>
                                    </Dropdown.Item>
                                    <Dropdown.Item id="delete" textValue="Delete" variant="danger">
                                      <Trash2 className="size-4" />
                                      <Label>Delete</Label>
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

      <Modal isOpen={formOpen} onOpenChange={setFormOpen}>
        <Modal.Backdrop>
          <Modal.Container size="full" scroll="inside" className="w-full">
            <Modal.Dialog className="w-full">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>{editingQuery ? "Edit ELF query" : "Create ELF query"}</Modal.Heading>
                <Description>OpenSearch POST body and pass criteria for log validation.</Description>
              </Modal.Header>
              <Modal.Body className="space-y-4">
                <TextField className="w-full" isRequired>
                  <Label>Name</Label>
                  <Input variant="secondary" fullWidth value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </TextField>
                <TextField className="w-full">
                  <Label>Description</Label>
                  <Input variant="secondary" fullWidth value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </TextField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    selectedKey={draft.applicationId || ""}
                    onSelectionChange={(key) => setDraft({ ...draft, applicationId: String(key) })}
                  >
                    <Label>Application (optional)</Label>
                    <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id="" textValue="None">None<ListBox.ItemIndicator /></ListBox.Item>
                        {applications.map((app) => (
                          <ListBox.Item key={app.id} id={app.id} textValue={app.name}>
                            {app.name}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  <TextField className="w-full sm:col-span-2">
                    <Label>Index pattern override</Label>
                    <Input variant="secondary" fullWidth placeholder="e.g. app-logs-*" value={draft.indexPathTemplate || ""} onChange={(e) => setDraft({ ...draft, indexPathTemplate: e.target.value })} />
                    <Description className="text-xs">Uses application or global default when empty.</Description>
                  </TextField>
                  <TextField className="w-full">
                    <Label>ELF app ID (optional)</Label>
                    <Input variant="secondary" fullWidth placeholder="Only for {{elfAppId}} patterns" value={draft.elfAppId || ""} onChange={(e) => setDraft({ ...draft, elfAppId: e.target.value })} />
                  </TextField>
                </div>
                <Select selectedKey={draft.gateMode} onSelectionChange={(key) => setDraft({ ...draft, gateMode: String(key) as "blocking" | "advisory" })}>
                  <Label>Gate mode</Label>
                  <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="advisory" textValue="Advisory">Advisory<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item id="blocking" textValue="Blocking">Blocking<ListBox.ItemIndicator /></ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
                <div className="w-full space-y-1.5">
                  <Label className="text-xs font-semibold">Search body (JSON)</Label>
                  <div
                    className={cn(
                      "h-[min(50vh,420px)] w-full overflow-hidden rounded-md border border-border/50",
                      "",
                    )}
                  >
                    <Editor
                      height="100%"
                      language="json"
                      theme={editorTheme}
                      value={draft.searchBodyText}
                      onChange={(value) => setDraft({ ...draft, searchBodyText: value ?? "" })}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        fontFamily: "var(--font-mono), monospace",
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        automaticLayout: true,
                        tabSize: 2,
                        formatOnPaste: true,
                        padding: { top: 12, bottom: 12 },
                      }}
                    />
                  </div>
                  <Description className="text-xs">OpenSearch POST body sent to the ELF proxy _search endpoint.</Description>
                </div>
                <div className="flex items-center gap-2">
                  <Switch isSelected={draft.isActive !== false} onChange={(checked) => setDraft({ ...draft, isActive: checked })}>
                    Active
                  </Switch>
                </div>
                {formError ? <p className="text-sm text-danger">{formError}</p> : null}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={() => setFormOpen(false)}>Cancel</Button>
                <Button onPress={saveQuery} isDisabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <AlertDialog.Backdrop
        isOpen={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setConfirmDelete(null)
        }}
      >
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete ELF query?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="text-sm text-muted">
              {confirmDelete ? `"${confirmDelete.name}" will be removed from the library.` : ""}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" slot="close" isDisabled={deleting}>Cancel</Button>
              <Button variant="danger" isDisabled={deleting} onPress={() => void deleteQuery()}>
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </PageShell>
  )
}
