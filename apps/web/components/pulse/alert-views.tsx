"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, Bell, CheckCircle2, ChevronRight, ExternalLink, Mail, TerminalSquare, XCircle, Sparkles, Loader2, Copy, Check, FileText } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import type { AlertEvent, Monitor, MonitorRun } from "@/lib/pulse-types"
import { Input } from "@workspace/ui/components/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@workspace/ui/components/empty"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { AlertStatusPill, channelIcon, DeliveryStatusPill, Field, formatDate, Metric, PageShell, Section } from "./console-shared"
import { RunTimeline } from "./run-views"

export type AlertStatusFilter = "all" | "open" | "acknowledged" | "resolved" | "suppressed"
export type AlertDeliveryFilter = "all" | "sent" | "failed" | "skipped" | "suppressed"

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

  return (
    <PageShell eyebrow="Incident visibility" title="Alert history" description="Persisted monitor failures, delivery status, cooldowns, and recovery state.">
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-5">
          <Metric label="Total alerts" value={stats.total.toString()} icon={Bell} detail="Persisted events" />
          <Metric label="Open" value={stats.open.toString()} icon={AlertTriangle} detail="Needs review" />
          <Metric label="Resolved" value={stats.resolved.toString()} icon={CheckCircle2} detail="Recovered monitors" />
          <Metric label="Delivered" value={stats.delivered.toString()} icon={Mail} detail="Sent notifications" />
          <Metric label="Delivery failures" value={stats.failedDeliveries.toString()} icon={XCircle} detail="Provider errors" />
        </div>

        <Card>
          <CardHeader className="border-b pb-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Alert events</CardTitle>
                <CardDescription>
                  Filter by state, channel, delivery outcome, monitor name, failure reason, or alert id.
                </CardDescription>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:w-[760px]">
                <Input
                  placeholder="Search alerts..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-9 text-xs sm:col-span-2 lg:col-span-1"
                />
                <NativeSelect size="sm" value={statusFilter} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(event.target.value as AlertStatusFilter)}>
                  <NativeSelectOption value="all">All states</NativeSelectOption>
                  <NativeSelectOption value="open">Open</NativeSelectOption>
                  <NativeSelectOption value="acknowledged">Acknowledged</NativeSelectOption>
                  <NativeSelectOption value="resolved">Resolved</NativeSelectOption>
                  <NativeSelectOption value="suppressed">Suppressed</NativeSelectOption>
                </NativeSelect>
                <NativeSelect size="sm" value={channelFilter} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setChannelFilter(event.target.value as "all" | "email" | "slack")}>
                  <NativeSelectOption value="all">All channels</NativeSelectOption>
                  <NativeSelectOption value="email">Email</NativeSelectOption>
                  <NativeSelectOption value="slack">Slack</NativeSelectOption>
                </NativeSelect>
                <NativeSelect size="sm" value={deliveryFilter} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setDeliveryFilter(event.target.value as AlertDeliveryFilter)}>
                  <NativeSelectOption value="all">All delivery</NativeSelectOption>
                  <NativeSelectOption value="sent">Sent</NativeSelectOption>
                  <NativeSelectOption value="failed">Failed</NativeSelectOption>
                  <NativeSelectOption value="skipped">Skipped</NativeSelectOption>
                  <NativeSelectOption value="suppressed">Suppressed</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 font-semibold">Alert</TableHead>
                  <TableHead className="px-4 font-semibold">State</TableHead>
                  <TableHead className="px-4 font-semibold">Monitor</TableHead>
                  <TableHead className="px-4 font-semibold">Delivery</TableHead>
                  <TableHead className="px-4 font-semibold">Last triggered</TableHead>
                  <TableHead className="px-4 text-right font-semibold">Links</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAlerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-52 text-center align-middle">
                      <Empty className="border-0 bg-transparent py-6">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Bell className="size-5 text-muted-foreground" />
                          </EmptyMedia>
                          <EmptyTitle>No alerts match these filters</EmptyTitle>
                          <EmptyDescription>Alert events appear after monitors cross their configured failure threshold.</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAlerts.map((alert) => {
                    const monitor = monitorById.get(alert.monitorId)
                    const run = alert.runId ? runById.get(alert.runId) : undefined
                    const latestDelivery = alert.deliveries?.[0]
                    const failureText = run?.failureReason || alert.description || "Monitor run did not complete successfully."

                    return (
                      <TableRow key={alert.id} className="hover:bg-muted/40">
                        <TableCell className="max-w-[380px] px-4 align-top">
                          <Link href={`/alerts/${alert.id}`} className="font-semibold text-foreground hover:text-primary hover:underline">
                            {alert.title}
                          </Link>
                          <p className="mt-1 truncate text-xs text-muted-foreground" title={failureText}>{failureText}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                            <span className="rounded border bg-muted/30 px-1.5 py-0.5 font-mono">{alert.id}</span>
                            {alert.failureCategory ? <span className="rounded border bg-muted/30 px-1.5 py-0.5">{alert.failureCategory}</span> : null}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 align-top">
                          <AlertStatusPill status={alert.status} />
                          <p className="mt-2 text-[10px] font-medium text-muted-foreground">
                            {alert.resolvedAt ? `Resolved ${formatDate(alert.resolvedAt)}` : `First seen ${formatDate(alert.firstTriggeredAt)}`}
                          </p>
                        </TableCell>
                        <TableCell className="max-w-[240px] px-4 align-top">
                          {monitor ? (
                            <Link href={`/monitors/${monitor.id}/runs`} className="font-semibold text-foreground hover:text-primary hover:underline">
                              {monitor.name}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground">{alert.monitorId}</span>
                          )}
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {run ? `${run.status} run · ${run.durationMs}ms` : "Run not loaded"}
                          </p>
                        </TableCell>
                        <TableCell className="px-4 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {(alert.deliveries || []).slice(0, 2).map((delivery, index) => {
                              const Icon = channelIcon(delivery.channel)
                              return (
                                <span key={`${delivery.channel}-${index}`} className="inline-flex items-center gap-1 rounded-md border bg-muted/20 px-2 py-1 text-[10px] font-semibold">
                                  <Icon className="size-3 text-muted-foreground" />
                                  {delivery.channel}
                                  <DeliveryStatusPill status={delivery.status} />
                                </span>
                              )
                            })}
                            {!latestDelivery ? <span className="text-xs text-muted-foreground">No attempts</span> : null}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 align-top text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{formatDate(alert.lastTriggeredAt)}</span>
                          <p className="mt-1 text-[10px]">Last delivery {alert.lastDeliveredAt ? formatDate(alert.lastDeliveredAt) : "not sent"}</p>
                        </TableCell>
                        <TableCell className="px-4 text-right align-top">
                          <div className="flex justify-end gap-2">
                            {alert.runId ? (
                              <Link href={`/runs/${alert.runId}`} className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2.5 text-xs font-semibold hover:bg-muted">
                                Run <ExternalLink className="size-3" />
                              </Link>
                            ) : null}
                            <Link href={`/alerts/${alert.id}`} className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2.5 text-xs font-semibold hover:bg-muted">
                              Detail <ChevronRight className="size-3" />
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
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
    <Card>
      <CardHeader className="border-b pb-3">
        <CardTitle className="text-sm font-semibold">On-call actions</CardTitle>
        <CardDescription>Acknowledge to stop pages, or snooze to mute delivery for a period.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {alert.acknowledgedBy ? (
          <p className="text-xs text-muted-foreground">
            Acknowledged by <span className="font-semibold text-foreground">{alert.acknowledgedBy}</span>
            {alert.acknowledgedAt ? ` · ${formatDate(alert.acknowledgedAt)}` : ""}
          </p>
        ) : null}
        {alert.snoozedUntil ? (
          <p className="text-xs text-muted-foreground">
            Snoozed until <span className="font-semibold text-foreground">{formatDate(alert.snoozedUntil)}</span>
            {alert.suppressionReason ? ` · ${alert.suppressionReason}` : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Input className="h-8 w-36 text-xs" value={ackBy} onChange={(e) => setAckBy(e.target.value)} placeholder="Your name" />
          <Button size="sm" variant="outline" disabled={busy || alert.status === "acknowledged"} onClick={() => void acknowledge()}>
            Acknowledge
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void snooze(120)}>Snooze 2h</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void snooze(480)}>Snooze 8h</Button>
        </div>
      </CardContent>
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
  const failedStep = run?.steps?.find((step) => step.status === "failed" || String(step.status).toLowerCase() === "failed")
  const failureText = run?.failureReason || failedStep?.errorMessage || alert.description || "Monitor run did not complete successfully."

  return (
    <PageShell
      eyebrow="Alert detail"
      title={alert.title}
      description={monitor ? monitor.name : alert.monitorId}
      action={
        <Link href="/alerts" className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs font-semibold hover:bg-muted">
          <ArrowLeft className="size-3.5" /> Alerts
        </Link>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="border-b pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="text-base font-semibold">{alert.title}</CardTitle>
                  <CardDescription className="mt-1 break-words">{alert.description || "Failure alert from monitor execution."}</CardDescription>
                </div>
                <AlertStatusPill status={alert.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="rounded-md border border-rose-200/60 bg-rose-500/5 p-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-rose-500">
                  <AlertTriangle className="size-3.5" />
                  {alert.failureCategory || run?.failureCategory || "Failure reason"}
                </div>
                <p className="whitespace-pre-wrap break-words font-mono text-xs leading-5">{failureText}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Field label="First triggered" value={formatDate(alert.firstTriggeredAt)} />
                <Field label="Last triggered" value={formatDate(alert.lastTriggeredAt)} />
                <Field label="Resolved at" value={alert.resolvedAt ? formatDate(alert.resolvedAt) : "Still open"} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Monitor" value={monitor?.name || alert.monitorId} />
                <Field label="Run" value={alert.runId || "No run attached"} />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {monitor ? (
                  <Link href={`/monitors/${monitor.id}/runs`} className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs font-semibold hover:bg-muted">
                    Monitor runs <ExternalLink className="size-3" />
                  </Link>
                ) : null}
                {alert.runId ? (
                  <Link href={`/runs/${alert.runId}`} className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs font-semibold hover:bg-muted">
                    Run diagnostics <ExternalLink className="size-3" />
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <TerminalSquare className="size-4 text-primary" />
                Delivery attempts
              </CardTitle>
              <CardDescription>Channel-level notification result persisted with this alert.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {(!alert.deliveries || alert.deliveries.length === 0) ? (
                <Empty className="border-0 bg-transparent py-6">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Bell className="size-5 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>No delivery attempts</EmptyTitle>
                    <EmptyDescription>This alert was persisted before notification delivery was attempted.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="space-y-3">
                  {alert.deliveries.map((delivery, index) => {
                    const Icon = channelIcon(delivery.channel)
                    return (
                      <div key={`${delivery.channel}-${index}`} className="grid gap-3 rounded-md border bg-muted/10 p-3 text-xs md:grid-cols-[140px_110px_1fr_120px] md:items-center">
                        <div className="flex items-center gap-2 font-semibold text-foreground">
                          <Icon className="size-4 text-muted-foreground" />
                          <span className="capitalize">{delivery.channel}</span>
                        </div>
                        <DeliveryStatusPill status={delivery.status} />
                        <div className="min-w-0 text-muted-foreground">
                          <p className="truncate" title={delivery.detail}>{delivery.detail || "No provider detail"}</p>
                        </div>
                        <div className="text-muted-foreground md:text-right">{delivery.sentAt ? formatDate(delivery.sentAt) : "Not sent"}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {run ? <RunTimeline run={run} defaultExpanded={false} /> : null}
        </div>

        <div className="space-y-4">
          <AlertOpsBar alert={alert} onUpdated={onAlertUpdated} />
          <Section title="Alert state" icon={Bell}>
            <div className="space-y-2">
              <Field label="Severity" value={alert.severity || "warning"} />
              <Field label="State" value={alert.status} />
              <Field label="Channels" value={alert.channels?.length ? alert.channels.join(", ") : "None"} />
              <Field label="Last delivery" value={alert.lastDeliveredAt ? formatDate(alert.lastDeliveredAt) : "Not delivered"} />
            </div>
          </Section>
          <Section title="Run context" icon={TerminalSquare}>
            <div className="space-y-2">
              <Field label="Run status" value={run?.status || "Unknown"} />
              <Field label="Triggered by" value={run?.triggeredBy || "Unknown"} />
              <Field label="Duration" value={run ? `${run.durationMs}ms` : "Unknown"} />
              <Field label="Failed step" value={failedStep?.stepName || "Not available"} />
            </div>
          </Section>
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
    <Card className="border border-primary/20 bg-primary/[0.02] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary animate-pulse" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-primary">Pulse Notification Previews</h3>
        </div>
        {!result && !loading && (
          <Button size="sm" onClick={generate} className="h-7 text-[10px] px-2.5 bg-primary text-primary-foreground cursor-pointer">
            Generate Previews
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-xs gap-2">
          <Loader2 className="size-5 animate-spin text-primary" />
          <span>Generating rephrased notification drafts...</span>
        </div>
      )}

      {error && (
        <div className="text-xs text-rose-500 font-medium py-2">
          Failed to generate: {error}
        </div>
      )}

      {result && (
        <div className="space-y-4 text-xs animate-in fade-in duration-200">
          {/* Slack Trigger */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-foreground/80">Slack (Markdown)</span>
              <button
                onClick={() => handleCopy("slack", result.slackMessage)}
                className="text-[10px] text-primary font-medium hover:underline flex items-center gap-1 cursor-pointer font-sans"
              >
                {copiedKey === "slack" ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                {copiedKey === "slack" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="rounded border bg-muted/40 p-2.5 font-mono text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {result.slackMessage}
            </div>
          </div>

          {/* Email Trigger */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-foreground/80 font-sans">Email Draft</span>
              <button
                onClick={() => handleCopy("email", `Subject: ${result.emailSubject}\n\n${result.emailBody}`)}
                className="text-[10px] text-primary font-medium hover:underline flex items-center gap-1 cursor-pointer font-sans"
              >
                {copiedKey === "email" ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                {copiedKey === "email" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="rounded border bg-muted/40 p-2.5 space-y-1.5 leading-relaxed text-muted-foreground">
              <div className="font-semibold text-foreground">Subject: {result.emailSubject}</div>
              <div className="font-mono text-[10px] whitespace-pre-wrap">{result.emailBody}</div>
            </div>
          </div>

          {/* MS Teams trigger */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-foreground/80">MS Teams Card Summary</span>
              <button
                onClick={() => handleCopy("teams", result.teamsCardText)}
                className="text-[10px] text-primary font-medium hover:underline flex items-center gap-1 cursor-pointer font-sans"
              >
                {copiedKey === "teams" ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                {copiedKey === "teams" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="rounded border bg-muted/40 p-2.5 font-mono text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {result.teamsCardText}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
