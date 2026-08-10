"use client"

import { useMemo, useState } from "react"
import {
  Download,
  FileJson,
  Loader2,
  Upload,
  Workflow,
  Braces,
} from "lucide-react"
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Description,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  Tabs,
  TextArea,
  TextField,
} from "@workspace/ui/components/ui"
import { cn } from "@workspace/ui/lib/utils"
import { notifyPulseToast } from "@/components/pulse/pulse-toast-queue"
import type { Application, Monitor, MonitorStep } from "@/lib/pulse-types"
import type {
  ExportFormat,
  ImportWarning,
  OpenApiOperationPreview,
  PostmanImportMode,
} from "@/lib/pulse-import-export/types"

type DialogTab = "postman" | "openapi" | "bundle" | "export"
type DialogMode = "builder" | "inventory"

const DIALOG_TABS = [
  { key: "postman" as const, label: "Postman", icon: Upload },
  { key: "openapi" as const, label: "OpenAPI", icon: Braces },
  { key: "bundle" as const, label: "Pulse bundle", icon: FileJson },
  { key: "export" as const, label: "Export", icon: Download },
] as const

const POSTMAN_MODE_OPTIONS: { id: PostmanImportMode; label: string }[] = [
  { id: "workflow", label: "One monitor — all requests as steps" },
  { id: "per-request", label: "One monitor per request" },
]

const EXPORT_FORMAT_OPTIONS: { id: ExportFormat; label: string }[] = [
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
]

function ImportSelectField<T extends string>({
  label,
  ariaLabel,
  selectedKey,
  onSelectionChange,
  options,
  className,
}: {
  label: string
  ariaLabel: string
  selectedKey: T
  onSelectionChange: (key: T) => void
  options: ReadonlyArray<{ id: T; label: string }>
  className?: string
}) {
  return (
    <Select
      aria-label={ariaLabel}
      className={cn("w-full", className)}
      variant="secondary"
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        if (key != null) onSelectionChange(String(key) as T)
      }}
    >
      <Label className="text-xs font-medium text-muted">{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

interface MonitorImportExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: DialogMode
  applications?: Application[]
  /** Current monitor draft (builder) or list (inventory export) */
  monitors?: Monitor[]
  applicationId?: string
  onApplyMonitor?: (monitor: Monitor) => void
  onApplySteps?: (steps: MonitorStep[], replace: boolean) => void
  onSaved?: () => void
}

export function MonitorImportExportDialog({
  open,
  onOpenChange,
  mode,
  applications = [],
  monitors = [],
  applicationId: defaultApplicationId = "",
  onApplyMonitor,
  onApplySteps,
  onSaved,
}: MonitorImportExportDialogProps) {
  const [tab, setTab] = useState<DialogTab>("postman")
  const [documentText, setDocumentText] = useState("")
  const [applicationId, setApplicationId] = useState(defaultApplicationId)
  const [postmanMode, setPostmanMode] = useState<PostmanImportMode>("workflow")
  const [replaceSteps, setReplaceSteps] = useState(false)
  const [baseUrl, setBaseUrl] = useState("")
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<ImportWarning[]>([])
  const [previewMonitors, setPreviewMonitors] = useState<Monitor[]>([])
  const [openapiOps, setOpenapiOps] = useState<OpenApiOperationPreview[]>([])
  const [selectedOps, setSelectedOps] = useState<Set<string>>(new Set())

  const exportTargets = useMemo(() => {
    if (mode === "builder" && monitors[0]) return [monitors[0]]
    return monitors
  }, [mode, monitors])

  const applicationOptions = useMemo(
    () => [
      { id: "__none__" as const, label: "No application" },
      ...applications.map((app) => ({ id: app.id, label: app.name })),
    ],
    [applications]
  )

  function resetPreview() {
    setError(null)
    setWarnings([])
    setPreviewMonitors([])
    setOpenapiOps([])
    setSelectedOps(new Set())
  }

  function handleTabChange(key: React.Key | null) {
    if (key == null) return
    setTab(String(key) as DialogTab)
    resetPreview()
    setError(null)
  }

  async function parsePostman() {
    setLoading(true)
    resetPreview()
    try {
      const response = await fetch("/api/monitors/import/postman", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: documentText,
          applicationId: applicationId || undefined,
          mode: mode === "builder" ? "workflow" : postmanMode,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Import failed")
      setPreviewMonitors(payload.monitors ?? [])
      setWarnings(payload.warnings ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed"
      setError(message)
      notifyPulseToast("danger", "Postman import failed", message)
    } finally {
      setLoading(false)
    }
  }

  async function parseOpenApi(previewOnly: boolean) {
    setLoading(true)
    if (previewOnly) resetPreview()
    setError(null)
    try {
      const response = await fetch("/api/monitors/import/openapi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: documentText,
          applicationId: applicationId || undefined,
          baseUrl: baseUrl || undefined,
          operations: previewOnly ? undefined : [...selectedOps],
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Import failed")

      if (previewOnly) {
        setOpenapiOps(payload.operations ?? [])
        setSelectedOps(new Set((payload.operations ?? []).map((op: OpenApiOperationPreview) => op.key)))
        setWarnings(payload.warnings ?? [])
        return
      }

      setPreviewMonitors(payload.monitors ?? [])
      setWarnings(payload.warnings ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed"
      setError(message)
      notifyPulseToast("danger", "OpenAPI import failed", message)
    } finally {
      setLoading(false)
    }
  }

  async function parseBundle() {
    setLoading(true)
    resetPreview()
    try {
      const format: ExportFormat = documentText.trim().startsWith("{") ? "json" : "yaml"
      const response = await fetch("/api/monitors/import/bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document: documentText,
          format,
          applicationId: applicationId || undefined,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Import failed")
      setPreviewMonitors(payload.monitors ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed"
      setError(message)
      notifyPulseToast("danger", "Bundle import failed", message)
    } finally {
      setLoading(false)
    }
  }

  async function saveMonitorsToApi(items: Monitor[]) {
    setLoading(true)
    setError(null)
    let saved = 0
    try {
      for (const monitor of items) {
        const response = await fetch("/api/monitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...monitor,
            applicationId: applicationId || monitor.applicationId,
          }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error ?? `Failed to save "${monitor.name}"`)
        }
        saved++
      }
      onSaved?.()
      onOpenChange(false)
      notifyPulseToast(
        "success",
        saved === 1 ? "Monitor imported" : "Monitors imported",
        `${saved} monitor${saved === 1 ? "" : "s"} added to the inventory.`,
      )
    } catch (err) {
      const message =
        err instanceof Error ?
          `${err.message}${saved ? ` (${saved} monitor(s) saved before failure)` : ""}`
        : "Save failed"
      setError(message)
      notifyPulseToast("danger", "Import save failed", message)
    } finally {
      setLoading(false)
    }
  }

  function applyPreview() {
    if (!previewMonitors.length) return

    if (mode === "builder") {
      const first = previewMonitors[0]!
      if (tab === "postman" && onApplySteps) {
        onApplySteps(first.steps, replaceSteps)
      } else if (onApplyMonitor) {
        onApplyMonitor({
          ...first,
          applicationId: applicationId || first.applicationId,
        })
      }
      onOpenChange(false)
      notifyPulseToast("success", "Import applied", "Monitor configuration loaded into the builder.")
      return
    }

    void saveMonitorsToApi(previewMonitors)
  }

  async function downloadExport() {
    if (!exportTargets.length) {
      const message = "No monitors available to export."
      setError(message)
      notifyPulseToast("warning", "Nothing to export", message)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/monitors/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monitors: exportTargets,
          format: exportFormat,
          download: true,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? "Export failed")
      }
      const blob = await response.blob()
      const disposition = response.headers.get("Content-Disposition") ?? ""
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? `pulse-monitors.${exportFormat === "yaml" ? "yaml" : "json"}`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
      notifyPulseToast(
        "success",
        "Export downloaded",
        `${exportTargets.length} monitor${exportTargets.length === 1 ? "" : "s"} exported as ${filename}.`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed"
      setError(message)
      notifyPulseToast("danger", "Export failed", message)
    } finally {
      setLoading(false)
    }
  }

  function toggleOperation(key: string, checked: boolean) {
    setSelectedOps((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const importStatusBlock = (
    <>
      {error ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {warnings.length > 0 ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Import warnings</Alert.Title>
            <div className="mt-1 space-y-1">
              {warnings.slice(0, 8).map((w, i) => (
                <Alert.Description key={`${w.code}-${i}`}>
                  {w.path ? `${w.path}: ` : ""}
                  {w.message}
                </Alert.Description>
              ))}
            </div>
          </Alert.Content>
        </Alert>
      ) : null}

      {previewMonitors.length > 0 && tab !== "export" ? (
        <Card variant="secondary">
          <Card.Header className="pb-2">
            <Card.Title className="text-xs">
              Preview: {previewMonitors.length} monitor{previewMonitors.length === 1 ? "" : "s"},{" "}
              {previewMonitors.reduce((n, m) => n + m.steps.length, 0)} total steps
            </Card.Title>
          </Card.Header>
          <Card.Content>
            <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted">
              {previewMonitors.map((m) => (
                <li key={m.name + m.steps.length}>
                  <span className="font-medium text-foreground">{m.name}</span> — {m.steps.length} step(s)
                </li>
              ))}
            </ul>
          </Card.Content>
        </Card>
      ) : null}
    </>
  )

  return (
    <Modal isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container size="full" scroll="inside">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="flex items-center gap-2">
                <Workflow className="size-4 text-accent" />
                Import &amp; export monitors
              </Modal.Heading>
              <Description className="text-sm text-muted">
                {mode === "builder"
                  ? "Import Postman workflows into the builder, or export the current monitor for version control."
                  : "Bulk import from Postman, OpenAPI, or Pulse export files; export your monitor inventory."}
              </Description>
            </Modal.Header>

            <Modal.Body className="gap-5">
              {tab !== "export" && applications.length > 0 ? (
                <ImportSelectField
                  label="Application"
                  ariaLabel="Application"
                  selectedKey={applicationId || "__none__"}
                  onSelectionChange={(key) => setApplicationId(key === "__none__" ? "" : key)}
                  options={applicationOptions}
                />
              ) : null}

              <Tabs selectedKey={tab} onSelectionChange={handleTabChange} variant="secondary" className="w-full gap-5">
                <Tabs.ListContainer>
                  <Tabs.List aria-label="Import and export sections" className="w-full">
                    {DIALOG_TABS.map((item) => {
                      const Icon = item.icon
                      return (
                        <Tabs.Tab key={item.key} id={item.key} className="gap-1.5">
                          <Icon className="size-3.5" />
                          {item.label}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                      )
                    })}
                  </Tabs.List>
                </Tabs.ListContainer>

                <Tabs.Panel id="postman" className="flex flex-col gap-4 pt-0">
                  {mode === "inventory" ? (
                    <ImportSelectField
                      label="Import mode"
                      ariaLabel="Postman import mode"
                      selectedKey={postmanMode}
                      onSelectionChange={setPostmanMode}
                      options={POSTMAN_MODE_OPTIONS}
                    />
                  ) : null}
                  {mode === "builder" ? (
                    <div className="flex items-start gap-3 text-sm">
                      <Checkbox isSelected={replaceSteps} onChange={(checked) => setReplaceSteps(!!checked)}>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox>
                      <Description className="text-xs">
                        Replace existing steps (unchecked = append imported steps)
                      </Description>
                    </div>
                  ) : null}
                  <TextField className="w-full" name="postmanDocument">
                    <Label className="text-xs font-medium text-muted">Postman Collection v2.1 JSON</Label>
                    <TextArea
                      variant="secondary"
                      fullWidth
                      className="min-h-40 font-mono text-xs"
                      value={documentText}
                      onChange={(event) => setDocumentText(event.target.value)}
                      placeholder='Paste collection JSON exported from Postman ("Collection v2.1")...'
                    />
                  </TextField>
                  <Button
                    size="sm"
                    onPress={() => void parsePostman()}
                    isDisabled={loading || !documentText.trim()}
                  >
                    {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Parse collection
                  </Button>
                  {importStatusBlock}
                </Tabs.Panel>

                <Tabs.Panel id="openapi" className="flex flex-col gap-4 pt-0">
                  <TextField className="w-full" name="baseUrl" type="url">
                    <Label className="text-xs font-medium text-muted">Base URL override (optional)</Label>
                    <Input
                      variant="secondary"
                      fullWidth
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder="https://api.example.com"
                    />
                  </TextField>
                  <TextField className="w-full" name="openapiDocument">
                    <Label className="text-xs font-medium text-muted">OpenAPI 3.x or Swagger 2.0 JSON</Label>
                    <TextArea
                      variant="secondary"
                      fullWidth
                      className="min-h-32 font-mono text-xs"
                      value={documentText}
                      onChange={(event) => setDocumentText(event.target.value)}
                      placeholder="Paste openapi.json or swagger.json..."
                    />
                  </TextField>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => void parseOpenApi(true)}
                      isDisabled={loading || !documentText.trim()}
                    >
                      List operations
                    </Button>
                    <Button
                      size="sm"
                      onPress={() => void parseOpenApi(false)}
                      isDisabled={loading || !documentText.trim() || selectedOps.size === 0}
                    >
                      Import {selectedOps.size || "…"} operation(s)
                    </Button>
                  </div>
                  {openapiOps.length > 0 ? (
                    <Card variant="secondary" className="max-h-48 overflow-hidden">
                      <Card.Content className="gap-0 divide-y divide-separator p-0">
                        {openapiOps.map((op) => (
                          <label
                            key={op.key}
                            className="flex cursor-pointer items-start gap-3 px-3 py-2 text-xs hover:bg-default"
                          >
                            <Checkbox
                              isSelected={selectedOps.has(op.key)}
                              onChange={(checked) => toggleOperation(op.key, !!checked)}
                            >
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                            </Checkbox>
                            <span className="min-w-0 flex-1">
                              <span className="font-mono font-semibold text-accent">{op.method}</span>{" "}
                              <span className="font-mono">{op.path}</span>
                              {op.summary ? (
                                <Description className="mt-0.5 block text-xs">{op.summary}</Description>
                              ) : null}
                            </span>
                          </label>
                        ))}
                      </Card.Content>
                    </Card>
                  ) : null}
                  {importStatusBlock}
                </Tabs.Panel>

                <Tabs.Panel id="bundle" className="flex flex-col gap-4 pt-0">
                  <TextField className="w-full" name="bundleDocument">
                    <Label className="text-xs font-medium text-muted">Pulse export file (JSON or YAML)</Label>
                    <TextArea
                      variant="secondary"
                      fullWidth
                      className="min-h-40 font-mono text-xs"
                      value={documentText}
                      onChange={(event) => setDocumentText(event.target.value)}
                      placeholder="Paste a pulse-monitors export or single monitor JSON/YAML..."
                    />
                  </TextField>
                  <Button
                    size="sm"
                    onPress={() => void parseBundle()}
                    isDisabled={loading || !documentText.trim()}
                  >
                    {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Parse export
                  </Button>
                  {importStatusBlock}
                </Tabs.Panel>

                <Tabs.Panel id="export" className="flex flex-col gap-4 pt-0">
                  <Description className="text-sm">
                    Export {exportTargets.length} monitor{exportTargets.length === 1 ? "" : "s"} for version control or
                    disaster recovery. Runtime fields (status, last run) are omitted.
                  </Description>
                  <ImportSelectField
                    label="Format"
                    ariaLabel="Export format"
                    className="w-40"
                    selectedKey={exportFormat}
                    onSelectionChange={setExportFormat}
                    options={EXPORT_FORMAT_OPTIONS}
                  />
                  <Button
                    size="sm"
                    className="gap-1.5 self-start"
                    onPress={() => void downloadExport()}
                    isDisabled={loading || !exportTargets.length}
                  >
                    {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    Download export
                  </Button>
                  {error ? (
                    <Alert status="danger">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>{error}</Alert.Description>
                      </Alert.Content>
                    </Alert>
                  ) : null}
                </Tabs.Panel>
              </Tabs>
            </Modal.Body>

            {tab !== "export" ? (
              <Modal.Footer>
                <Button variant="secondary" slot="close" isDisabled={loading}>
                  Cancel
                </Button>
                <Button onPress={applyPreview} isDisabled={loading || !previewMonitors.length}>
                  {mode === "builder" ? "Apply to builder" : `Save ${previewMonitors.length} monitor(s)`}
                </Button>
              </Modal.Footer>
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
