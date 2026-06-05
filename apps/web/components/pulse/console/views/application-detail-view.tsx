"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Boxes,
  Braces,
  CheckCircle2,
  Eye,
  KeyRound,
  LineChart,
  Play,
  Plus,
  RotateCw,
  Settings,
  Server,
  Timer,
  Workflow,
  Search,
  Users,
  HelpCircle,
  Info,
  Sparkles,
  Loader2,
  Upload,
} from "lucide-react"

import { BuilderWorkbench } from "@/components/pulse/builder-workbench"
import { MonitorImportExportDialog } from "@/components/pulse/monitor-import-export-dialog"
import { AlertDetail, AlertsHistory } from "@/components/pulse/alert-views"
import {
  formatDate,
  isFailedStatus,
  isSuccessStatus,
  LatencyChart,
  Metric,
  MonitorRunsChart,
  PageShell,
  StatusPill,
  type ConsoleView,
} from "@/components/pulse/console-shared"
import { RunDetail, RunTimeline } from "@/components/pulse/run-views"
import { Secrets, type SecretInput } from "@/components/pulse/secrets-view"
import { SettingsView } from "@/components/pulse/settings-view"
import type {
  Application,
  AlertEvent,
  CertificateProfile,
  CertificateProfileInput,
  DeploymentValidation,
  Monitor,
  MonitorRun,
  NotificationSettings,
  NotificationSettingsInput,
  NotificationTestResult,
  RetentionPurgeResult,
  RetentionSettings,
  SecretReference,
  SLOSummary,
} from "@/lib/pulse-types"
import { applicationSLOMap, formatUptimePct, monitorSLOMap } from "@/lib/pulse-slo"
import { ErrorBudgetWidget } from "@/components/pulse/slo-widgets"
import { Button, Card as HeroCard, Chip, Description, Input, Label, ListBox, Select, TextField } from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"

import { applicationHealth, dateTimeLocalToISOString, toDateTimeLocalInput, validationStatusLabel } from "../utils/console-utils"
import type { DeploymentValidationCreateInput } from "../types"
import { AlertFeed } from "../components/alert-feed"
import { DeploymentValidationPanel } from "../components/deployment-validation-panel"
import { HistoryPatternAnalysis } from "../components/history-pattern-analysis"
import { MonitorTable } from "../components/monitor-table"
import { SchedulerStatusCard } from "../components/scheduler-status-card"
import { ValidationResultPill } from "../components/validation-result-pill"


export function ApplicationDetailView({
  application,
  monitors,
  validations,
  applicationSlo,
  onRunApplication,
  onCreateValidation,
  onRunNow,
  onToggleActive,
  onDeleteMonitor,
  onSaveApplication,
  runningAppId,
}: {
  application: Application
  monitors: Monitor[]
  validations: DeploymentValidation[]
  applicationSlo?: import("@/lib/pulse-types").ApplicationSLO
  onRunApplication: (applicationId: string) => Promise<void>
  onCreateValidation: (input: DeploymentValidationCreateInput) => Promise<DeploymentValidation | null>
  onRunNow: (monitorId: string) => Promise<any> | any
  onToggleActive: (monitorId: string, currentActive: boolean) => void
  onDeleteMonitor?: (monitorId: string) => void
  onSaveApplication: (input: Application) => Promise<void>
  runningAppId?: string
}) {
  const [running, setRunning] = useState(false)
  const [routing, setRouting] = useState(application.alertRouting || {})
  const [savingRouting, setSavingRouting] = useState(false)
  const health = applicationHealth(monitors, applicationSlo)

  async function run() {
    if (running) return
    setRunning(true)
    try {
      await onRunApplication(application.id)
    } finally {
      setRunning(false)
    }
  }

  return (
    <PageShell
      eyebrow={application.carId ? `CAR ${application.carId}` : "Application"}
      title={application.name}
      description={application.description || "Application monitor group"}
      action={
        <Button onPress={run} isDisabled={running || !!runningAppId || health.active === 0} className="h-9 gap-2 cursor-pointer">
          {running ? <RotateCw className="size-4 animate-spin" /> : <Play className="size-4" />}
          Run application
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Metadata Banner */}
        <div className="flex flex-wrap items-center gap-3 text-xs bg-card border border-border/40 p-4 rounded-lg">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground bg-default/40 px-2 py-1 rounded border border-border/40">
            Registry ID: CAR {application.carId}
          </div>
          {application.environment && (
            <Chip
              size="sm"
              variant="primary"
              color={
                application.environment === "production"
                  ? "success"
                  : application.environment === "staging"
                    ? "warning"
                    : "default"
              }
              className="border border-current/25 text-[10px] font-bold uppercase tracking-wide"
            >
              <Chip.Label>{application.environment}</Chip.Label>
            </Chip>
          )}
          {application.owner && (
            <div className="flex items-center gap-1.5 text-muted-foreground font-semibold px-2 py-1 rounded bg-default/40 border border-border/40">
              <Users className="size-3.5 text-muted-foreground/80" />
              Owner Team: <span className="text-foreground">{application.owner}</span>
            </div>
          )}
          {application.description && (
            <div className="w-full mt-1 border-t border-border/20 pt-2.5 text-xs text-muted-foreground leading-relaxed">
              {application.description}
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Total monitors" value={String(health.total)} icon={Workflow} detail={`${health.active} active`} />
          <Metric label="Failing" value={String(health.failing)} icon={AlertTriangle} detail="Current status" tone="danger" />
          <Metric label="Uptime 7d" value={formatUptimePct(health.uptime7d)} icon={CheckCircle2} detail="Rolling production runs" tone="success" />
          <Metric label="Uptime 30d" value={formatUptimePct(health.successRate)} icon={CheckCircle2} detail="Rolling production runs" tone="success" />
          <Metric label="p95 latency (30d)" value={`${applicationSlo?.runLatency30d.p95Ms ?? health.avgLatency}ms`} icon={Server} detail={application.environment || "environment"} tone="accent" />
        </div>

        <DeploymentValidationPanel
          application={application}
          monitors={monitors}
          validations={validations}
          onCreateValidation={onCreateValidation}
        />

        <HeroCard>
          <HeroCard.Header className="border-b">
            <HeroCard.Title className="text-sm font-semibold">Default alert routing</HeroCard.Title>
            <Description>Monitors can inherit these channels, severity, and on-call targets.</Description>
          </HeroCard.Header>
          <HeroCard.Content className="space-y-3 pt-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={routing.enabled ?? false} onChange={(e) => setRouting({ ...routing, enabled: e.target.checked })} className="accent-accent" />
                Enable app-level alerting defaults
              </label>
              <Select
                aria-label="Severity"
                variant="secondary"
                className="w-full"
                selectedKey={routing.severity || "inherit"}
                onSelectionChange={(key) => {
                  if (key != null) setRouting({ ...routing, severity: String(key) })
                }}
              >
                <Label className="text-xs font-semibold">Severity</Label>
                <Select.Trigger className="h-8">
                  <Select.Value />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="inherit">Inherit run severity</ListBox.Item>
                    <ListBox.Item id="critical">Critical</ListBox.Item>
                    <ListBox.Item id="warning">Warning</ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
              <TextField className="w-full" name="emailRecipients">
                <Label className="text-xs font-semibold">Email recipients (comma-separated)</Label>
                <Input
                  variant="secondary"
                  value={(routing.emailTo || []).join(", ")}
                  onChange={(e) => setRouting({ ...routing, emailTo: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  className="text-xs"
                />
              </TextField>
              <TextField className="w-full" name="onCallTargets">
                <Label className="text-xs font-semibold">On-call targets (comma-separated)</Label>
                <Input
                  variant="secondary"
                  value={(routing.onCallTargets || []).join(", ")}
                  onChange={(e) => setRouting({ ...routing, onCallTargets: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  className="text-xs"
                />
              </TextField>
              <TextField className="w-full" name="slackSecretAlias">
                <Label className="text-xs font-semibold">Slack secret alias</Label>
                <Input
                  variant="secondary"
                  placeholder="slackWebhook"
                  value={routing.slackWebhookSecret || ""}
                  onChange={(e) => setRouting({ ...routing, slackWebhookSecret: e.target.value })}
                  className="text-xs"
                />
              </TextField>
            </div>
            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={routing.email ?? false} onChange={(e) => setRouting({ ...routing, email: e.target.checked })} className="accent-accent" />
                Email
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={routing.slackWebhook ?? false} onChange={(e) => setRouting({ ...routing, slackWebhook: e.target.checked })} className="accent-accent" />
                Slack
              </label>
            </div>
            <Button
              size="sm"
              isDisabled={savingRouting}
              onPress={async () => {
                setSavingRouting(true)
                try {
                  await onSaveApplication({ ...application, alertRouting: routing })
                } finally {
                  setSavingRouting(false)
                }
              }}
            >
              Save routing
            </Button>
          </HeroCard.Content>
        </HeroCard>

        <div className="space-y-3">
          <div>
            <h2 className="font-heading text-base font-semibold">Application monitors</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Monitors assigned to {application.name}. Use run application for a single-click service check.
            </p>
          </div>
          <MonitorTable
            monitors={monitors}
            onRunNow={onRunNow}
            onToggleActive={onToggleActive}
            onDeleteMonitor={onDeleteMonitor}
          />
        </div>
      </div>
    </PageShell>
  )
}

