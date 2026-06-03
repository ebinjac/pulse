"use client"

import { useCallback, useEffect, useState } from "react"
import { Clock, Plus, Trash2 } from "lucide-react"
import type { Application, MaintenanceWindow, Monitor } from "@/lib/pulse-types"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { formatDate } from "./console-shared"

export function MaintenanceWindowsPanel({
  applications,
  monitors,
}: {
  applications: Application[]
  monitors: Monitor[]
}) {
  const [windows, setWindows] = useState<MaintenanceWindow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [scopeType, setScopeType] = useState<"global" | "application" | "monitor">("global")
  const [scopeId, setScopeId] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/maintenance-windows?active=true")
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setWindows(data.windows || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load maintenance windows.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function createWindow() {
    if (!endsAt) {
      setError("Ends at is required.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/maintenance-windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType,
          scopeId: scopeType === "global" ? "" : scopeId,
          endsAt: new Date(endsAt).toISOString(),
          reason: reason || "Scheduled maintenance",
          createdBy: "console",
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setEndsAt("")
      setReason("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create maintenance window.")
    } finally {
      setSaving(false)
    }
  }

  async function removeWindow(id: string) {
    try {
      const res = await fetch(`/api/maintenance-windows/${id}`, { method: "DELETE" })
      if (!res.ok && res.status !== 204) throw new Error(await res.text())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete maintenance window.")
    }
  }

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Clock className="size-4 text-primary" />
          Maintenance windows
        </CardTitle>
        <CardDescription>
          Suppress alert delivery for a scope until the window ends. Active windows apply to new failures immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs font-semibold">
            Scope
            <NativeSelect size="sm" value={scopeType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setScopeType(e.target.value as typeof scopeType)}>
              <NativeSelectOption value="global">Global</NativeSelectOption>
              <NativeSelectOption value="application">Application</NativeSelectOption>
              <NativeSelectOption value="monitor">Monitor</NativeSelectOption>
            </NativeSelect>
          </label>
          {scopeType !== "global" ? (
            <label className="space-y-1 text-xs font-semibold">
              {scopeType === "application" ? "Application" : "Monitor"}
              <NativeSelect size="sm" value={scopeId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setScopeId(e.target.value)}>
                <NativeSelectOption value="">Select…</NativeSelectOption>
                {scopeType === "application"
                  ? applications.map((app) => (
                      <NativeSelectOption key={app.id} value={app.id}>{app.name}</NativeSelectOption>
                    ))
                  : monitors.map((mon) => (
                      <NativeSelectOption key={mon.id} value={mon.id}>{mon.name}</NativeSelectOption>
                    ))}
              </NativeSelect>
            </label>
          ) : null}
          <label className="space-y-1 text-xs font-semibold">
            Ends at
            <Input type="datetime-local" className="h-9 text-xs" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Reason
            <Input className="h-9 text-xs" placeholder="Deploy, drill, etc." value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        <Button size="sm" className="gap-1.5" disabled={saving} onClick={() => void createWindow()}>
          <Plus className="size-3.5" />
          Add window
        </Button>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scope</TableHead>
              <TableHead>Ends</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-xs text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : windows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-xs text-muted-foreground">No active maintenance windows.</TableCell>
              </TableRow>
            ) : (
              windows.map((window) => (
                <TableRow key={window.id}>
                  <TableCell className="text-xs font-semibold capitalize">
                    {window.scopeType}
                    {window.scopeId ? ` · ${window.scopeId}` : ""}
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(window.endsAt)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{window.reason || "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => void removeWindow(window.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
