"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, Bell, CheckCircle2, ChevronRight, ExternalLink, Mail, TerminalSquare, XCircle, Sparkles, Loader2, Copy, Check } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@workspace/ui/lib/utils"
import type { AlertEvent, Monitor, MonitorRun } from "@/lib/pulse-types"
import {
  Alert,
  Button,
  Card,
  Chip,
  Description,
  EmptyState,
  Input,
  Label,
  ListBox,
  SearchField,
  Select,
  TextField,
} from "@workspace/ui/components/ui"
import { AlertStatusPill, channelIcon, DeliveryStatusPill, formatDate, PageShell } from "../layout"
import { RunTimeline } from "./run-views"

export type AlertStatusFilter = "all" | "open" | "acknowledged" | "resolved" | "suppressed"
export type AlertDeliveryFilter = "all" | "sent" | "failed" | "skipped" | "suppressed"

const STATUS_OPTIONS = [
  { id: "all", label: "All states" },
  { id: "open", label: "Open" },
  { id: "acknowledged", label: "Acknowledged" },
  { id: "resolved", label: "Resolved" },
  { id: "suppressed", label: "Suppressed" },
] as const

const CHANNEL_OPTIONS = [
  { id: "all", label: "All channels" },
  { id: "email", label: "Email" },
  { id: "slack", label: "Slack" },
] as const

const DELIVERY_OPTIONS = [
  { id: "all", label: "All delivery" },
  { id: "sent", label: "Sent" },
  { id: "failed", label: "Failed" },
  { id: "skipped", label: "Skipped" },
  { id: "suppressed", label: "Suppressed" },
] as const

const STAT_ICON_TONE = {
  default: "bg-default text-default-foreground",
  warning: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
} as const

function AlertFieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{children}</p>
}

function AlertDetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-default/40 px-4 py-3.5">
      <Description className="text-xs leading-4">{label}</Description>
      <p className="mt-2 break-words text-sm font-medium leading-5 text-foreground">{value}</p>
    </div>
  )
}

function AlertSidebarSection({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof Bell
  children: React.ReactNode
}) {
  return (
    <Card >
      <Card.Header className="gap-1.5">
        <Card.Title className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-accent" aria-hidden />
          {title}
        </Card.Title>
      </Card.Header>
      <Card.Content className="gap-3">{children}</Card.Content>
    </Card>
  )
}

function AlertStatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default",
}: {
  label: string
  value: string
  detail: string
  icon: typeof Bell
  tone?: keyof typeof STAT_ICON_TONE
}) {
  return (
    <Card >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="font-heading text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <Card.Description>{detail}</Card.Description>
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", STAT_ICON_TONE[tone])}>
          <Icon className="size-4" aria-hidden />
        </div>
      </div>
    </Card>
  )
}

function AlertEventCard({
  alert,
  monitor,
  run,
}: {
  alert: AlertEvent
  monitor?: Monitor
  run?: MonitorRun
}) {
  const router = useRouter()
  const latestDelivery = alert.deliveries?.[0]
  const failureText = run?.failureReason || alert.description || "Monitor run did not complete successfully."

  return (
    <Card
      className="gap-0 overflow-hidden p-0 border border-border/40 hover:border-border/85 transition-all shadow-xs hover:shadow-sm"
    >
      <Card.Header className="flex-col gap-3.5 p-4 sm:flex-row sm:items-start sm:justify-between w-full">
        <div className="min-w-0 flex-1 space-y-2">
          <Card.Title className="text-sm font-bold text-foreground">
            <Link href={`/alerts/${alert.id}`} className="hover:text-primary transition-colors">
              {alert.title}
            </Link>
          </Card.Title>
          <div className="line-clamp-2 text-xs text-muted-foreground leading-relaxed font-mono bg-muted/20 border border-border/20 px-3 py-2 rounded-xl w-fit max-w-full select-all" title={failureText}>
            {failureText}
          </div>
          <div className="flex flex-wrap gap-2 pt-0.5">
            <span className="font-mono text-[9px] font-bold tracking-wider uppercase bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-md">
              {alert.id}
            </span>
            {alert.failureCategory ? (
              <span className="text-[9px] font-bold uppercase tracking-wider bg-warning/10 border border-warning/20 text-warning px-2 py-0.5 rounded-md">
                {alert.failureCategory}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2.5 sm:items-end shrink-0">
          <AlertStatusPill status={alert.status} />
          <Description className="text-[11px] text-muted-foreground/80 font-semibold">
            {alert.resolvedAt ? `Resolved ${formatDate(alert.resolvedAt)}` : `First seen ${formatDate(alert.firstTriggeredAt)}`}
          </Description>
        </div>
      </Card.Header>

      <Card.Content className="grid gap-5 p-4 border-t border-border/10 md:grid-cols-3">
        <div className="space-y-1">
          <AlertFieldLabel>Monitor</AlertFieldLabel>
          <div className="flex flex-col gap-0.5 mt-1">
            {monitor ? (
              <Link href={`/monitors/${monitor.id}/runs`} className="text-sm font-bold text-foreground hover:text-primary transition-colors hover:underline">
                {monitor.name}
              </Link>
            ) : (
              <p className="font-mono text-xs text-muted-foreground">{alert.monitorId}</p>
            )}
            <span className="text-[11px] text-muted-foreground font-semibold">
              {run ? `${run.status} run · ${run.durationMs}ms` : "Run not loaded"}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <AlertFieldLabel>Delivery</AlertFieldLabel>
          <div className="flex flex-wrap gap-2 mt-1">
            {(alert.deliveries || []).slice(0, 3).map((delivery, index) => {
              const Icon = channelIcon(delivery.channel)
              return (
                <div
                  key={`${delivery.channel}-${index}`}
                  className="flex items-center gap-1.5 rounded-lg border border-border/30 bg-muted/20 px-2.5 py-1"
                >
                  <Icon className="size-3 text-muted-foreground" aria-hidden />
                  <span className="text-[11px] font-bold capitalize text-foreground">{delivery.channel}</span>
                  <DeliveryStatusPill status={delivery.status} />
                </div>
              )
            })}
            {!latestDelivery ? <span className="text-[11px] text-muted-foreground font-semibold">No attempts</span> : null}
          </div>
        </div>

        <div className="space-y-1">
          <AlertFieldLabel>Last triggered</AlertFieldLabel>
          <div className="flex flex-col gap-0.5 mt-1">
            <p className="text-sm font-bold text-foreground">{formatDate(alert.lastTriggeredAt)}</p>
            <span className="text-[11px] text-muted-foreground font-semibold">
              Last delivery {alert.lastDeliveredAt ? formatDate(alert.lastDeliveredAt) : "not sent"}
            </span>
          </div>
        </div>
      </Card.Content>

      <Card.Footer className="justify-end gap-2.5 border-t border-border/10 bg-muted/5 p-3 px-4">
        {alert.runId ? (
          <Button variant="secondary" size="sm" className="gap-1 h-8 px-3 rounded-lg text-xs font-semibold" onPress={() => router.push(`/runs/${alert.runId}`)}>
            Run <ExternalLink className="size-3" />
          </Button>
        ) : null}
        <Button size="sm" className="gap-1 h-8 px-3 rounded-lg text-xs font-semibold" onPress={() => router.push(`/alerts/${alert.id}`)}>
          Detail <ChevronRight className="size-3" />
        </Button>
      </Card.Footer>
    </Card>
  )
}

function AlertFilterSelect<T extends string>({
  ariaLabel,
  selectedKey,
  onSelectionChange,
  options,
}: {
  ariaLabel: string
  selectedKey: T
  onSelectionChange: (key: T) => void
  options: ReadonlyArray<{ id: T; label: string }>
}) {
  return (
    <Select
      aria-label={ariaLabel}
      className="w-full min-w-0 [&_[data-slot=trigger]]:h-9"
      variant="secondary"
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        if (key != null) onSelectionChange(String(key) as T)
      }}
    >
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

export function AlertsHistory({
  alerts,
  monitors,
  runs,
}: {
  alerts: AlertEvent[]
  monitors: Monitor[]
  runs: MonitorRun[]
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>("all")
  const [channelFilter, setChannelFilter] = useState<"all" | "email" | "slack">("all")
  const [deliveryFilter, setDeliveryFilter] = useState<AlertDeliveryFilter>("all")

  const monitorById = useMemo(() => new Map(monitors.map((monitor) => [monitor.id, monitor])), [monitors])
  const runById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs])

  const stats = useMemo(() => {
    const open = alerts.filter((alert) => alert.status === "open").length
    const resolved = alerts.filter((alert) => alert.status === "resolved").length
    const failedDeliveries = alerts.reduce((count, alert) => count + (alert.deliveries || []).filter((delivery) => delivery.status === "failed").length, 0)
    const delivered = alerts.reduce((count, alert) => count + (alert.deliveries || []).filter((delivery) => delivery.status === "sent").length, 0)
    return { total: alerts.length, open, resolved, failedDeliveries, delivered }
  }, [alerts])

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const monitor = monitorById.get(alert.monitorId)
      const run = alert.runId ? runById.get(alert.runId) : undefined
      const q = searchQuery.toLowerCase()
      const matchesSearch =
        !searchQuery ||
        alert.title.toLowerCase().includes(q) ||
        (alert.description || "").toLowerCase().includes(q) ||
        (alert.failureCategory || "").toLowerCase().includes(q) ||
        (monitor?.name || "").toLowerCase().includes(q) ||
        (run?.failureReason || "").toLowerCase().includes(q) ||
        alert.id.toLowerCase().includes(q)

      const matchesStatus = statusFilter === "all" || alert.status === statusFilter
      const matchesChannel = channelFilter === "all" || (alert.channels || []).some((channel) => channel.toLowerCase().includes(channelFilter))
      const matchesDelivery = deliveryFilter === "all" || (alert.deliveries || []).some((delivery) => delivery.status === deliveryFilter)

      return matchesSearch && matchesStatus && matchesChannel && matchesDelivery
    })
  }, [alerts, monitorById, runById, searchQuery, statusFilter, channelFilter, deliveryFilter])

  const hasActiveFilters =
    searchQuery.length > 0 ||
    statusFilter !== "all" ||
    channelFilter !== "all" ||
    deliveryFilter !== "all"

  return (
    <PageShell eyebrow="Incident visibility" title="Alert history" description="Persisted monitor failures, delivery status, cooldowns, and recovery state.">
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <AlertStatCard label="Total alerts" value={stats.total.toString()} icon={Bell} detail="Persisted events" />
          <AlertStatCard label="Open" value={stats.open.toString()} icon={AlertTriangle} detail="Needs review" tone="warning" />
          <AlertStatCard label="Resolved" value={stats.resolved.toString()} icon={CheckCircle2} detail="Recovered monitors" tone="success" />
          <AlertStatCard label="Delivered" value={stats.delivered.toString()} icon={Mail} detail="Sent notifications" tone="success" />
          <AlertStatCard
            label="Delivery failures"
            value={stats.failedDeliveries.toString()}
            icon={XCircle}
            detail="Provider errors"
            tone="danger"
          />
        </div>

        <Card className="gap-0 overflow-hidden p-0">
          <Card.Header className="flex-col gap-4  p-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <Card.Title className="text-base">Alert events</Card.Title>
              <Card.Description>
                Filter by state, channel, delivery outcome, monitor name, failure reason, or alert id.
              </Card.Description>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-2 lg:max-w-2xl lg:grid-cols-4">
              <SearchField
                aria-label="Search alerts"
                className="sm:col-span-2 lg:col-span-4"
                value={searchQuery}
                onChange={setSearchQuery}
                variant="secondary"
              >
                <SearchField.Group className="h-9">
                  <SearchField.SearchIcon />
                  <SearchField.Input className="text-sm" placeholder="Search alerts by title, id, monitor, or reason..." />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <AlertFilterSelect
                ariaLabel="Filter by state"
                selectedKey={statusFilter}
                onSelectionChange={(key) => setStatusFilter(key as AlertStatusFilter)}
                options={STATUS_OPTIONS}
              />
              <AlertFilterSelect
                ariaLabel="Filter by channel"
                selectedKey={channelFilter}
                onSelectionChange={(key) => setChannelFilter(key as "all" | "email" | "slack")}
                options={CHANNEL_OPTIONS}
              />
              <AlertFilterSelect
                ariaLabel="Filter by delivery outcome"
                selectedKey={deliveryFilter}
                onSelectionChange={(key) => setDeliveryFilter(key as AlertDeliveryFilter)}
                options={DELIVERY_OPTIONS}
              />
            </div>
          </Card.Header>

          <div className="flex items-center justify-between gap-2  bg-default/50 px-5 py-2.5">
            <Description className="text-xs font-medium">
              Showing {filteredAlerts.length} of {alerts.length} alert{alerts.length === 1 ? "" : "s"}
            </Description>
            {hasActiveFilters ? (
              <Button
                size="sm"
                variant="tertiary"
                onPress={() => {
                  setSearchQuery("")
                  setStatusFilter("all")
                  setChannelFilter("all")
                  setDeliveryFilter("all")
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>

          <Card.Content className="gap-3 p-4">
            {filteredAlerts.length === 0 ? (
              <EmptyState className="flex min-h-52 flex-col items-center justify-center gap-2 py-10 text-center">
                <Bell className="size-6 text-muted" aria-hidden />
                <p className="text-sm font-semibold text-foreground">No alerts match these filters</p>
                <Card.Description className="max-w-sm">
                  Alert events appear after monitors cross their configured failure threshold.
                </Card.Description>
              </EmptyState>
            ) : (
              filteredAlerts.map((alert) => (
                <AlertEventCard
                  key={alert.id}
                  alert={alert}
                  monitor={monitorById.get(alert.monitorId)}
                  run={alert.runId ? runById.get(alert.runId) : undefined}
                />
              ))
            )}
          </Card.Content>
        </Card>
      </div>
    </PageShell>
  )
}

function AlertOpsBar({
  alert,
  onUpdated,
}: {
  alert: AlertEvent
  onUpdated?: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [ackBy, setAckBy] = useState("on-call")

  async function acknowledge() {
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/alerts/${alert.id}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledgedBy: ackBy }),
      })
      if (!res.ok) throw new Error(await res.text())
      await onUpdated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Acknowledge failed.")
    } finally {
      setBusy(false)
    }
  }

  async function snooze(minutes: number) {
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/alerts/${alert.id}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: minutes, reason: `Snoozed ${minutes}m` }),
      })
      if (!res.ok) throw new Error(await res.text())
      await onUpdated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Snooze failed.")
    } finally {
      setBusy(false)
    }
  }

  if (alert.status === "resolved") return null

  return (
    <Card variant="secondary">
      <Card.Header className="gap-1.5  pb-4">
        <Card.Title className="text-sm">On-call actions</Card.Title>
        <Card.Description>Acknowledge to stop pages, or snooze to mute delivery for a period.</Card.Description>
      </Card.Header>
      <Card.Content className="gap-4">
        {error ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {alert.acknowledgedBy ? (
          <Description className="text-xs">
            Acknowledged by <span className="font-semibold text-foreground">{alert.acknowledgedBy}</span>
            {alert.acknowledgedAt ? ` · ${formatDate(alert.acknowledgedAt)}` : ""}
          </Description>
        ) : null}
        {alert.snoozedUntil ? (
          <Description className="text-xs">
            Snoozed until <span className="font-semibold text-foreground">{formatDate(alert.snoozedUntil)}</span>
            {alert.suppressionReason ? ` · ${alert.suppressionReason}` : ""}
          </Description>
        ) : null}
        <div className="flex flex-wrap items-end gap-3 pt-1">
          <TextField className="min-w-[10rem] flex-1 sm:max-w-[12rem]" name="acknowledgedBy">
            <Label className="text-xs">Your name</Label>
            <Input
              variant="secondary"
              value={ackBy}
              onChange={(e) => setAckBy(e.target.value)}
              placeholder="on-call"
            />
          </TextField>
          <Button
            size="sm"
            variant="secondary"
            isDisabled={busy || alert.status === "acknowledged"}
            onPress={() => void acknowledge()}
          >
            Acknowledge
          </Button>
          <Button size="sm" variant="secondary" isDisabled={busy} onPress={() => void snooze(120)}>
            Snooze 2h
          </Button>
          <Button size="sm" variant="secondary" isDisabled={busy} onPress={() => void snooze(480)}>
            Snooze 8h
          </Button>
        </div>
      </Card.Content>
    </Card>
  )
}

export function AlertDetail({
  alert,
  monitor,
  run,
  onAlertUpdated,
}: {
  alert: AlertEvent
  monitor?: Monitor
  run?: MonitorRun
  onAlertUpdated?: () => void | Promise<void>
}) {
  const router = useRouter()
  const failedStep = run?.steps?.find((step) => step.status === "failed" || String(step.status).toLowerCase() === "failed")
  const failureText = run?.failureReason || failedStep?.errorMessage || alert.description || "Monitor run did not complete successfully."
  const failureCategory = alert.failureCategory || run?.failureCategory || "Failure reason"

  return (
    <PageShell
      eyebrow="Alert detail"
      title={alert.title}
      description={monitor ? monitor.name : alert.monitorId}
      action={
        <Button variant="secondary" size="sm" className="gap-1" onPress={() => router.push("/alerts")}>
          <ArrowLeft className="size-3.5" />
          Alerts
        </Button>
      }
    >
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <Card.Header className="gap-2  pb-5">
              <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <Card.Title className="text-lg leading-7">{alert.title}</Card.Title>
                  <Card.Description className="text-sm leading-6">
                    {alert.description || "Failure alert from monitor execution."}
                  </Card.Description>
                </div>
                <div className="shrink-0 sm:pt-0.5">
                  <AlertStatusPill status={alert.status} />
                </div>
              </div>
            </Card.Header>
            <Card.Content className="gap-6">
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content className="gap-2">
                  <Alert.Title className="flex items-center gap-2 text-[11px] uppercase tracking-wider">
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                    {failureCategory}
                  </Alert.Title>
                  <Alert.Description className="whitespace-pre-wrap break-words font-mono text-xs leading-6">
                    {failureText}
                  </Alert.Description>
                </Alert.Content>
              </Alert>

              <div className="grid gap-4 sm:grid-cols-3">
                <AlertDetailField label="First triggered" value={formatDate(alert.firstTriggeredAt)} />
                <AlertDetailField label="Last triggered" value={formatDate(alert.lastTriggeredAt)} />
                <AlertDetailField label="Resolved at" value={alert.resolvedAt ? formatDate(alert.resolvedAt) : "Still open"} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <AlertDetailField label="Monitor" value={monitor?.name || alert.monitorId} />
                <AlertDetailField label="Run" value={alert.runId || "No run attached"} />
              </div>
            </Card.Content>
            <Card.Footer className="flex-wrap gap-3 pt-1">
              {monitor ? (
                <Button variant="secondary" size="sm" className="gap-1.5" onPress={() => router.push(`/monitors/${monitor.id}/runs`)}>
                  Monitor runs <ExternalLink className="size-3.5" />
                </Button>
              ) : null}
              {alert.runId ? (
                <Button size="sm" className="gap-1.5" onPress={() => router.push(`/runs/${alert.runId}`)}>
                  Run diagnostics <ExternalLink className="size-3.5" />
                </Button>
              ) : null}
            </Card.Footer>
          </Card>

          <Card>
            <Card.Header className="gap-1.5  pb-4">
              <Card.Title className="flex items-center gap-2">
                <TerminalSquare className="size-4 shrink-0 text-accent" aria-hidden />
                Delivery attempts
              </Card.Title>
              <Card.Description>Channel-level notification result persisted with this alert.</Card.Description>
            </Card.Header>
            <Card.Content className="gap-4">
              {!alert.deliveries || alert.deliveries.length === 0 ? (
                <EmptyState className="flex flex-col items-center gap-3 py-10 text-center">
                  <Bell className="size-6 text-muted" aria-hidden />
                  <p className="text-sm font-semibold text-foreground">No delivery attempts</p>
                  <Card.Description className="max-w-sm text-center">
                    This alert was persisted before notification delivery was attempted.
                  </Card.Description>
                </EmptyState>
              ) : (
                <div className="flex flex-col gap-4">
                  {alert.deliveries.map((delivery, index) => {
                    const Icon = channelIcon(delivery.channel)
                    return (
                      <div
                        key={`${delivery.channel}-${index}`}
                        className="flex flex-col gap-3 rounded-2xl oklch(0.5441 0.1703 253.55) bg-surface-secondary px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                            <span className="text-sm font-semibold capitalize text-foreground">{delivery.channel}</span>
                          </div>
                          <DeliveryStatusPill status={delivery.status} />
                        </div>
                        <Description className="text-sm leading-6" title={delivery.detail}>
                          {delivery.detail || "No provider detail"}
                        </Description>
                        <Description className="text-xs">
                          {delivery.sentAt ? formatDate(delivery.sentAt) : "Not sent"}
                        </Description>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card.Content>
          </Card>

          {run ? <RunTimeline run={run} defaultExpanded={false} /> : null}
        </div>

        <div className="flex flex-col gap-5">
          <AlertOpsBar alert={alert} onUpdated={onAlertUpdated} />
          <AlertSidebarSection title="Alert state" icon={Bell}>
            <AlertDetailField label="Severity" value={alert.severity || "warning"} />
            <AlertDetailField label="State" value={alert.status} />
            <AlertDetailField label="Channels" value={alert.channels?.length ? alert.channels.join(", ") : "None"} />
            <AlertDetailField
              label="Last delivery"
              value={alert.lastDeliveredAt ? formatDate(alert.lastDeliveredAt) : "Not delivered"}
            />
          </AlertSidebarSection>
          <AlertSidebarSection title="Run context" icon={TerminalSquare}>
            <AlertDetailField label="Run status" value={run?.status || "Unknown"} />
            <AlertDetailField label="Triggered by" value={run?.triggeredBy || "Unknown"} />
            <AlertDetailField label="Duration" value={run ? `${run.durationMs}ms` : "Unknown"} />
            <AlertDetailField label="Failed step" value={failedStep?.stepName || "Not available"} />
          </AlertSidebarSection>
          <AlertAiPreviews run={run} />
        </div>
      </div>
    </PageShell>
  )
}

function AlertAiPreviews({ run }: { run?: MonitorRun }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    slackMessage: string
    emailSubject: string
    emailBody: string
    teamsCardText: string
  } | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  async function generate() {
    if (!run || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/copilot/alert-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data.result)
    } catch (e: any) {
      setError(e.message || "Failed to generate alert draft templates.")
    } finally {
      setLoading(false)
    }
  }

  function handleCopy(key: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  if (!run) return null

  return (
    <Card variant="secondary" className="border border-accent/20 bg-accent/5">
      <Card.Header className="flex-row flex-wrap items-center justify-between gap-3 pb-1">
        <Card.Title className="flex items-center gap-2 text-xs uppercase tracking-wider text-accent">
          <Sparkles className="size-4 shrink-0 animate-pulse" aria-hidden />
          Pulse notification previews
        </Card.Title>
        {!result && !loading ? (
          <Button size="sm" onPress={() => void generate()}>
            Generate previews
          </Button>
        ) : null}
      </Card.Header>

      <Card.Content className="gap-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6">
            <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
            <Description>Generating rephrased notification drafts...</Description>
          </div>
        ) : null}

        {error ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>Failed to generate: {error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        {result ? (
          <div className="space-y-4 text-xs">
            <AlertPreviewBlock
              title="Slack (Markdown)"
              copied={copiedKey === "slack"}
              onCopy={() => handleCopy("slack", result.slackMessage)}
            >
              <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed">{result.slackMessage}</pre>
            </AlertPreviewBlock>

            <AlertPreviewBlock
              title="Email draft"
              copied={copiedKey === "email"}
              onCopy={() => handleCopy("email", `Subject: ${result.emailSubject}\n\n${result.emailBody}`)}
            >
              <p className="font-semibold text-foreground">Subject: {result.emailSubject}</p>
              <pre className="mt-1.5 whitespace-pre-wrap font-mono text-[10px] leading-relaxed">{result.emailBody}</pre>
            </AlertPreviewBlock>

            <AlertPreviewBlock
              title="MS Teams card summary"
              copied={copiedKey === "teams"}
              onCopy={() => handleCopy("teams", result.teamsCardText)}
            >
              <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed">{result.teamsCardText}</pre>
            </AlertPreviewBlock>
          </div>
        ) : null}
      </Card.Content>
    </Card>
  )
}

function AlertPreviewBlock({
  title,
  copied,
  onCopy,
  children,
}: {
  title: string
  copied: boolean
  onCopy: () => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <Button size="sm" variant="tertiary" className="gap-1.5" onPress={onCopy}>
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="rounded-2xl oklch(0.5441 0.1703 253.55) bg-default px-4 py-3.5 text-sm leading-6 text-muted">
        {children}
      </div>
    </div>
  )
}
