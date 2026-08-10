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
  ScrollText,
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
  ElfProxySettings,
  ElfProxySettingsInput,
} from "@/lib/pulse-types"
import { notifyPulseToast } from "@/components/pulse/pulse-toast-queue"
import { MaintenanceWindowsPanel } from "../../maintenance-windows-panel"
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  ListBox,
  Select,
  Switch,
  Tabs,
  TextField,
} from "@workspace/ui/components/ui"
import { cn } from "@workspace/ui/lib/utils"
import { Field, PageShell, Section } from "../layout"

const settingsTabs = [
  { key: "notifications" as const, label: "Notifications & Alerts", desc: "SMTP and Slack configuration", icon: BellRing },
  { key: "certificates" as const, label: "Client Certificates", desc: "mTLS profiles for secure steps", icon: FileKey },
  { key: "maintenance" as const, label: "Maintenance Windows", desc: "Scheduled monitor blackouts", icon: Clock },
  { key: "system" as const, label: "System & Retention", desc: "Retention window & storage purge", icon: DatabaseZap },
  { key: "elf" as const, label: "ELF Proxy", desc: "Log search proxy for deployment checks", icon: ScrollText },
]

function SettingsTextField({
  label,
  className,
  description,
  ...inputProps
}: { label: string; className?: string; description?: string } & React.ComponentProps<typeof Input>) {
  return (
    <TextField className={cn("w-full min-w-0 flex flex-col gap-1.5", className)}>
      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input variant="secondary" fullWidth {...inputProps} className="h-10 text-sm" />
      {description && <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">{description}</p>}
    </TextField>
  )
}

function SettingsSelect({
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
      {description && <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">{description}</p>}
    </Select>
  )
}

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
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider shadow-xs",
      configured
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : "border-slate-400/40 bg-slate-500/10 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/15 dark:text-slate-300"
    )}>
      <span className={cn(
        "size-1.5 rounded-full ring-2",
        configured
          ? "bg-emerald-500 ring-emerald-500/20 animate-pulse"
          : "bg-slate-400 ring-slate-400/20 dark:bg-slate-500 dark:ring-slate-500/20"
      )} />
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
  description?: string
}

function PremiumFilePicker({
  id,
  label,
  accept,
  value,
  onChange,
  onClear,
  isConfigured,
  readMode = "text",
  description
}: PremiumFilePickerProps) {
  const [fileName, setFileName] = useState<string>("")

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className={cn(
        "relative flex items-center justify-between gap-3 rounded-xl border border-dashed p-3 transition-all text-xs bg-background/50 hover:bg-background/80",
        value || isConfigured 
          ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300" 
          : "border-border/60 hover:border-border"
      )}>
        <div className="flex items-center gap-2.5 min-w-0">
          {value || isConfigured ? (
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <ShieldCheck className="size-4" />
            </div>
          ) : (
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/5 border border-primary/10 text-primary/80">
              <Upload className="size-4" />
            </div>
          )}
          <span className="truncate font-semibold text-foreground">
            {fileName ? fileName : (value ? "File selected" : (isConfigured ? "Configured (encrypted)" : "No file chosen"))}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(value || isConfigured) && (
            <Button
              type="button"
              variant="ghost"
              isIconOnly
              size="sm"
              className="size-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer rounded-lg"
              onPress={() => {
                setFileName("")
                onClear()
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <label className="relative inline-flex h-8 items-center justify-center rounded-lg bg-background border border-border/80 hover:border-border hover:bg-accent px-3 text-[11px] font-semibold text-foreground shadow-xs transition-colors cursor-pointer select-none">
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
      {description && <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">{description}</p>}
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
  elfProxySettings = null,
  onSaveElfProxySettings,
  onTestElfProxySettings,
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
  elfProxySettings?: ElfProxySettings | null
  onSaveElfProxySettings: (input: ElfProxySettingsInput) => Promise<ElfProxySettings | null>
  onTestElfProxySettings: (input: {
    baseUrl?: string
    indexPathTemplate?: string
    elfAppId?: string
    pretty?: boolean
  }) => Promise<{
    ok: boolean
    curl?: string
    searchUrl?: string
    indexPath?: string
    error?: string
    result?: import("@/lib/pulse-types").ElfQueryRunResult
  }>
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
      const successMessage = "Notification settings saved. Existing configured values remain masked."
      setMessage(successMessage)
      notifyPulseToast("success", "Notification settings saved", successMessage)
      setForm({ ...defaultNotificationInput, smtpFrom: "", smtpTo: "", smtpUser: "", smtpPassword: "", slackWebhookUrl: "" })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save notification settings."
      setError(message)
      notifyPulseToast("danger", "Failed to save notification settings", message)
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
        const successMessage = "Test alert sent on at least one channel. Check Slack and your inbox."
        setMessage(successMessage)
        notifyPulseToast("success", "Test alert sent", successMessage)
      } else {
        const message = "Test alert did not deliver on any channel. Review configuration and delivery details below."
        setError(message)
        notifyPulseToast("warning", "Test alert not delivered", message)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send test alert."
      setError(message)
      notifyPulseToast("danger", "Failed to send test alert", message)
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
      const successMessage = `Run retention updated to ${updated.runsRetentionDays} days.`
      setMessage(successMessage)
      notifyPulseToast("success", "Retention settings saved", successMessage)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save retention settings."
      setError(message)
      notifyPulseToast("danger", "Failed to save retention settings", message)
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
        const successMessage = `Purged ${result.deleted} monitor runs older than ${result.runsRetentionDays ?? retention.runsRetentionDays} days.`
        setMessage(successMessage)
        notifyPulseToast("success", "Expired runs purged", successMessage)
      } else {
        const successMessage = result.message || "No expired monitor runs found to purge."
        setMessage(successMessage)
        notifyPulseToast("info", "Nothing to purge", successMessage)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to purge expired runs."
      setError(message)
      notifyPulseToast("danger", "Failed to purge expired runs", message)
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
      const successMessage = "Certificate profile saved."
      setMessage(successMessage)
      notifyPulseToast(
        "success",
        editingCertificateId ? "Certificate profile updated" : "Certificate profile saved",
        certificateForm.name ? `${certificateForm.name} saved successfully.` : successMessage,
      )
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
      const message = err instanceof Error ? err.message : "Failed to save certificate profile."
      setError(message)
      notifyPulseToast("danger", "Failed to save certificate profile", message)
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
        const successMessage = `Certificate profile "${profile.name}" is valid.`
        setMessage(successMessage)
        notifyPulseToast("success", "Certificate test passed", successMessage)
      } else {
        const message = `Certificate profile "${profile.name}" did not validate.`
        setError(message)
        notifyPulseToast("warning", "Certificate test failed", message)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to test certificate profile."
      setError(message)
      notifyPulseToast("danger", "Failed to test certificate profile", message)
    } finally {
      setTestingCertificateId(null)
    }
  }

  const deleteCertificate = async (profile: CertificateProfile) => {
    setMessage("")
    setError("")
    try {
      await onDeleteCertificateProfile(profile.id)
      const successMessage = `Certificate profile "${profile.name}" deleted.`
      setMessage(successMessage)
      notifyPulseToast("success", "Certificate profile deleted", successMessage)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete certificate profile."
      setError(message)
      notifyPulseToast("danger", "Failed to delete certificate profile", message)
    }
  }

  const [elfForm, setElfForm] = useState<ElfProxySettingsInput>({
    baseUrl: elfProxySettings?.baseUrl || "https://elfproxy-dev.aexp.com",
    indexPathTemplate: elfProxySettings?.indexPathTemplate || "",
    pretty: elfProxySettings?.pretty ?? true,
    timeoutSeconds: elfProxySettings?.timeoutSeconds || 30,
    bearerToken: "",
    basicAuthUsername: elfProxySettings?.basicAuthUsername || "",
    basicAuthPassword: "",
  })
  const [elfTestIndexPattern, setElfTestIndexPattern] = useState("")
  const [elfTestAppId, setElfTestAppId] = useState("")
  const [elfTestCurl, setElfTestCurl] = useState<string | null>(null)
  const [savingElf, setSavingElf] = useState(false)
  const [testingElf, setTestingElf] = useState(false)
  const [activeTab, setActiveTab] = useState<"notifications" | "certificates" | "maintenance" | "system" | "elf">("notifications")
  const activeEditingProfile = certificateProfiles.find((p) => p.id === editingCertificateId)

  const tabDescriptions = {
    notifications: "Configure alert delivery channels (SMTP email, Slack webhooks) for monitor failures.",
    certificates: "Manage mutual TLS client certificates for secure monitor requests.",
    maintenance: "Schedule blackout windows to prevent alert dispatching during system maintenance.",
    system: "Configure data retention windows, manual storage purging, and view scheduler settings.",
    elf: "Configure the company ELF/OpenSearch proxy used for deployment log validation queries.",
  }

  useEffect(() => {
    if (!elfProxySettings) return
    setElfForm((current) => ({
      ...current,
      baseUrl: elfProxySettings.baseUrl,
      indexPathTemplate: elfProxySettings.indexPathTemplate,
      pretty: elfProxySettings.pretty,
      timeoutSeconds: elfProxySettings.timeoutSeconds,
      basicAuthUsername: elfProxySettings.basicAuthUsername || "",
    }))
  }, [elfProxySettings])

  const saveElfProxy = async () => {
    setSavingElf(true)
    setMessage("")
    setError("")
    try {
      await onSaveElfProxySettings(elfForm)
      const successMessage = "ELF proxy settings saved."
      setMessage(successMessage)
      notifyPulseToast("success", "ELF proxy settings saved", successMessage)
      setElfForm((current) => ({ ...current, bearerToken: "", basicAuthPassword: "" }))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save ELF proxy settings."
      setError(message)
      notifyPulseToast("danger", "Failed to save ELF proxy settings", message)
    } finally {
      setSavingElf(false)
    }
  }

  const testElfProxy = async () => {
    const indexPattern = elfTestIndexPattern.trim() || elfForm.indexPathTemplate?.trim() || ""
    if (!indexPattern) {
      const message = "Index pattern is required to test connectivity (for example app-logs-*)."
      setError(message)
      notifyPulseToast("warning", "Index pattern required", message)
      return
    }
    if (indexPattern.includes("{{elfAppId}}") && !elfTestAppId.trim()) {
      const message = "ELF app ID is required because your index pattern contains {{elfAppId}}."
      setError(message)
      notifyPulseToast("warning", "ELF app ID required", message)
      return
    }
    setTestingElf(true)
    setMessage("")
    setError("")
    setElfTestCurl(null)
    try {
      const result = await onTestElfProxySettings({
        baseUrl: elfForm.baseUrl?.trim() || undefined,
        indexPathTemplate: indexPattern,
        elfAppId: elfTestAppId.trim() || undefined,
        pretty: elfForm.pretty,
      })
      if (result.curl) {
        setElfTestCurl(result.curl)
      }
      if (result.ok) {
        const successMessage = "ELF proxy connectivity test succeeded."
        setMessage(successMessage)
        notifyPulseToast("success", "ELF proxy test passed", successMessage)
      } else {
        const message =
          result.error ||
          result.result?.errorMessage ||
          "ELF proxy connectivity test failed."
        setError(message)
        notifyPulseToast("danger", "ELF proxy test failed", message)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to test ELF proxy."
      setError(message)
      notifyPulseToast("danger", "Failed to test ELF proxy", message)
    } finally {
      setTestingElf(false)
    }
  }

  return (
    <PageShell
      eyebrow="Console settings"
      title="Settings"
      description={tabDescriptions[activeTab]}
    >
      <div className="space-y-6">
        {message ? (
          <Alert status="success">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{message}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {error ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        <Tabs
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(String(key) as typeof activeTab)}
          variant="secondary"
        >
          <Tabs.ListContainer >
            <Tabs.List aria-label="Settings sections" >
              {settingsTabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <Tabs.Tab
                    key={tab.key}
                    id={tab.key}
                    className=" gap-2"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground data-[selected=true]:text-primary" />
                    <span className="text-xs font-semibold text-foreground">{tab.label}</span>
                    <Tabs.Indicator className="bg-primary" />
                  </Tabs.Tab>
                )
              })}
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="notifications" className="w-full min-w-0 pt-2">
            <Card className="w-full border-border/40 rounded-2xl">
              <Card.Header className="border-b pb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <Card.Title className="flex items-center gap-2 text-base font-semibold">
                      <Mail className="size-4 text-primary" />
                      Alert delivery
                    </Card.Title>
                    <Card.Description>
                      Saved values are stored as encrypted secret references and are not returned by the API.
                    </Card.Description>
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
              </Card.Header>
              <Card.Content className="space-y-6 pt-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <section className="space-y-5 rounded-2xl border border-border/30 bg-background p-6 shadow-xs">
                    <div className="flex items-center justify-between gap-3 border-b border-border/20 pb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">SMTP Email</h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
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
                    <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                      <SettingsTextField
                        label="SMTP host"
                        value={form.smtpHost}
                        onChange={(event) => update({ smtpHost: event.target.value })}
                        placeholder="smtp.freesmtpservers.com"
                      />
                      <SettingsTextField
                        label="Port"
                        value={form.smtpPort}
                        onChange={(event) => update({ smtpPort: event.target.value })}
                        placeholder="25"
                      />
                    </div>
                    <SettingsTextField
                      label="From address"
                      value={form.smtpFrom}
                      onChange={(event) => update({ smtpFrom: event.target.value })}
                      placeholder={
                        notificationSettings?.smtp.fromConfigured
                          ? "Configured, enter a new value to replace"
                          : "pulse-alerts@example.com"
                      }
                    />
                    <SettingsTextField
                      label="Recipients"
                      value={form.smtpTo}
                      onChange={(event) => update({ smtpTo: event.target.value })}
                      placeholder={
                        notificationSettings?.smtp.toConfigured
                          ? "Configured, enter comma-separated replacements"
                          : "oncall@example.com, platform@example.com"
                      }
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <SettingsTextField
                        label="SMTP username"
                        value={form.smtpUser}
                        onChange={(event) => update({ smtpUser: event.target.value })}
                        placeholder="Optional"
                      />
                      <SettingsTextField
                        label="SMTP password"
                        type="password"
                        value={form.smtpPassword}
                        onChange={(event) => update({ smtpPassword: event.target.value })}
                        placeholder={notificationSettings?.smtp.passwordConfigured ? "Configured" : "Optional"}
                      />
                    </div>
                  </section>

                  <section className="space-y-5 rounded-2xl border border-border/30 bg-background p-6 shadow-xs">
                    <div className="flex items-center justify-between gap-3 border-b border-border/20 pb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Slack Webhook</h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Paste an incoming webhook URL from Slack app settings.
                        </p>
                      </div>
                      <ConfiguredDot configured={Boolean(notificationSettings?.slack.webhookConfigured)} />
                    </div>
                    <SettingsTextField
                      label="Incoming webhook URL"
                      type="password"
                      value={form.slackWebhookUrl}
                      onChange={(event) => update({ slackWebhookUrl: event.target.value })}
                      placeholder={
                        notificationSettings?.slack.webhookConfigured
                          ? "Configured, paste a new URL to replace"
                          : "https://hooks.slack.com/services/..."
                      }
                    />
                    <div className="rounded-xl border border-border/40 bg-background/50 p-4 text-[11px] leading-relaxed text-muted-foreground">
                      Your Slack channel link opens the channel, but Pulse needs a Slack incoming webhook URL.
                      Create one from Slack API app settings, then select the target channel during webhook setup.
                    </div>
                  </section>
                </div>

                {testResult ? (
                  <div className="rounded-xl border border-border/50 bg-muted/15 p-4 text-sm space-y-3">
                    <p className="font-semibold text-foreground flex items-center gap-2">
                      <Sliders className="size-4 text-primary" />
                      Test delivery results
                    </p>
                    <ul className="space-y-2">
                      {testResult.deliveries.map((delivery) => (
                        <li key={`${delivery.channel}-${delivery.sentAt}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/10 pb-2 last:border-b-0 last:pb-0">
                          <div className="flex items-center gap-2.5">
                            <span className="font-semibold text-foreground text-xs">{delivery.channel}</span>
                            <span className="text-xs text-muted-foreground">{delivery.detail}</span>
                          </div>
                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                              delivery.status === "sent"
                                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
                                : delivery.status === "failed"
                                  ? "border-destructive/20 bg-destructive/5 text-destructive"
                                  : "border-border text-muted-foreground"
                            )}
                          >
                            {delivery.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="flex flex-wrap justify-end gap-3 border-t border-border/20 pt-4">
                  <Button
                    variant="outline"
                    onPress={sendTestAlert}
                    isDisabled={testing || saving}
                    className="gap-2 cursor-pointer rounded-xl h-10 px-4"
                  >
                    {testing ? <RotateCw className="size-4 animate-spin" /> : <BellRing className="size-4" />}
                    Send test alert
                  </Button>
                  <Button onPress={save} isDisabled={saving || testing} className="gap-2 cursor-pointer rounded-xl h-10 px-4">
                    {saving ? <RotateCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                    Save settings
                  </Button>
                </div>
              </Card.Content>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel id="certificates" className="w-full min-w-0 pt-2">
            <Card className="w-full border-border/40 rounded-2xl">
              <Card.Header className="border-b pb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <Card.Title className="flex items-center gap-2 text-base font-semibold">
                      <FileKey className="size-4 text-primary" />
                      Client certificates
                    </Card.Title>
                    <Card.Description>
                      Configure host-level client certificates. Request steps can use the matching profile automatically or override it.
                    </Card.Description>
                  </div>
                  <ConfiguredDot configured={certificateProfiles.length > 0} />
                </div>
              </Card.Header>
              <Card.Content className="space-y-6 pt-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <section className="space-y-5 rounded-2xl border border-border/30 bg-background p-6 shadow-xs h-fit">
                    <div className="border-b border-border/20 pb-3">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Lock className="size-4 text-primary" />
                        {editingCertificateId ? "Edit Certificate Profile" : "Add Certificate Profile"}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Match by host and port to automatically authenticate monitor requests.
                      </p>
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      <SettingsTextField
                        label="Profile name"
                        value={certificateForm.name}
                        onChange={(event) => updateCertificate({ name: event.target.value })}
                        placeholder="CertaaS Search API"
                        description="Friendly name to identify this client certificate profile."
                      />
                      <SettingsSelect
                        label="Type"
                        selectedKey={certificateForm.certType}
                        onSelectionChange={(val) => updateCertificate({ certType: val as "pem" | "pfx" })}
                        options={[
                          { id: "pem", label: "CRT + KEY" },
                          { id: "pfx", label: "PFX / P12" },
                        ]}
                        description="Select PEM (CRT + KEY files) or PKCS#12 (PFX / P12) archive type."
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                      <SettingsTextField
                        label="Host"
                        value={certificateForm.host}
                        onChange={(event) => updateCertificate({ host: event.target.value })}
                        placeholder="certaasapi.aexp.com"
                        description="Domain name to match automatically during request steps."
                      />
                      <SettingsTextField
                        label="Port"
                        value={String(certificateForm.port || 443)}
                        onChange={(event) => updateCertificate({ port: Number(event.target.value) || 443 })}
                        placeholder="443"
                        description="Target port (default 443)."
                      />
                    </div>

                    {certificateForm.certType === "pem" ? (
                      <div className="flex flex-col gap-4">
                        <PremiumFilePicker
                          id="crt-file"
                          label="CRT file"
                          accept=".crt,.cer,.pem"
                          value={certificateForm.certFile}
                          isConfigured={Boolean(activeEditingProfile?.certSecretAlias)}
                          onChange={(certFile) => updateCertificate({ certFile })}
                          onClear={() => updateCertificate({ certFile: undefined })}
                          description="PEM-formatted public certificate file (.crt, .pem)."
                        />
                        <PremiumFilePicker
                          id="key-file"
                          label="KEY file"
                          accept=".key,.pem"
                          value={certificateForm.keyFile}
                          isConfigured={Boolean(activeEditingProfile?.keySecretAlias)}
                          onChange={(keyFile) => updateCertificate({ keyFile })}
                          onClear={() => updateCertificate({ keyFile: undefined })}
                          description="PEM-formatted private key file (.key, .pem)."
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
                        description="PKCS#12 archive containing both certificate and private key."
                      />
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <PremiumFilePicker
                        id="ca-cert-file"
                        label="CA cert file"
                        accept=".crt,.cer,.pem"
                        value={certificateForm.caCertFile}
                        isConfigured={Boolean(activeEditingProfile?.caCertSecretAlias)}
                        onChange={(caCertFile) => updateCertificate({ caCertFile })}
                        onClear={() => updateCertificate({ caCertFile: undefined })}
                        description="Optional custom Root/Intermediate CA bundle if needed."
                      />
                      <SettingsTextField
                        label="Passphrase"
                        type="password"
                        value={certificateForm.passphrase ?? ""}
                        onChange={(event) => updateCertificate({ passphrase: event.target.value })}
                        placeholder={activeEditingProfile?.passphraseSecretAlias ? "Configured" : "Optional"}
                        description="Optional password to decrypt private key or PFX archive."
                      />
                    </div>

                    <div className="flex flex-col gap-3.5 rounded-xl border border-border/40 bg-background/50 p-4 text-xs text-muted-foreground space-y-1">
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <Checkbox
                          isSelected={certificateForm.isActive}
                          onChange={(checked) => updateCertificate({ isActive: !!checked })}
                        >
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                        </Checkbox>
                        <div className="space-y-0.5 -mt-0.5">
                          <span className="font-semibold text-foreground">Active Profile</span>
                          <p className="text-[10px] text-muted-foreground leading-normal">When checked, matching requests automatically use this profile.</p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <Checkbox
                          isSelected={certificateForm.insecureSkipVerify}
                          onChange={(checked) => updateCertificate({ insecureSkipVerify: !!checked })}
                        >
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                        </Checkbox>
                        <div className="space-y-0.5 -mt-0.5">
                          <span className="font-semibold text-foreground">Skip TLS Verification</span>
                          <p className="text-[10px] text-muted-foreground leading-normal">Skip verification of server certificates (useful for self-signed certs in dev environments).</p>
                        </div>
                      </label>
                    </div>

                    <div className="flex flex-wrap justify-end gap-3 border-t border-border/20 pt-4">
                      {editingCertificateId ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="cursor-pointer rounded-xl h-10 px-4"
                          onPress={() => {
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
                          Cancel
                        </Button>
                      ) : null}
                      <Button
                        onPress={saveCertificate}
                        isDisabled={savingCertificate}
                        className="gap-2 cursor-pointer rounded-xl h-10 px-4"
                      >
                        {savingCertificate ? <RotateCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                        Save certificate
                      </Button>
                    </div>
                  </section>

                  <section className="space-y-5 rounded-2xl border border-border/30 bg-background p-6 shadow-xs">
                    <div className="border-b border-border/20 pb-3">
                      <h3 className="text-sm font-semibold text-foreground">Configured TLS Profiles</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Active certificate profiles matched automatically by target endpoint.
                      </p>
                    </div>
                    {certificateProfiles.length ? (
                      <div className="space-y-4 max-h-[560px] overflow-y-auto pr-1">
                        {certificateProfiles.map((profile) => (
                          <div
                            key={profile.id}
                            className="relative overflow-hidden rounded-xl border border-border/60 bg-background p-4.5 transition-all hover:shadow-xs hover:border-border/100"
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-2.5 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-sm text-foreground truncate">{profile.name}</span>
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                                      profile.isActive
                                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                                        : "border-border bg-muted text-muted-foreground"
                                    )}
                                  >
                                    <span className={cn("size-1 rounded-full", profile.isActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50")} />
                                    {profile.isActive ? "Active" : "Inactive"}
                                  </span>
                                  {profile.insecureSkipVerify && (
                                    <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border border-amber-500/20 flex items-center gap-1">
                                      <AlertTriangle className="size-2.5 animate-bounce" />
                                      Skip verify
                                    </span>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-lg border border-border/20 w-fit">
                                  <Globe className="size-3.5 text-muted-foreground/80" />
                                  <span className="truncate font-semibold">{profile.host}:{profile.port}</span>
                                  <span className="text-muted-foreground/30">|</span>
                                  <span className="uppercase text-[9px] font-bold tracking-wider">{profile.certType === "pfx" ? "PFX/P12" : "CRT+KEY"}</span>
                                </div>
                                
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  {profile.certType === "pem" ? (
                                    <>
                                      <span
                                        className={cn(
                                          "px-2 py-0.5 rounded text-[10px] font-mono font-medium border",
                                          profile.certSecretAlias
                                            ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/10"
                                            : "bg-muted text-muted-foreground border-border"
                                        )}
                                      >
                                        CRT: {profile.certSecretAlias ? "Loaded" : "Missing"}
                                      </span>
                                      <span
                                        className={cn(
                                          "px-2 py-0.5 rounded text-[10px] font-mono font-medium border",
                                          profile.keySecretAlias
                                            ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/10"
                                            : "bg-muted text-muted-foreground border-border"
                                        )}
                                      >
                                        KEY: {profile.keySecretAlias ? "Loaded" : "Missing"}
                                      </span>
                                    </>
                                  ) : (
                                    <span
                                      className={cn(
                                        "px-2 py-0.5 rounded text-[10px] font-mono font-medium border",
                                        profile.pfxSecretAlias
                                          ? "bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 border-indigo-500/10"
                                          : "bg-muted text-muted-foreground border-border"
                                      )}
                                    >
                                      PFX: {profile.pfxSecretAlias ? "Loaded" : "Missing"}
                                    </span>
                                  )}
                                  {profile.caCertSecretAlias && (
                                    <span className="bg-amber-500/5 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded text-[10px] font-mono border border-amber-500/10">
                                      CA Cert
                                    </span>
                                  )}
                                  {profile.passphraseSecretAlias && (
                                    <span className="bg-slate-500/5 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded text-[10px] font-mono border border-slate-500/10">
                                      Passphrase
                                    </span>
                                  )}
                                </div>
                                
                                <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 pt-1">
                                  <Clock className="size-3 text-muted-foreground/60" />
                                  {profile.lastTestedAt ? `Validated ${new Date(profile.lastTestedAt).toLocaleString()}` : "Never validated"}
                                </p>
                              </div>
                              
                              <div className="flex flex-wrap gap-1.5 sm:self-start shrink-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs gap-1.5 cursor-pointer rounded-lg"
                                  onPress={() => editCertificate(profile)}
                                >
                                  <Edit3 className="size-3.5 text-muted-foreground" />
                                  Edit
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs gap-1.5 cursor-pointer rounded-lg"
                                  onPress={() => testCertificate(profile)}
                                  isDisabled={testingCertificateId === profile.id}
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
                                  isIconOnly
                                  size="sm"
                                  className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer rounded-lg"
                                  onPress={() => void deleteCertificate(profile)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed bg-background/50 p-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
                        <Lock className="size-7 text-muted-foreground/45" />
                        <div className="font-semibold text-foreground">No client certificates</div>
                        <p className="text-xs text-muted-foreground max-w-xs leading-normal">
                          Client certificates configured here can automatically authenticate secure calls on target endpoints.
                        </p>
                      </div>
                    )}
                  </section>
                </div>
              </Card.Content>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel id="maintenance" className="w-full min-w-0 pt-2">
            <MaintenanceWindowsPanel applications={applications} monitors={monitors} />
          </Tabs.Panel>

          <Tabs.Panel id="system" className="w-full min-w-0 pt-2">
            <div className="space-y-6">
              <Card className="w-full border-border/40 rounded-2xl">
                <Card.Header className="border-b pb-4">
                  <Card.Title className="flex items-center gap-2 text-base font-semibold">
                    <DatabaseZap className="size-4 text-primary" />
                    Run retention
                  </Card.Title>
                  <Card.Description>
                    Automatically purge monitor runs older than the retention window to keep Postgres storage predictable.
                  </Card.Description>
                </Card.Header>
                <Card.Content className="space-y-5 pt-6">
                  <Switch
                    isSelected={retention.enabled}
                    onChange={(checked) => setRetention((current) => ({ ...current, enabled: !!checked }))}
                  >
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Switch.Content>
                      <Label className="text-sm font-medium">Enable automatic purge (hourly)</Label>
                    </Switch.Content>
                  </Switch>
                  <SettingsSelect
                    className="max-w-xs"
                    label="Retention window"
                    selectedKey={String(retention.runsRetentionDays)}
                    onSelectionChange={(val) =>
                      setRetention((current) => ({
                        ...current,
                        runsRetentionDays: Number(val),
                      }))
                    }
                    options={[
                      { id: "30", label: "30 days" },
                      { id: "90", label: "90 days" },
                    ]}
                  />
                  {purgeResult ? (
                    <p className="text-xs text-muted-foreground font-semibold bg-muted/30 px-3 py-2 rounded-lg border border-border/20 w-fit">
                      Last purge removed {purgeResult.deleted} run{purgeResult.deleted === 1 ? "" : "s"}.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button
                      variant="outline"
                      onPress={saveRetention}
                      isDisabled={savingRetention || purging}
                      className="gap-2 cursor-pointer rounded-xl h-10 px-4"
                    >
                      {savingRetention ? <RotateCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                      Save retention
                    </Button>
                    <Button
                      variant="secondary"
                      onPress={purgeNow}
                      isDisabled={purging || savingRetention}
                      className="gap-2 cursor-pointer rounded-xl h-10 px-4"
                    >
                      {purging ? <RotateCw className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      Purge expired runs now
                    </Button>
                  </div>
                </Card.Content>
              </Card>

              <div className="grid gap-6 md:grid-cols-2">
                <Section title="Scheduler" icon={Clock}>
                  <div className="space-y-3">
                    <Field label="Timing" value="Configurable: manual, fixed intervals, custom cron" />
                    <Field label="Duplicate prevention" value="Reserve monitor/run key before queue enqueue" />
                  </div>
                </Section>
                <Section title="Config editing" icon={Braces}>
                  <div className="space-y-3">
                    <Field label="Builder" value="Form UI plus raw JSON config preview/editing path" />
                    <Field label="Authentication" value="None for MVP local mode" />
                  </div>
                </Section>
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="elf" className="w-full min-w-0 pt-2">
            <Card className="w-full border-border/40 rounded-2xl">
              <Card.Header className="border-b pb-4">
                <Card.Title className="flex items-center gap-2 text-base font-semibold">
                  <ScrollText className="size-4 text-primary" />
                  ELF proxy
                </Card.Title>
                <Card.Description>
                  Base URL, authentication, and default OpenSearch index pattern for log queries (e.g.{" "}
                  <code>app-logs-*/_search</code>). Use bearer token or basic auth.
                </Card.Description>
              </Card.Header>
              <Card.Content className="space-y-5 pt-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <SettingsTextField
                    label="Base URL"
                    value={elfForm.baseUrl || ""}
                    onChange={(event) => setElfForm((current) => ({ ...current, baseUrl: event.target.value }))}
                    description="OpenSearch root URL. If the API runs in Docker and OpenSearch is on your Mac, use http://host.docker.internal:9200 — not localhost or 0.0.0.0."
                  />
                  <SettingsTextField
                    label="Default index pattern"
                    value={elfForm.indexPathTemplate || ""}
                    onChange={(event) => setElfForm((current) => ({ ...current, indexPathTemplate: event.target.value }))}
                    description="OpenSearch index pattern, e.g. app-logs-*. Optional {{elfAppId}} placeholder only if needed."
                  />
                  <SettingsTextField
                    label="Timeout (seconds)"
                    type="number"
                    value={String(elfForm.timeoutSeconds || 30)}
                    onChange={(event) => setElfForm((current) => ({ ...current, timeoutSeconds: Number(event.target.value) }))}
                  />
                </div>

                <section className="space-y-4 rounded-2xl border border-border/30 bg-background p-5 shadow-xs">
                  <div className="border-b border-border/20 pb-3">
                    <h3 className="text-sm font-semibold text-foreground">Authentication</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Configure bearer token or HTTP basic auth. Bearer is used when both are set.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <SettingsTextField
                      label="Bearer token"
                      type="password"
                      value={elfForm.bearerToken || ""}
                      onChange={(event) => setElfForm((current) => ({ ...current, bearerToken: event.target.value }))}
                      description={
                        elfProxySettings?.bearerTokenConfigured
                          ? "Token configured. Leave blank to keep existing."
                          : "Optional if basic auth is configured."
                      }
                    />
                    <div className="hidden md:block" />
                    <SettingsTextField
                      label="Basic auth username"
                      value={elfForm.basicAuthUsername || ""}
                      onChange={(event) =>
                        setElfForm((current) => ({ ...current, basicAuthUsername: event.target.value }))
                      }
                      placeholder="proxy-user"
                      description="Username for HTTP basic authentication."
                    />
                    <SettingsTextField
                      label="Basic auth password"
                      type="password"
                      value={elfForm.basicAuthPassword || ""}
                      onChange={(event) =>
                        setElfForm((current) => ({ ...current, basicAuthPassword: event.target.value }))
                      }
                      placeholder={
                        elfProxySettings?.basicAuthPasswordConfigured ? "Configured" : "Required with username"
                      }
                      description={
                        elfProxySettings?.basicAuthPasswordConfigured
                          ? "Password configured. Leave blank to keep existing."
                          : "Stored encrypted; not returned by the API."
                      }
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Bearer token:{" "}
                    <span className="font-semibold text-foreground">
                      {elfProxySettings?.bearerTokenConfigured ? "configured" : "not set"}
                    </span>
                    {" · "}
                    Basic auth:{" "}
                    <span className="font-semibold text-foreground">
                      {elfProxySettings?.basicAuthUsername && elfProxySettings?.basicAuthPasswordConfigured
                        ? "configured"
                        : "not set"}
                    </span>
                  </p>
                </section>
                <Switch
                  isSelected={elfForm.pretty ?? true}
                  onChange={(checked) => setElfForm((current) => ({ ...current, pretty: checked }))}
                >
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                  <Switch.Content><Label className="text-sm">Append ?pretty to search requests</Label></Switch.Content>
                </Switch>
                <div className="flex flex-wrap gap-2">
                  <Button onPress={saveElfProxy} isDisabled={savingElf}>{savingElf ? "Saving…" : "Save ELF settings"}</Button>
                </div>
                <div className="rounded-2xl border border-border/30 bg-background p-4 space-y-3">
                  <div className="text-sm font-semibold">Connectivity test</div>
                  <SettingsTextField
                    label="Index pattern to test"
                    value={elfTestIndexPattern}
                    onChange={(event) => setElfTestIndexPattern(event.target.value)}
                    description="Defaults to the saved default index pattern when empty."
                  />
                  <SettingsTextField
                    label="ELF app ID (optional)"
                    value={elfTestAppId}
                    onChange={(event) => setElfTestAppId(event.target.value)}
                    description="Only required when the index pattern contains {{elfAppId}}."
                  />
                  <Button variant="secondary" onPress={testElfProxy} isDisabled={testingElf} className="gap-2">
                    {testingElf ? <RotateCw className="size-4 animate-spin" /> : <Play className="size-4" />}
                    Test proxy
                  </Button>
                  {elfTestCurl ? (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground">Equivalent curl</div>
                      <pre className="overflow-x-auto rounded-lg border bg-muted/20 p-3 text-[11px] leading-relaxed text-foreground">
                        {elfTestCurl}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </Card.Content>
            </Card>
          </Tabs.Panel>
        </Tabs>
      </div>
    </PageShell>
  )
}
