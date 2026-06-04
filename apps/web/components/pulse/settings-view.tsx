"use client"

import { useEffect, useState, type ComponentType } from "react"
import {
  Braces,
  BellRing,
  Clock,
  DatabaseZap,
  FileKey,
  Mail,
  RotateCw,
  ShieldCheck,
  Trash2,
  Globe,
  Edit3,
  Play,
  Upload,
  Lock,
  AlertTriangle,
  Sliders,
} from "lucide-react"
import type {
  Application,
  CertificateProfile,
  CertificateProfileInput,
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
import { Switch } from "@workspace/ui/components/switch"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

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

interface PremiumFilePickerProps {
  id: string
  label: string
  accept: string
  value?: string
  onChange: (fileContent: string) => void
  onClear: () => void
  isConfigured?: boolean
  readMode?: "text" | "base64"
}

function PremiumFilePicker({
  id,
  label,
  accept,
  value,
  onChange,
  onClear,
  isConfigured,
  readMode = "text"
}: PremiumFilePickerProps) {
  const [fileName, setFileName] = useState<string>("")

  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</span>
      <div className={cn(
        "relative flex items-center justify-between gap-3 rounded-lg border border-dashed p-2.5 transition-colors text-xs bg-muted/5 hover:bg-muted/10",
        value || isConfigured ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300" : "border-border"
      )}>
        <div className="flex items-center gap-2 min-w-0">
          {value || isConfigured ? (
            <ShieldCheck className="size-4 text-emerald-500 shrink-0" />
          ) : (
            <Upload className="size-4 text-muted-foreground shrink-0" />
          )}
          <span className="truncate font-medium">
            {fileName ? fileName : (value ? "File selected" : (isConfigured ? "Configured (encrypted)" : "No file chosen"))}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(value || isConfigured) && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer"
              onClick={() => {
                setFileName("")
                onClear()
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <label className="relative cursor-pointer rounded bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground border border-border shadow-xs hover:bg-accent hover:text-accent-foreground select-none">
            Browse
            <input
              type="file"
              id={id}
              accept={accept}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                if (file) {
                  setFileName(file.name)
                  const reader = new FileReader()
                  reader.onerror = () => console.error(`Failed to read ${file.name}`)
                  reader.onload = () => {
                    const result = String(reader.result ?? "")
                    if (readMode === "base64") {
                      const base64 = result.includes(",") ? result.split(",").pop() ?? "" : result
                      onChange(base64)
                    } else {
                      onChange(result)
                    }
                  }
                  if (readMode === "base64") {
                    reader.readAsDataURL(file)
                  } else {
                    reader.readAsText(file)
                  }
                }
              }}
            />
          </label>
        </div>
      </div>
    </div>
  )
}

export function SettingsView({
  notificationSettings,
  onSaveNotifications,
  onTestNotifications,
  retentionSettings,
  onSaveRetention,
  onPurgeRetention,
  certificateProfiles = [],
  onSaveCertificateProfile,
  onTestCertificateProfile,
  onDeleteCertificateProfile,
  applications = [],
  monitors = [],
}: {
  notificationSettings: NotificationSettings | null
  onSaveNotifications: (input: NotificationSettingsInput) => Promise<void>
  onTestNotifications: (input: NotificationSettingsInput) => Promise<NotificationTestResult>
  retentionSettings: RetentionSettings | null
  onSaveRetention: (settings: RetentionSettings) => Promise<RetentionSettings>
  onPurgeRetention: () => Promise<RetentionPurgeResult>
  certificateProfiles?: CertificateProfile[]
  onSaveCertificateProfile: (input: CertificateProfileInput) => Promise<void>
  onTestCertificateProfile: (profile: CertificateProfile) => Promise<boolean>
  onDeleteCertificateProfile: (profileId: string) => Promise<void>
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
  const [certificateForm, setCertificateForm] = useState<CertificateProfileInput>({
    name: "",
    host: "",
    port: 443,
    certType: "pem",
    insecureSkipVerify: false,
    isActive: true,
  })
  const [editingCertificateId, setEditingCertificateId] = useState<string | null>(null)
  const [savingCertificate, setSavingCertificate] = useState(false)
  const [testingCertificateId, setTestingCertificateId] = useState<string | null>(null)
  const update = (patch: Partial<NotificationSettingsInput>) => setForm((current) => ({ ...current, ...patch }))
  const updateCertificate = (patch: Partial<CertificateProfileInput>) => setCertificateForm((current) => ({ ...current, ...patch }))

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

  const readCertificateFile = async (file: File | null, mode: "text" | "base64") => {
    if (!file) return ""
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
      reader.onload = () => {
        const result = String(reader.result ?? "")
        if (mode === "base64") {
          resolve(result.includes(",") ? result.split(",").pop() ?? "" : result)
        } else {
          resolve(result)
        }
      }
      if (mode === "base64") {
        reader.readAsDataURL(file)
      } else {
        reader.readAsText(file)
      }
    })
  }

  const saveCertificate = async () => {
    setSavingCertificate(true)
    setMessage("")
    setError("")
    try {
      await onSaveCertificateProfile({ ...certificateForm, id: editingCertificateId ?? undefined })
      setMessage("Certificate profile saved.")
      setEditingCertificateId(null)
      setCertificateForm({
        name: "",
        host: "",
        port: 443,
        certType: "pem",
        insecureSkipVerify: false,
        isActive: true,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save certificate profile.")
    } finally {
      setSavingCertificate(false)
    }
  }

  const editCertificate = (profile: CertificateProfile) => {
    setEditingCertificateId(profile.id)
    setCertificateForm({
      id: profile.id,
      name: profile.name,
      host: profile.host,
      port: profile.port,
      certType: profile.certType,
      insecureSkipVerify: profile.insecureSkipVerify,
      isActive: profile.isActive,
    })
  }

  const testCertificate = async (profile: CertificateProfile) => {
    setTestingCertificateId(profile.id)
    setMessage("")
    setError("")
    try {
      const ok = await onTestCertificateProfile(profile)
      if (ok) {
        setMessage(`Certificate profile "${profile.name}" is valid.`)
      } else {
        setError(`Certificate profile "${profile.name}" did not validate.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to test certificate profile.")
    } finally {
      setTestingCertificateId(null)
    }
  }

  const [activeTab, setActiveTab] = useState<"notifications" | "certificates" | "maintenance" | "system">("notifications")
  const activeEditingProfile = certificateProfiles.find((p) => p.id === editingCertificateId)

  const tabDescriptions = {
    notifications: "Configure alert delivery channels (SMTP email, Slack webhooks) for monitor failures.",
    certificates: "Manage mutual TLS client certificates for secure monitor requests.",
    maintenance: "Schedule blackout windows to prevent alert dispatching during system maintenance.",
    system: "Configure data retention windows, manual storage purging, and view scheduler settings.",
  }

  return (
    <PageShell
      eyebrow="Console settings"
      title="Settings"
      description={tabDescriptions[activeTab]}
    >
      <div className="space-y-6">
        {message ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Settings Navigation Sidebar */}
          <aside className="w-full shrink-0 flex flex-row gap-1 border-b border-border/40 pb-2 overflow-x-auto scrollbar-none lg:flex-col lg:border-b-0 lg:pb-0 lg:w-64 lg:space-y-1">
            {[
              { key: "notifications", label: "Notifications & Alerts", desc: "SMTP and Slack configuration", icon: BellRing },
              { key: "certificates", label: "Client Certificates", desc: "mTLS profiles for secure steps", icon: FileKey },
              { key: "maintenance", label: "Maintenance Windows", desc: "Scheduled monitor blackouts", icon: Clock },
              { key: "system", label: "System & Retention", desc: "Retention window & storage purge", icon: DatabaseZap },
            ].map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as any)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all hover:bg-muted/40 cursor-pointer select-none whitespace-nowrap shrink-0 lg:w-full",
                    isActive
                      ? "bg-muted/80 text-foreground font-medium shadow-xs border-b-2 border-primary rounded-b-none lg:border-b-0 lg:border-l-2 lg:border-primary lg:rounded-l-none"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", isActive ? "text-primary animate-pulse" : "text-muted-foreground/80")} />
                  <div className="hidden sm:block text-left">
                    <div className="text-xs font-semibold">{tab.label}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">{tab.desc}</div>
                  </div>
                  <div className="sm:hidden text-xs font-semibold">{tab.label.split(" ")[0]}</div>
                </button>
              )
            })}
          </aside>

          {/* Main content area */}
          <div className="flex-1 min-w-0 space-y-6">
            {activeTab === "notifications" && (
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
                      <ConfiguredDot
                        configured={Boolean(
                          notificationSettings?.smtp.addrConfigured &&
                            notificationSettings?.smtp.fromConfigured &&
                            notificationSettings?.smtp.toConfigured
                        )}
                      />
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
                          <p className="text-xs text-muted-foreground">
                            Use no-auth SMTP by leaving username and password blank.
                          </p>
                        </div>
                        <ConfiguredDot
                          configured={Boolean(
                            notificationSettings?.smtp.addrConfigured &&
                              notificationSettings?.smtp.fromConfigured &&
                              notificationSettings?.smtp.toConfigured
                          )}
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">SMTP host</span>
                          <Input
                            value={form.smtpHost}
                            onChange={(event) => update({ smtpHost: event.target.value })}
                            placeholder="smtp.freesmtpservers.com"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">Port</span>
                          <Input
                            value={form.smtpPort}
                            onChange={(event) => update({ smtpPort: event.target.value })}
                            placeholder="25"
                          />
                        </div>
                      </div>
                      <div className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">From address</span>
                        <Input
                          value={form.smtpFrom}
                          onChange={(event) => update({ smtpFrom: event.target.value })}
                          placeholder={
                            notificationSettings?.smtp.fromConfigured
                              ? "Configured, enter a new value to replace"
                              : "pulse-alerts@example.com"
                          }
                        />
                      </div>
                      <div className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">Recipients</span>
                        <Input
                          value={form.smtpTo}
                          onChange={(event) => update({ smtpTo: event.target.value })}
                          placeholder={
                            notificationSettings?.smtp.toConfigured
                              ? "Configured, enter comma-separated replacements"
                              : "oncall@example.com, platform@example.com"
                          }
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">SMTP username</span>
                          <Input
                            value={form.smtpUser}
                            onChange={(event) => update({ smtpUser: event.target.value })}
                            placeholder="Optional"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">SMTP password</span>
                          <Input
                            type="password"
                            value={form.smtpPassword}
                            onChange={(event) => update({ smtpPassword: event.target.value })}
                            placeholder={notificationSettings?.smtp.passwordConfigured ? "Configured" : "Optional"}
                          />
                        </div>
                      </div>
                    </section>

                    <section className="space-y-4 rounded-md border bg-muted/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h2 className="text-sm font-semibold">Slack webhook</h2>
                          <p className="text-xs text-muted-foreground">
                            Paste an incoming webhook URL from Slack app settings.
                          </p>
                        </div>
                        <ConfiguredDot configured={Boolean(notificationSettings?.slack.webhookConfigured)} />
                      </div>
                      <div className="block space-y-1.5">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">
                          Incoming webhook URL
                        </span>
                        <Input
                          type="password"
                          value={form.slackWebhookUrl}
                          onChange={(event) => update({ slackWebhookUrl: event.target.value })}
                          placeholder={
                            notificationSettings?.slack.webhookConfigured
                              ? "Configured, paste a new URL to replace"
                              : "https://hooks.slack.com/services/..."
                          }
                        />
                      </div>
                      <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
                        Your Slack channel link opens the channel, but Pulse needs a Slack incoming webhook URL.
                        Create one from Slack API app settings, then select the target channel during webhook setup.
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
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase",
                                delivery.status === "sent"
                                  ? "border-emerald-500/20 text-emerald-600"
                                  : delivery.status === "failed"
                                    ? "border-destructive/20 text-destructive"
                                    : "border-border text-muted-foreground"
                              )}
                            >
                              {delivery.status}
                            </span>
                            <span>{delivery.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={sendTestAlert}
                      disabled={testing || saving}
                      className="gap-2 cursor-pointer"
                    >
                      {testing ? <RotateCw className="size-4 animate-spin" /> : <BellRing className="size-4" />}
                      Send test alert
                    </Button>
                    <Button onClick={save} disabled={saving || testing} className="gap-2 cursor-pointer">
                      {saving ? <RotateCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                      Save notification settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === "certificates" && (
              <Card>
                <CardHeader className="border-b pb-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base font-semibold">
                        <FileKey className="size-4 text-primary" />
                        Client certificates
                      </CardTitle>
                      <CardDescription>
                        Configure host-level client certificates. Request steps can use the matching profile automatically or override it.
                      </CardDescription>
                    </div>
                    <ConfiguredDot configured={certificateProfiles.length > 0} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 pt-5">
                  <div className="grid gap-6 lg:grid-cols-[1.2fr_1.8fr]">
                    <section className="space-y-4 rounded-xl border bg-muted/5 p-5">
                      <div>
                        <h2 className="text-sm font-semibold flex items-center gap-2">
                          <Lock className="size-4 text-primary" />
                          {editingCertificateId ? "Edit Certificate Profile" : "Add Certificate Profile"}
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Match by host and port to automatically authenticate monitor requests.
                        </p>
                      </div>
                      
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">Profile name</span>
                          <Input
                            value={certificateForm.name}
                            onChange={(event) => updateCertificate({ name: event.target.value })}
                            placeholder="CertaaS Search API"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">Type</span>
                          <Select
                            value={certificateForm.certType}
                            onValueChange={(val) => updateCertificate({ certType: val as "pem" | "pfx" })}
                          >
                            <SelectTrigger className="w-full h-9">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pem">CRT + KEY</SelectItem>
                              <SelectItem value="pfx">PFX / P12</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">Host</span>
                          <Input
                            value={certificateForm.host}
                            onChange={(event) => updateCertificate({ host: event.target.value })}
                            placeholder="certaasapi.aexp.com"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">Port</span>
                          <Input
                            value={String(certificateForm.port || 443)}
                            onChange={(event) => updateCertificate({ port: Number(event.target.value) || 443 })}
                            placeholder="443"
                          />
                        </div>
                      </div>

                      {certificateForm.certType === "pem" ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <PremiumFilePicker
                            id="crt-file"
                            label="CRT file"
                            accept=".crt,.cer,.pem"
                            value={certificateForm.certFile}
                            isConfigured={Boolean(activeEditingProfile?.certSecretAlias)}
                            onChange={(certFile) => updateCertificate({ certFile })}
                            onClear={() => updateCertificate({ certFile: undefined })}
                          />
                          <PremiumFilePicker
                            id="key-file"
                            label="KEY file"
                            accept=".key,.pem"
                            value={certificateForm.keyFile}
                            isConfigured={Boolean(activeEditingProfile?.keySecretAlias)}
                            onChange={(keyFile) => updateCertificate({ keyFile })}
                            onClear={() => updateCertificate({ keyFile: undefined })}
                          />
                        </div>
                      ) : (
                        <PremiumFilePicker
                          id="pfx-file"
                          label="PFX/P12 file"
                          accept=".pfx,.p12"
                          readMode="base64"
                          value={certificateForm.pfxFile}
                          isConfigured={Boolean(activeEditingProfile?.pfxSecretAlias)}
                          onChange={(pfxFile) => updateCertificate({ pfxFile })}
                          onClear={() => updateCertificate({ pfxFile: undefined })}
                        />
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <PremiumFilePicker
                          id="ca-cert-file"
                          label="CA cert file"
                          accept=".crt,.cer,.pem"
                          value={certificateForm.caCertFile}
                          isConfigured={Boolean(activeEditingProfile?.caCertSecretAlias)}
                          onChange={(caCertFile) => updateCertificate({ caCertFile })}
                          onClear={() => updateCertificate({ caCertFile: undefined })}
                        />
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">Passphrase</span>
                          <Input
                            type="password"
                            value={certificateForm.passphrase ?? ""}
                            onChange={(event) => updateCertificate({ passphrase: event.target.value })}
                            placeholder={activeEditingProfile?.passphraseSecretAlias ? "Configured" : "Optional"}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-muted/5 p-3 text-xs text-muted-foreground space-y-2">
                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                          <Checkbox
                            checked={certificateForm.isActive}
                            onCheckedChange={(checked) => updateCertificate({ isActive: !!checked })}
                          />
                          <div className="space-y-0.5 -mt-0.5">
                            <span className="font-semibold text-foreground">Active Profile</span>
                            <p className="text-[10px] text-muted-foreground leading-tight">When checked, matching requests automatically use this profile.</p>
                          </div>
                        </label>
                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                          <Checkbox
                            checked={certificateForm.insecureSkipVerify}
                            onCheckedChange={(checked) => updateCertificate({ insecureSkipVerify: !!checked })}
                          />
                          <div className="space-y-0.5 -mt-0.5">
                            <span className="font-semibold text-foreground">Skip TLS Verification</span>
                            <p className="text-[10px] text-muted-foreground leading-tight">Skip verification of server certificates (useful for self-signed certs in dev environments).</p>
                          </div>
                        </label>
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">
                        {editingCertificateId ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="cursor-pointer"
                            onClick={() => {
                              setEditingCertificateId(null)
                              setCertificateForm({
                                name: "",
                                host: "",
                                port: 443,
                                certType: "pem",
                                insecureSkipVerify: false,
                                isActive: true,
                              })
                            }}
                          >
                            Cancel edit
                          </Button>
                        ) : null}
                        <Button
                          onClick={saveCertificate}
                          disabled={savingCertificate}
                          className="gap-2 cursor-pointer"
                        >
                          {savingCertificate ? <RotateCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                          Save Certificate
                        </Button>
                      </div>
                    </section>

                    <section className="space-y-3 rounded-xl border bg-muted/5 p-5">
                      <div>
                        <h2 className="text-sm font-semibold">Configured TLS Profiles</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Active certificate profiles matched automatically by target endpoint.
                        </p>
                      </div>
                      {certificateProfiles.length ? (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                          {certificateProfiles.map((profile) => (
                            <div
                              key={profile.id}
                              className="relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 transition-all hover:shadow-xs hover:border-border/100"
                            >
                              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1.5 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-sm text-foreground truncate">{profile.name}</span>
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                        profile.isActive
                                          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                                          : "border-border bg-muted text-muted-foreground"
                                      )}
                                    >
                                      <span className={cn("size-1 rounded-full", profile.isActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50")} />
                                      {profile.isActive ? "Active" : "Inactive"}
                                    </span>
                                    {profile.insecureSkipVerify && (
                                      <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-mono border border-amber-500/20 flex items-center gap-1">
                                        <AlertTriangle className="size-2.5" />
                                        Skip Verify
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-md border border-border/20 w-fit">
                                    <Globe className="size-3 text-muted-foreground/80" />
                                    <span className="truncate">{profile.host}:{profile.port}</span>
                                    <span className="text-muted-foreground/30">|</span>
                                    <span className="uppercase text-[9px] font-bold tracking-wider">{profile.certType === "pfx" ? "PFX/P12" : "CRT + KEY"}</span>
                                  </div>
                                  
                                  {/* File configuration details */}
                                  <div className="flex flex-wrap gap-1 pt-0.5">
                                    {profile.certType === "pem" ? (
                                      <>
                                        <span
                                          className={cn(
                                            "px-1.5 py-0.5 rounded text-[10px] font-mono border",
                                            profile.certSecretAlias
                                              ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                              : "bg-muted text-muted-foreground border-border"
                                          )}
                                        >
                                          CRT: {profile.certSecretAlias ? "Loaded" : "Missing"}
                                        </span>
                                        <span
                                          className={cn(
                                            "px-1.5 py-0.5 rounded text-[10px] font-mono border",
                                            profile.keySecretAlias
                                              ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                              : "bg-muted text-muted-foreground border-border"
                                          )}
                                        >
                                          KEY: {profile.keySecretAlias ? "Loaded" : "Missing"}
                                        </span>
                                      </>
                                    ) : (
                                      <span
                                        className={cn(
                                          "px-1.5 py-0.5 rounded text-[10px] font-mono border",
                                          profile.pfxSecretAlias
                                            ? "bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
                                            : "bg-muted text-muted-foreground border-border"
                                        )}
                                      >
                                        PFX: {profile.pfxSecretAlias ? "Loaded" : "Missing"}
                                      </span>
                                    )}
                                    {profile.caCertSecretAlias && (
                                      <span className="bg-amber-500/5 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-mono border border-amber-500/20">
                                        CA Cert
                                      </span>
                                    )}
                                    {profile.passphraseSecretAlias && (
                                      <span className="bg-slate-500/5 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-500/20">
                                        Passphrase
                                      </span>
                                    )}
                                  </div>
                                  
                                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 pt-1">
                                    <Clock className="size-3" />
                                    {profile.lastTestedAt ? `Validated ${new Date(profile.lastTestedAt).toLocaleString()}` : "Never validated"}
                                  </p>
                                </div>
                                
                                <div className="flex flex-wrap gap-1.5 sm:self-start shrink-0">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1 cursor-pointer"
                                    onClick={() => editCertificate(profile)}
                                  >
                                    <Edit3 className="size-3.5" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs gap-1 cursor-pointer"
                                    onClick={() => testCertificate(profile)}
                                    disabled={testingCertificateId === profile.id}
                                  >
                                    {testingCertificateId === profile.id ? (
                                      <RotateCw className="size-3.5 animate-spin" />
                                    ) : (
                                      <Play className="size-3.5 text-primary" />
                                    )}
                                    Test
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer"
                                    onClick={() => onDeleteCertificateProfile(profile.id)}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed bg-background p-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
                          <Lock className="size-6 text-muted-foreground/50" />
                          <div>No client certificates configured yet.</div>
                        </div>
                      )}
                    </section>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === "maintenance" && (
              <MaintenanceWindowsPanel applications={applications} monitors={monitors} />
            )}

            {activeTab === "system" && (
              <div className="space-y-6">
                <Card>
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
                    <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer select-none">
                      <Switch
                        checked={retention.enabled}
                        onCheckedChange={(checked) => setRetention((current) => ({ ...current, enabled: !!checked }))}
                      />
                      Enable automatic purge (hourly)
                    </label>
                    <div className="block space-y-1.5 max-w-xs">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Retention window</span>
                      <Select
                        value={String(retention.runsRetentionDays)}
                        onValueChange={(val) =>
                          setRetention((current) => ({
                            ...current,
                            runsRetentionDays: Number(val),
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select window" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 days</SelectItem>
                          <SelectItem value="90">90 days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {purgeResult ? (
                      <p className="text-xs text-muted-foreground font-medium">
                        Last purge removed {purgeResult.deleted} run{purgeResult.deleted === 1 ? "" : "s"}.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        variant="outline"
                        onClick={saveRetention}
                        disabled={savingRetention || purging}
                        className="gap-2 cursor-pointer"
                      >
                        {savingRetention ? <RotateCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                        Save retention
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={purgeNow}
                        disabled={purging || savingRetention}
                        className="gap-2 cursor-pointer"
                      >
                        {purging ? <RotateCw className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        Purge expired runs now
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <Section title="Scheduler" icon={Clock}>
                    <div className="space-y-2">
                      <Field label="Timing" value="Configurable: manual, fixed intervals, custom cron" />
                      <Field label="Duplicate prevention" value="Reserve monitor/run key before queue enqueue" />
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
            )}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
