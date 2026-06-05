"use client"

import { useCallback, useEffect, useState } from "react"
import { Clock, Plus, Trash2 } from "lucide-react"
import type { Application, MaintenanceWindow, Monitor } from "@/lib/pulse-types"
import { Button, Card, Label, ListBox, Select, Table, TextField, Input, Calendar, DateField, DatePicker, TimeField, type TimeValue } from "@heroui/react"
import { formatDate } from "./console-shared"
import { cn } from "@workspace/ui/lib/utils"
import { parseAbsoluteToLocal, getLocalTimeZone } from "@internationalized/date"
import type { DateValue } from "@internationalized/date"

const SCOPE_TYPE_OPTIONS = [
  { id: "global", label: "Global" },
  { id: "application", label: "Application" },
  { id: "monitor", label: "Monitor" },
] as const

function MaintenanceSelect({
  label,
  selectedKey,
  onSelectionChange,
  options,
  className,
  description,
}: {
  label: string
  selectedKey: string
  onSelectionChange: (key: string) => void
  options: { id: string; label: string }[]
  className?: string
  description?: string
}) {
  return (
    <Select
      className={cn("w-full min-w-0 flex flex-col gap-1.5", className)}
      variant="secondary"
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        if (key != null) onSelectionChange(String(key))
      }}
    >
      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</Label>
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
      {description && <p className="text-[10px] text-muted-foreground mt-1 leading-normal">{description}</p>}
    </Select>
  )
}

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
  const [endsAtValue, setEndsAtValue] = useState<DateValue | null>(null)
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
    if (!endsAtValue) {
      setError("Ends at is required.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const endsAtIso = (endsAtValue as any).toDate().toISOString()
      const res = await fetch("/api/maintenance-windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType,
          scopeId: scopeType === "global" ? "" : scopeId,
          endsAt: endsAtIso,
          reason: reason || "Scheduled maintenance",
          createdBy: "console",
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setEndsAtValue(null)
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

  const scopeIdOptions =
    scopeType === "application"
      ? applications.map((app) => ({ id: app.id, label: app.name }))
      : monitors.map((mon) => ({ id: mon.id, label: mon.name }))

  return (
    <Card className="w-full border-border/40 rounded-2xl">
      <Card.Header className="border-b pb-4">
        <Card.Title className="flex items-center gap-2 text-base font-semibold">
          <Clock className="size-4 text-primary" />
          Maintenance windows
        </Card.Title>
        <Card.Description>
          Suppress alert delivery for a scope until the window ends. Active windows apply to new failures immediately.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-6 pt-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <section className="space-y-5 rounded-2xl border border-border/30 bg-background p-6 shadow-xs">
          <div className="grid gap-6 md:grid-cols-2 items-start">
            <MaintenanceSelect
              label="Scope"
              selectedKey={scopeType}
              onSelectionChange={(val) => {
                setScopeType(val as typeof scopeType)
                setScopeId("")
              }}
              options={[...SCOPE_TYPE_OPTIONS]}
              description="Suppress alerts globally, for a specific application, or a single monitor."
            />
            {scopeType !== "global" ? (
              <MaintenanceSelect
                label={scopeType === "application" ? "Application" : "Monitor"}
                selectedKey={scopeId || "none"}
                onSelectionChange={(val) => setScopeId(val === "none" ? "" : val)}
                options={[{ id: "none", label: "Select…" }, ...scopeIdOptions]}
                description={`Select the target ${scopeType} check for the maintenance window.`}
              />
            ) : (
              <TextField className="w-full min-w-0 flex flex-col gap-1.5 opacity-60 select-none pointer-events-none" isDisabled>
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Scope target</Label>
                <Input variant="secondary" fullWidth className="h-10 text-sm" placeholder="Not applicable for global scope" />
                <p className="text-[10px] text-muted-foreground mt-1 leading-normal">Global scope suppresses all alerts across the entire platform.</p>
              </TextField>
            )}
            <DatePicker
              className="w-full min-w-0 flex flex-col gap-1.5"
              granularity="minute"
              value={endsAtValue}
              onChange={setEndsAtValue}
            >
              {({ state }: { state: any }) => (
                <>
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ends at</Label>
                  <DateField.Group variant="secondary" className="h-10">
                    <DateField.Input>
                      {(segment) => <DateField.Segment segment={segment} />}
                    </DateField.Input>
                    <DateField.Suffix>
                      <DatePicker.Trigger>
                        <DatePicker.TriggerIndicator />
                      </DatePicker.Trigger>
                    </DateField.Suffix>
                  </DateField.Group>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-normal">Specify the date and time when the maintenance window automatically expires.</p>
                  <DatePicker.Popover className="flex flex-col gap-3">
                    <Calendar aria-label="Maintenance end date">
                      <Calendar.Header>
                        <Calendar.YearPickerTrigger>
                          <Calendar.YearPickerTriggerHeading />
                          <Calendar.YearPickerTriggerIndicator />
                        </Calendar.YearPickerTrigger>
                        <Calendar.NavButton slot="previous" />
                        <Calendar.NavButton slot="next" />
                      </Calendar.Header>
                      <Calendar.Grid>
                        <Calendar.GridHeader>
                          {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                        </Calendar.GridHeader>
                        <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
                      </Calendar.Grid>
                      <Calendar.YearPickerGrid>
                        <Calendar.YearPickerGridBody>
                          {({year}) => <Calendar.YearPickerCell year={year} />}
                        </Calendar.YearPickerGridBody>
                      </Calendar.YearPickerGrid>
                    </Calendar>
                    <div className="flex flex-col gap-1.5 border-t border-border/20 pt-3 w-full">
                      <Label className="text-xs font-semibold text-muted-foreground">Time</Label>
                      <TimeField
                        className="w-full animate-in fade-in duration-200"
                        aria-label="Time"
                        granularity="minute"
                        value={state.timeValue}
                        onChange={(v) => state.setTimeValue(v as TimeValue)}
                      >
                        <TimeField.Group variant="secondary" className="w-full h-10">
                          <TimeField.Input className="w-full">
                            {(segment) => <TimeField.Segment segment={segment} />}
                          </TimeField.Input>
                        </TimeField.Group>
                      </TimeField>
                    </div>
                  </DatePicker.Popover>
                </>
              )}
            </DatePicker>
            <TextField className="w-full min-w-0 flex flex-col gap-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reason</Label>
              <Input variant="secondary" fullWidth className="h-10 text-sm" placeholder="Deploy, DB migration, drill, etc." value={reason} onChange={(e) => setReason(e.target.value)} />
              <p className="text-[10px] text-muted-foreground mt-1 leading-normal">Describe the purpose of the blackout window for audit logs and transparency.</p>
            </TextField>
          </div>
          <div className="flex justify-end pt-2">
            <Button size="sm" className="gap-1.5 rounded-xl h-10 px-4 cursor-pointer" isDisabled={saving} onPress={() => void createWindow()}>
              <Plus className="size-3.5" />
              Add window
            </Button>
          </div>
        </section>

        <div className="rounded-xl border border-border/40 overflow-hidden bg-background">
          <Table aria-label="Maintenance windows">
            <Table.ScrollContainer>
              <Table.Content className="min-w-[520px]">
                <Table.Header>
                  <Table.Column isRowHeader className="px-4 font-semibold text-xs">
                    Scope
                  </Table.Column>
                  <Table.Column className="px-4 font-semibold text-xs">Ends</Table.Column>
                  <Table.Column className="px-4 font-semibold text-xs">Reason</Table.Column>
                  <Table.Column className="w-16 px-4 font-semibold text-xs text-end" />
                </Table.Header>
                <Table.Body
                  renderEmptyState={() => (
                    <div className="flex h-24 w-full items-center justify-center text-xs text-muted-foreground">
                      {loading ? "Loading…" : "No active maintenance windows."}
                    </div>
                  )}
                >
                  {windows.map((window) => (
                    <Table.Row key={window.id} id={window.id} className="hover:bg-default/40">
                      <Table.Cell className="px-4 py-3 text-xs font-semibold capitalize text-foreground">
                        {window.scopeType}
                        {window.scopeId ? ` · ${window.scopeId}` : ""}
                      </Table.Cell>
                      <Table.Cell className="px-4 py-3 text-xs text-foreground">{formatDate(window.endsAt)}</Table.Cell>
                      <Table.Cell className="px-4 py-3 text-xs text-muted-foreground">{window.reason || "—"}</Table.Cell>
                      <Table.Cell className="px-4 py-3 text-end">
                        <Button variant="ghost" isIconOnly size="sm" className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer rounded-lg h-8 w-8" onPress={() => void removeWindow(window.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </div>
      </Card.Content>
    </Card>
  )
}
