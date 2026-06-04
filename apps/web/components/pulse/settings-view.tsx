"use client"

import { useEffect, useState } from "react"
import { Braces, BellRing, Clock, DatabaseZap, Mail, RotateCw, ShieldCheck, Trash2 } from "lucide-react"
import type {
  Application,
  Monitor,
  NotificationSettings,
  NotificationSettingsInput,
  NotificationTestResult,
  RetentionPurgeResult,
  RetentionSettings,
} from "@/lib/pulse-types"
import { MaintenanceWindowsPanel } from "./maintenance-windows-panel"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import { Field, PageShell, Section } from "./console-shared"

export const defaultNotificationInput: NotificationSettingsInput = {
  smtpHost: "smtp.freesmtpservers.com",
  smtpPort: "25",
  smtpFrom: "",
  smtpTo: "",
  smtpUser: "",
  smtpPassword: "",
  slackWebhookUrl: "",
}

export function ConfiguredDot({ configured }: { configured: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
      configured
        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300"
        : "border-border bg-muted/40 text-muted-foreground"
    )}>
      <span className={cn("size-1.5 rounded-full", configured ? "bg-emerald-500" : "bg-muted-foreground/50")} />
      {configured ? "Configured" : "Not configured"}
    </span>
  )
}

export function SettingsView({
  notificationSettings,
  onSaveNotifications,
  onTestNotifications,
  retentionSettings,
  onSaveRetention,
  onPurgeRetention,
  applications = [],
  monitors = [],
}: {
  notificationSettings: NotificationSettings | null
  onSaveNotifications: (input: NotificationSettingsInput) => Promise<void>
  onTestNotifications: (input: NotificationSettingsInput) => Promise<NotificationTestResult>
  retentionSettings: RetentionSettings | null
  onSaveRetention: (settings: RetentionSettings) => Promise<RetentionSettings>
  onPurgeRetention: () => Promise<RetentionPurgeResult>
  applications?: Application[]
  monitors?: Monitor[]
}) {
  const [form, setForm] = useState<NotificationSettingsInput>(defaultNotificationInput)
  const [retention, setRetention] = useState<RetentionSettings>({
    runsRetentionDays: retentionSettings?.runsRetentionDays ?? 90,
    enabled: retentionSettings?.enabled ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [purging, setPurging] = useState(false)
  const [savingRetention, setSavingRetention] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [testResult, setTestResult] = useState<NotificationTestResult | null>(null)
  const [purgeResult, setPurgeResult] = useState<RetentionPurgeResult | null>(null)
  const update = (patch: Partial<NotificationSettingsInput>) => setForm((current) => ({ ...current, ...patch }))

  useEffect(() => {
    if (!retentionSettings) {
      return
    }
    setRetention(retentionSettings)
  }, [retentionSettings])

  const save = async () => {
    setSaving(true)
    setMessage("")
    setError("")
    try {
      await onSaveNotifications(form)
      setMessage("Notification settings saved. Existing configured values remain masked.")
      setForm({ ...defaultNotificationInput, smtpFrom: "", smtpTo: "", smtpUser: "", smtpPassword: "", slackWebhookUrl: "" })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save notification settings.")
    } finally {
      setSaving(false)
    }
  }

  const sendTestAlert = async () => {
    setTesting(true)
    setMessage("")
    setError("")
    setTestResult(null)
    try {
      const result = await onTestNotifications(form)
      setTestResult(result)
      if (result.ok) {
        setMessage("Test alert sent on at least one channel. Check Slack and your inbox.")
      } else {
        setError("Test alert did not deliver on any channel. Review configuration and delivery details below.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test alert.")
    } finally {
      setTesting(false)
    }
  }

  const saveRetention = async () => {
    setSavingRetention(true)
    setMessage("")
    setError("")
    setPurgeResult(null)
    try {
      const updated = await onSaveRetention(retention)
      setRetention(updated)
      setMessage(`Run retention updated to ${updated.runsRetentionDays} days.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save retention settings.")
    } finally {
      setSavingRetention(false)
    }
  }

  const purgeNow = async () => {
    setPurging(true)
    setMessage("")
    setError("")
    try {
      const result = await onPurgeRetention()
      setPurgeResult(result)
      if (result.deleted > 0) {
        setMessage(`Purged ${result.deleted} monitor runs older than ${result.runsRetentionDays ?? retention.runsRetentionDays} days.`)
      } else {
        setMessage(result.message || "No expired monitor runs found to purge.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to purge expired runs.")
    } finally {
      setPurging(false)
    }
  }

  return (
    <PageShell eyebrow="Runtime settings" title="MVP settings" description="Configure alert delivery channels for monitor failures.">
      <div className="space-y-6">
        {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">{message}</p> : null}
        {error ? <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

        <Card>
          <CardHeader className="border-b pb-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Mail className="size-4 text-primary" />
                  Alert delivery
                </CardTitle>
                <CardDescription>
                  Saved values are stored as encrypted secret references and are not returned by the API.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <ConfiguredDot configured={Boolean(notificationSettings?.smtp.addrConfigured && notificationSettings?.smtp.fromConfigured && notificationSettings?.smtp.toConfigured)} />
                <ConfiguredDot configured={Boolean(notificationSettings?.slack.webhookConfigured)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-4 rounded-md border bg-muted/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">SMTP email</h2>
                    <p className="text-xs text-muted-foreground">Use no-auth SMTP by leaving username and password blank.</p>
                  </div>
                  <ConfiguredDot configured={Boolean(notificationSettings?.smtp.addrConfigured && notificationSettings?.smtp.fromConfigured && notificationSettings?.smtp.toConfigured)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">SMTP host</span>
                    <Input value={form.smtpHost} onChange={(event) => update({ smtpHost: event.target.value })} placeholder="smtp.freesmtpservers.com" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Port</span>
                    <Input value={form.smtpPort} onChange={(event) => update({ smtpPort: event.target.value })} placeholder="25" />
                  </label>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">From address</span>
                  <Input value={form.smtpFrom} onChange={(event) => update({ smtpFrom: event.target.value })} placeholder={notificationSettings?.smtp.fromConfigured ? "Configured, enter a new value to replace" : "pulse-alerts@example.com"} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Recipients</span>
                  <Input value={form.smtpTo} onChange={(event) => update({ smtpTo: event.target.value })} placeholder={notificationSettings?.smtp.toConfigured ? "Configured, enter comma-separated replacements" : "oncall@example.com, platform@example.com"} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">SMTP username</span>
                    <Input value={form.smtpUser} onChange={(event) => update({ smtpUser: event.target.value })} placeholder="Optional" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">SMTP password</span>
                    <Input type="password" value={form.smtpPassword} onChange={(event) => update({ smtpPassword: event.target.value })} placeholder={notificationSettings?.smtp.passwordConfigured ? "Configured" : "Optional"} />
                  </label>
                </div>
              </section>

              <section className="space-y-4 rounded-md border bg-muted/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Slack webhook</h2>
                    <p className="text-xs text-muted-foreground">Paste an incoming webhook URL from Slack app settings.</p>
                  </div>
                  <ConfiguredDot configured={Boolean(notificationSettings?.slack.webhookConfigured)} />
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Incoming webhook URL</span>
                  <Input
                    type="password"
                    value={form.slackWebhookUrl}
                    onChange={(event) => update({ slackWebhookUrl: event.target.value })}
                    placeholder={notificationSettings?.slack.webhookConfigured ? "Configured, paste a new URL to replace" : "https://hooks.slack.com/services/..."}
                  />
                </label>
                <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
                  Your Slack channel link opens the channel, but Pulse needs a Slack incoming webhook URL. Create one from Slack API app settings, then select the target channel during webhook setup.
                </div>
              </section>
            </div>

            {testResult ? (
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <p className="mb-2 font-semibold">Test delivery results</p>
                <ul className="space-y-1.5 text-muted-foreground">
                  {testResult.deliveries.map((delivery) => (
                    <li key={`${delivery.channel}-${delivery.sentAt}`} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{delivery.channel}</span>
                      <span className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase",
                        delivery.status === "sent"
                          ? "border-emerald-500/20 text-emerald-600"
                          : delivery.status === "failed"
                            ? "border-destructive/20 text-destructive"
                            : "border-border text-muted-foreground"
                      )}>
                        {delivery.status}
                      </span>
                      <span>{delivery.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={sendTestAlert} disabled={testing || saving} className="gap-2">
                {testing ? <RotateCw className="size-4 animate-spin" /> : <BellRing className="size-4" />}
                Send test alert
              </Button>
              <Button onClick={save} disabled={saving || testing} className="gap-2">
                {saving ? <RotateCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Save notification settings
              </Button>
            </div>
          </CardContent>
        </Card>

        <MaintenanceWindowsPanel applications={applications} monitors={monitors} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Section title="Scheduler" icon={Clock}>
            <div className="space-y-2">
              <Field label="Timing" value="Configurable: manual, fixed intervals, custom cron" />
              <Field label="Duplicate prevention" value="Reserve monitor/run key before queue enqueue" />
            </div>
          </Section>
          <Card className="md:col-span-2 xl:col-span-1">
            <CardHeader className="border-b pb-4">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <DatabaseZap className="size-4 text-primary" />
                Run retention
              </CardTitle>
              <CardDescription>
                Automatically purge monitor runs older than the retention window to keep Postgres storage predictable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={retention.enabled}
                  onChange={(event) => setRetention((current) => ({ ...current, enabled: event.target.checked }))}
                  className="size-4 rounded border"
                />
                Enable automatic purge (hourly)
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Retention window</span>
                <select
                  className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={retention.runsRetentionDays}
                  onChange={(event) => setRetention((current) => ({
                    ...current,
                    runsRetentionDays: Number(event.target.value),
                  }))}
                >
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                </select>
              </label>
              {purgeResult ? (
                <p className="text-xs text-muted-foreground">
                  Last purge removed {purgeResult.deleted} run{purgeResult.deleted === 1 ? "" : "s"}.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={saveRetention} disabled={savingRetention || purging} className="gap-2">
                  {savingRetention ? <RotateCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                  Save retention
                </Button>
                <Button variant="secondary" onClick={purgeNow} disabled={purging || savingRetention} className="gap-2">
                  {purging ? <RotateCw className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Purge expired runs now
                </Button>
              </div>
              <Field label="Secrets" value="Encrypted DB first, Vault later" />
              <Field label="Body limit" value="32 KB default per request/response body" />
            </CardContent>
          </Card>
          <Section title="Config editing" icon={Braces}>
            <div className="space-y-2">
              <Field label="Builder" value="Form UI plus raw JSON config preview/editing path" />
              <Field label="Authentication" value="None for MVP local mode" />
            </div>
          </Section>
        </div>
      </div>
    </PageShell>
  )
}
