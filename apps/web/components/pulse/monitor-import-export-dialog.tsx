"use client"

import { useMemo, useState } from "react"
import {
  Download,
  FileJson,
  Loader2,
  Upload,
  Workflow,
  Braces,
  AlertTriangle,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"
import type { Application, Monitor, MonitorStep } from "@/lib/pulse-types"
import type {
  ExportFormat,
  ImportWarning,
  OpenApiOperationPreview,
  PostmanImportMode,
} from "@/lib/pulse-import-export/types"

type DialogTab = "postman" | "openapi" | "bundle" | "export"
type DialogMode = "builder" | "inventory"

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

  function resetPreview() {
    setError(null)
    setWarnings([])
    setPreviewMonitors([])
    setOpenapiOps([])
    setSelectedOps(new Set())
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
      setError(err instanceof Error ? err.message : "Import failed")
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
      setError(err instanceof Error ? err.message : "Import failed")
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
      setError(err instanceof Error ? err.message : "Import failed")
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
    } catch (err) {
      setError(
        err instanceof Error ?
          `${err.message}${saved ? ` (${saved} monitor(s) saved before failure)` : ""}`
        : "Save failed"
      )
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
      return
    }

    void saveMonitorsToApi(previewMonitors)
  }

  async function downloadExport() {
    if (!exportTargets.length) {
      setError("No monitors available to export.")
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setLoading(false)
    }
  }

  function toggleOperation(key: string) {
    setSelectedOps((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogTitle className="font-heading flex items-center gap-2">
            <Workflow className="size-4 text-primary" />
            Import &amp; export monitors
          </DialogTitle>
          <DialogDescription>
            {mode === "builder"
              ? "Import Postman workflows into the builder, or export the current monitor for version control."
              : "Bulk import from Postman, OpenAPI, or Pulse export files; export your monitor inventory."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 px-6 pt-3 border-b border-border/30">
          {(
            [
              { key: "postman" as const, label: "Postman", icon: Upload },
              { key: "openapi" as const, label: "OpenAPI", icon: Braces },
              { key: "bundle" as const, label: "Pulse bundle", icon: FileJson },
              { key: "export" as const, label: "Export", icon: Download },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTab(item.key)
                resetPreview()
                setError(null)
              }}
              className={cn(
                "px-3 py-2 text-xs font-semibold rounded-t-md flex items-center gap-1.5 -mb-px border-b-2",
                tab === item.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="size-3.5" />
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {tab !== "export" && applications.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Application</label>
              <Select
                value={applicationId || "__none__"}
                onValueChange={(v) => setApplicationId(!v || v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Optional application" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No application</SelectItem>
                  {applications.map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {app.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {tab === "postman" && (
            <>
              {mode === "inventory" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Import mode</label>
                  <Select
                    value={postmanMode}
                    onValueChange={(v) => v && setPostmanMode(v as PostmanImportMode)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="workflow">One monitor — all requests as steps</SelectItem>
                      <SelectItem value="per-request">One monitor per request</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {mode === "builder" && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={replaceSteps}
                    onChange={(e) => setReplaceSteps(e.target.checked)}
                    className="rounded border-input"
                  />
                  Replace existing steps (unchecked = append imported steps)
                </label>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Postman Collection v2.1 JSON</label>
                <textarea
                  value={documentText}
                  onChange={(e) => setDocumentText(e.target.value)}
                  placeholder='Paste collection JSON exported from Postman ("Collection v2.1")...'
                  className="min-h-40 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono"
                />
              </div>
              <Button type="button" size="sm" onClick={() => void parsePostman()} disabled={loading || !documentText.trim()}>
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Parse collection
              </Button>
            </>
          )}

          {tab === "openapi" && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Base URL override (optional)</label>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">OpenAPI 3.x or Swagger 2.0 JSON</label>
                <textarea
                  value={documentText}
                  onChange={(e) => setDocumentText(e.target.value)}
                  placeholder="Paste openapi.json or swagger.json..."
                  className="min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void parseOpenApi(true)} disabled={loading || !documentText.trim()}>
                  List operations
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void parseOpenApi(false)}
                  disabled={loading || !documentText.trim() || selectedOps.size === 0}
                >
                  Import {selectedOps.size || "…"} operation(s)
                </Button>
              </div>
              {openapiOps.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-md border border-border/40 divide-y divide-border/30">
                  {openapiOps.map((op) => (
                    <label key={op.key} className="flex items-start gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={selectedOps.has(op.key)}
                        onChange={() => toggleOperation(op.key)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-mono font-semibold text-primary">{op.method}</span>{" "}
                        <span className="font-mono">{op.path}</span>
                        {op.summary ? <span className="block text-muted-foreground mt-0.5">{op.summary}</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "bundle" && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Pulse export file (JSON or YAML)</label>
                <textarea
                  value={documentText}
                  onChange={(e) => setDocumentText(e.target.value)}
                  placeholder="Paste a pulse-monitors export or single monitor JSON/YAML..."
                  className="min-h-40 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono"
                />
              </div>
              <Button type="button" size="sm" onClick={() => void parseBundle()} disabled={loading || !documentText.trim()}>
                Parse export
              </Button>
            </>
          )}

          {tab === "export" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Export {exportTargets.length} monitor{exportTargets.length === 1 ? "" : "s"} for version control or disaster recovery.
                Runtime fields (status, last run) are omitted.
              </p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Format</label>
                <Select
                  value={exportFormat}
                  onValueChange={(v) => v && setExportFormat(v as ExportFormat)}
                >
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="yaml">YAML</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" size="sm" onClick={() => void downloadExport()} disabled={loading || !exportTargets.length} className="gap-1.5">
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                Download export
              </Button>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300 space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <AlertTriangle className="size-3.5" />
                Import warnings
              </div>
              {warnings.slice(0, 8).map((w, i) => (
                <p key={`${w.code}-${i}`}>
                  {w.path ? `${w.path}: ` : ""}
                  {w.message}
                </p>
              ))}
            </div>
          )}

          {previewMonitors.length > 0 && tab !== "export" && (
            <div className="rounded-md border border-border/40 bg-muted/10 p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">
                Preview: {previewMonitors.length} monitor{previewMonitors.length === 1 ? "" : "s"},{" "}
                {previewMonitors.reduce((n, m) => n + m.steps.length, 0)} total steps
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                {previewMonitors.map((m) => (
                  <li key={m.name + m.steps.length}>
                    <span className="font-medium text-foreground">{m.name}</span> — {m.steps.length} step(s)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {tab !== "export" && (
          <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={applyPreview}
              disabled={loading || !previewMonitors.length}
            >
              {mode === "builder" ? "Apply to builder" : `Save ${previewMonitors.length} monitor(s)`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
