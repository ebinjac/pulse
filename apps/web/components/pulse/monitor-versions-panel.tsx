"use client"

import { useEffect, useState } from "react"
import { History, Loader2, RotateCcw } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { diffMonitors, formatDiffValue } from "@/lib/monitor-diff"
import type { Monitor, MonitorConfigChange, MonitorVersionSummary } from "@/lib/pulse-types"

interface MonitorVersionsPanelProps {
  monitorId: string
  published: Monitor
  draft: Monitor
  onRollbackApplied: (monitor: Monitor) => void
}

export function MonitorVersionsPanel({
  monitorId,
  published,
  draft,
  onRollbackApplied,
}: MonitorVersionsPanelProps) {
  const [versions, setVersions] = useState<MonitorVersionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [diffAgainst, setDiffAgainst] = useState<"published" | "draft">("published")
  const [changes, setChanges] = useState<MonitorConfigChange[]>([])
  const [rollbackNote, setRollbackNote] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function loadVersions() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/monitors/${monitorId}/versions`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Failed to load versions")
      setVersions(payload.versions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load versions")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (monitorId) void loadVersions()
  }, [monitorId])

  async function loadDiff(versionNumber: number) {
    setSelectedVersion(versionNumber)
    setError(null)
    try {
      const response = await fetch(
        `/api/monitors/${monitorId}/versions/${versionNumber}/diff?against=${diffAgainst}`
      )
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Failed to load diff")
      setChanges(payload.changes ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diff")
      setChanges([])
    }
  }

  async function rollback(versionNumber: number) {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/monitors/${monitorId}/versions/${versionNumber}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeNote: rollbackNote || `Rollback to version ${versionNumber}` }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Rollback failed")
      onRollbackApplied(payload.monitor)
      setRollbackNote("")
      await loadVersions()
      setSelectedVersion(null)
      setChanges([])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed")
    } finally {
      setLoading(false)
    }
  }

  const draftVsPublished = diffMonitors(published, draft)

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/40 bg-muted/10 p-4 space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <History className="size-4 text-primary" />
          Draft vs published
        </h3>
        {draftVsPublished.length === 0 ? (
          <p className="text-xs text-muted-foreground">Draft matches the published configuration.</p>
        ) : (
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {draftVsPublished.map((change) => (
              <li key={change.path} className="text-xs rounded border border-border/30 bg-background p-2">
                <span className="font-mono font-semibold text-primary">{change.path}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Version history</h3>
        <Button type="button" size="sm" variant="outline" onClick={() => void loadVersions()} disabled={loading}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading && !versions.length ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2 py-6 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Loading versions...
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="rounded-md border border-border/40 divide-y divide-border/30 max-h-72 overflow-y-auto">
            {versions.map((version) => (
              <button
                key={version.id}
                type="button"
                onClick={() => void loadDiff(version.versionNumber)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/30 ${
                  selectedVersion === version.versionNumber ? "bg-primary/5" : ""
                }`}
              >
                <div className="font-semibold">v{version.versionNumber}</div>
                <div className="text-muted-foreground capitalize">{version.source}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(version.createdAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {selectedVersion ? (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Compare to</label>
                  <select
                    value={diffAgainst}
                    onChange={(e) => {
                      const value = e.target.value as "published" | "draft"
                      setDiffAgainst(value)
                      void loadDiff(selectedVersion)
                    }}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Current draft</option>
                  </select>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-2">
                  {changes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No differences for this comparison.</p>
                  ) : (
                    changes.map((change) => (
                      <div key={`${selectedVersion}-${change.path}`} className="rounded border border-border/30 p-2 text-xs space-y-1">
                        <div className="font-mono font-semibold text-primary">{change.path}</div>
                        <pre className="whitespace-pre-wrap text-rose-600/90 dark:text-rose-300/90 bg-rose-500/5 p-1.5 rounded">
                          {formatDiffValue(change.oldValue)}
                        </pre>
                        <pre className="whitespace-pre-wrap text-emerald-700/90 dark:text-emerald-300/90 bg-emerald-500/5 p-1.5 rounded">
                          {formatDiffValue(change.newValue)}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border/30">
                  <input
                    value={rollbackNote}
                    onChange={(e) => setRollbackNote(e.target.value)}
                    placeholder="Rollback note (optional)"
                    className="h-8 flex-1 min-w-[180px] rounded-md border border-input bg-transparent px-2 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void rollback(selectedVersion)}
                    disabled={loading}
                  >
                    Rollback to v{selectedVersion}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">
                Select a version to view changes and rollback.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
