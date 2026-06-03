"use client"

import { useState } from "react"
import { Braces, Clock, DatabaseZap, Mail, RotateCw, ShieldCheck } from "lucide-react"
import type { NotificationSettings, NotificationSettingsInput } from "@/lib/pulse-types"
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
}: {
  notificationSettings: NotificationSettings | null
  onSaveNotifications: (input: NotificationSettingsInput) => Promise<void>
}) {
  const [form, setForm] = useState<NotificationSettingsInput>(defaultNotificationInput)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const update = (patch: Partial<NotificationSettingsInput>) => setForm((current) => ({ ...current, ...patch }))

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

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving} className="gap-2">
                {saving ? <RotateCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Save notification settings
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Section title="Scheduler" icon={Clock}>
            <div className="space-y-2">
              <Field label="Timing" value="Configurable: manual, fixed intervals, custom cron" />
              <Field label="Duplicate prevention" value="Reserve monitor/run key before queue enqueue" />
            </div>
          </Section>
          <Section title="Storage" icon={DatabaseZap}>
            <div className="space-y-2">
              <Field label="Secrets" value="Encrypted DB first, Vault later" />
              <Field label="Body limit" value="32 KB default per request/response body" />
            </div>
          </Section>
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
