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
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { cn } from "@workspace/ui/lib/utils"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@workspace/ui/components/table"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@workspace/ui/components/empty"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Textarea } from "@workspace/ui/components/textarea"

interface PulseConsoleProps {
  view?: ConsoleView
  applicationId?: string
  monitorId?: string
  runId?: string
  alertId?: string
}

function applicationHealth(monitors: Monitor[], appSlo?: { uptime7d: { uptimePct: number }; uptime30d: { uptimePct: number } }) {
  const total = monitors.length
  const failing = monitors.filter((monitor) => isFailedStatus(monitor.status)).length
  const active = monitors.filter((monitor) => monitor.isActive).length
  const successRate = appSlo
    ? Math.round(appSlo.uptime30d.uptimePct)
    : total > 0
      ? Math.round(monitors.reduce((sum, monitor) => sum + (monitor.successRate24h || 0), 0) / total)
      : 100
  const uptime7d = appSlo ? Math.round(appSlo.uptime7d.uptimePct) : successRate
  const avgLatency = total > 0
    ? Math.round(monitors.reduce((sum, monitor) => sum + (monitor.lastDurationMs || 0), 0) / total)
    : 0

  return { total, failing, active, successRate, uptime7d, avgLatency }
}

function ApplicationsView({
  applications,
  monitors,
  applicationSloMap: appSloLookup,
  onSaveApplication,
  onRunApplication,
  runningAppId,
  embedded = false,
}: {
  applications: Application[]
  monitors: Monitor[]
  applicationSloMap?: Map<string, import("@/lib/pulse-types").ApplicationSLO>
  onSaveApplication: (input: Application) => Promise<void>
  onRunApplication: (applicationId: string) => Promise<void>
  runningAppId?: string
  embedded?: boolean
}) {
  const [search, setSearch] = useState("")
  const [draft, setDraft] = useState({
    name: "",
    carId: "",
    owner: "",
    environment: "production",
    description: "",
  })
  const [saving, setSaving] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const filteredApplications = useMemo(() => {
    const q = search.toLowerCase()
    return applications.filter((application) => {
      if (!q) return true
      return (
        application.name.toLowerCase().includes(q) ||
        application.carId.toLowerCase().includes(q) ||
        (application.owner || "").toLowerCase().includes(q)
      )
    })
  }, [applications, search])

  const sortedApplications = useMemo(() => {
    return [...filteredApplications].sort((a, b) => {
      const aMonitors = monitors.filter((m) => m.applicationId === a.id)
      const bMonitors = monitors.filter((m) => m.applicationId === b.id)
      const aFailing = aMonitors.filter((m) => isFailedStatus(m.status)).length
      const bFailing = bMonitors.filter((m) => isFailedStatus(m.status)).length
      
      // Prioritize failing ones first
      if (aFailing > 0 && bFailing === 0) return -1
      if (bFailing > 0 && aFailing === 0) return 1
      
      // Fallback to alphabetical sorting
      return a.name.localeCompare(b.name)
    })
  }, [filteredApplications, monitors])

  async function saveApplication() {
    if (!draft.name.trim() || !draft.carId.trim() || saving) return
    setSaving(true)
    try {
      await onSaveApplication({
        id: "",
        name: draft.name.trim(),
        carId: draft.carId.trim(),
        owner: draft.owner.trim(),
        environment: draft.environment.trim() || "production",
        description: draft.description.trim(),
        tags: [],
      })
      setDraft({
        name: "",
        carId: "",
        owner: "",
        environment: "production",
        description: "",
      })
    } finally {
      setSaving(false)
    }
  }

  const innerLayout = (
    <div className="space-y-4">
      {embedded ? (
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search applications by name, CAR ID, or owner..."
              className="pl-9 h-10 text-xs w-full bg-card"
            />
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-xs font-semibold shadow-sm tracking-normal cursor-pointer whitespace-nowrap"
          >
            <Plus className="size-4" />
            Create Application
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search applications by name, CAR ID, or owner..."
            className="pl-9 h-10 text-xs w-full bg-card"
          />
        </div>
      )}

      <Card className="overflow-hidden bg-card p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[6%] text-center text-xs">Status</TableHead>
              <TableHead className="w-[30%] text-xs">Application</TableHead>
              <TableHead className="w-[12%] text-xs">Environment</TableHead>
              <TableHead className="w-[14%] text-xs">Owner Team</TableHead>
              <TableHead className="w-[10%] text-xs text-center">Monitors</TableHead>
              <TableHead className="w-[8%] text-xs text-center">Uptime 7d</TableHead>
              <TableHead className="w-[8%] text-xs text-center">Uptime 30d</TableHead>
              <TableHead className="w-[8%] text-xs text-center">Avg Latency</TableHead>
              <TableHead className="w-[18%] text-right pr-6 text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedApplications.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-48 text-center align-middle">
                  <Empty className="border-0 bg-transparent py-6">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Workflow className="size-5 text-muted-foreground" />
                      </EmptyMedia>
                      <EmptyTitle>No applications found</EmptyTitle>
                      <EmptyDescription>
                        Create your first application group to start tracking endpoint availability.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              sortedApplications.map((application) => {
                const appMonitors = monitors.filter((monitor) => monitor.applicationId === application.id)
                const appSlo = appSloLookup?.get(application.id)
                const health = applicationHealth(appMonitors, appSlo)
                const isRunning = runningAppId === application.id

                return (
                  <TableRow key={application.id} className="group hover:bg-muted/30 transition-colors">
                    {/* Status */}
                    <TableCell className="align-middle text-center">
                      <span className="inline-flex items-center justify-center">
                        <span className="relative flex size-2.5">
                          {health.failing > 0 ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full size-2.5 bg-rose-500" />
                            </>
                          ) : health.total > 0 ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full size-2.5 bg-emerald-500" />
                            </>
                          ) : (
                            <span className="relative inline-flex rounded-full size-2.5 bg-muted-foreground/35" />
                          )}
                        </span>
                      </span>
                    </TableCell>

                    {/* Name + CAR ID */}
                    <TableCell className="align-middle font-medium">
                      <div className="min-w-0 pr-2">
                        <Link href={`/applications/${application.id}`} className="font-semibold text-foreground hover:text-primary transition-colors hover:underline text-sm block">
                          {application.name}
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[9px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/50">
                            CAR {application.carId}
                          </span>
                          {application.description && (
                            <span className="text-muted-foreground/80 truncate text-xs font-normal max-w-[200px]" title={application.description}>
                              {application.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Environment */}
                    <TableCell className="align-middle">
                      {application.environment ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] px-1.5 h-4.5 font-bold tracking-wide uppercase rounded-sm",
                            application.environment === "production"
                              ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                              : application.environment === "staging"
                                ? "border-amber-500/25 bg-amber-500/5 text-amber-600 dark:text-amber-400"
                                : "border-blue-500/25 bg-blue-500/5 text-blue-600 dark:text-blue-400"
                          )}
                        >
                          {application.environment}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/50 text-[10px]">—</span>
                      )}
                    </TableCell>

                    {/* Owner Team */}
                    <TableCell className="align-middle">
                      {application.owner ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-foreground/90 font-medium bg-muted/40 border border-border/40 px-2 py-0.5 rounded">
                          <Users className="size-3 text-muted-foreground/75" />
                          {application.owner}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-[10px]">—</span>
                      )}
                    </TableCell>

                    {/* Monitors */}
                    <TableCell className="align-middle text-center">
                      <div className="text-xs font-semibold text-foreground">
                        {health.total}
                      </div>
                      <div className="text-[9px] text-muted-foreground font-medium">
                        {health.active} active
                      </div>
                    </TableCell>

                    <TableCell className="align-middle text-center text-xs font-bold">
                      {formatUptimePct(health.uptime7d)}
                    </TableCell>
                    <TableCell className="align-middle text-center text-xs font-bold">
                      {formatUptimePct(health.successRate)}
                    </TableCell>

                    {/* Latency */}
                    <TableCell className="align-middle text-center">
                      <div className="text-xs font-semibold text-foreground">
                        {health.avgLatency}ms
                      </div>
                      <div className="text-[9px] text-muted-foreground font-medium">
                        last avg
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="align-middle text-right pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/applications/${application.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs font-semibold gap-1 hover:bg-primary/5 hover:text-primary"
                          >
                            <Eye className="size-3" /> View
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-semibold gap-1 hover:bg-primary/5 hover:text-primary min-w-[110px] justify-center cursor-pointer"
                          onClick={() => onRunApplication(application.id)}
                          disabled={!!runningAppId || health.active === 0}
                        >
                          <Play className="size-3" /> Run execution
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )

  return (
    <>
      {embedded ? (
        innerLayout
      ) : (
        <PageShell
          eyebrow="Application Registry"
          title="Applications"
          description="Group monitors by application and CAR ID for service health checking across owned environments."
          action={
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-xs font-semibold shadow-sm tracking-normal cursor-pointer"
            >
              <Plus className="size-4" />
              Create Application
            </Button>
          }
        >
          {innerLayout}
        </PageShell>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Create Application Group</DialogTitle>
            <DialogDescription className="text-xs">
              Register a new application group to organize and execute synthetic monitor checks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Application Name <span className="text-rose-500">*</span>
              </label>
              <Input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g., Authentication Service, Billing API"
                className="h-9 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Registry CAR ID <span className="text-rose-500">*</span>
                </label>
                <Input
                  value={draft.carId}
                  onChange={(event) => setDraft((prev) => ({ ...prev, carId: event.target.value }))}
                  placeholder="e.g., CAR-1025"
                  className="h-9 text-xs"
                />
                <p className="text-[10px] text-muted-foreground/80 leading-normal">
                  Central Application Registry ID. Use shorthand name if unregistered.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Owner Team
                </label>
                <Input
                  value={draft.owner}
                  onChange={(event) => setDraft((prev) => ({ ...prev, owner: event.target.value }))}
                  placeholder="e.g., SRE, Payment Dev"
                  className="h-9 text-xs"
                />
                <p className="text-[10px] text-muted-foreground/80 leading-normal">
                  The engineering team responsible for maintaining checks.
                </p>
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Environment
              </label>
              <NativeSelect
                value={draft.environment}
                onChange={(event) => setDraft((prev) => ({ ...prev, environment: event.target.value }))}
                className="h-9 text-xs"
              >
                <NativeSelectOption value="production">Production</NativeSelectOption>
                <NativeSelectOption value="staging">Staging</NativeSelectOption>
                <NativeSelectOption value="development">Development</NativeSelectOption>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Description
              </label>
              <Textarea
                value={draft.description}
                onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Provide a brief summary of what this application group represents..."
                className="text-xs min-h-[70px] resize-none"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-border/20 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
              className="h-9 text-xs cursor-pointer"
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await saveApplication()
                setIsCreateOpen(false)
              }}
              className="h-9 gap-1.5 text-xs bg-primary text-primary-foreground cursor-pointer"
              disabled={saving || !draft.name.trim() || !draft.carId.trim()}
            >
              {saving ? <RotateCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Create Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ApplicationDetailView({
  application,
  monitors,
  applicationSlo,
  onRunApplication,
  onRunNow,
  onToggleActive,
  onDeleteMonitor,
  onSaveApplication,
  runningAppId,
}: {
  application: Application
  monitors: Monitor[]
  applicationSlo?: import("@/lib/pulse-types").ApplicationSLO
  onRunApplication: (applicationId: string) => Promise<void>
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
        <Button onClick={run} disabled={running || !!runningAppId || health.active === 0} className="h-9 gap-2 cursor-pointer">
          {running ? <RotateCw className="size-4 animate-spin" /> : <Play className="size-4" />}
          Run application
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Metadata Banner */}
        <div className="flex flex-wrap items-center gap-3 text-xs bg-card border border-border/40 p-4 rounded-lg">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground bg-muted/65 px-2 py-1 rounded border">
            Registry ID: CAR {application.carId}
          </div>
          {application.environment && (
            <Badge
              variant="outline"
              className={cn(
                "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-sm",
                application.environment === "production"
                  ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                  : application.environment === "staging"
                    ? "border-amber-500/25 bg-amber-500/5 text-amber-600 dark:text-amber-400"
                    : "border-blue-500/25 bg-blue-500/5 text-blue-600 dark:text-blue-400"
              )}
            >
              {application.environment}
            </Badge>
          )}
          {application.owner && (
            <div className="flex items-center gap-1.5 text-muted-foreground font-semibold px-2 py-1 rounded bg-muted/20 border border-border/20">
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
          <Metric label="Failing" value={String(health.failing)} icon={AlertTriangle} detail="Current status" />
          <Metric label="Uptime 7d" value={formatUptimePct(health.uptime7d)} icon={CheckCircle2} detail="Rolling production runs" />
          <Metric label="Uptime 30d" value={formatUptimePct(health.successRate)} icon={CheckCircle2} detail="Rolling production runs" />
          <Metric label="p95 latency (30d)" value={`${applicationSlo?.runLatency30d.p95Ms ?? health.avgLatency}ms`} icon={Server} detail={application.environment || "environment"} />
        </div>

        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-sm font-semibold">Default alert routing</CardTitle>
            <CardDescription>Monitors can inherit these channels, severity, and on-call targets.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={routing.enabled ?? false} onChange={(e) => setRouting({ ...routing, enabled: e.target.checked })} />
                Enable app-level alerting defaults
              </label>
              <label className="text-xs font-semibold">
                Severity
                <NativeSelect size="sm" className="mt-1 w-full" value={routing.severity || "inherit"} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRouting({ ...routing, severity: e.target.value })}>
                  <NativeSelectOption value="inherit">Inherit run severity</NativeSelectOption>
                  <NativeSelectOption value="critical">Critical</NativeSelectOption>
                  <NativeSelectOption value="warning">Warning</NativeSelectOption>
                </NativeSelect>
              </label>
              <label className="text-xs font-semibold">
                Email recipients (comma-separated)
                <Input className="mt-1 h-8 text-xs" value={(routing.emailTo || []).join(", ")} onChange={(e) => setRouting({ ...routing, emailTo: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </label>
              <label className="text-xs font-semibold">
                On-call targets (comma-separated)
                <Input className="mt-1 h-8 text-xs" value={(routing.onCallTargets || []).join(", ")} onChange={(e) => setRouting({ ...routing, onCallTargets: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </label>
              <label className="text-xs font-semibold">
                Slack secret alias
                <Input className="mt-1 h-8 text-xs" placeholder="slackWebhook" value={routing.slackWebhookSecret || ""} onChange={(e) => setRouting({ ...routing, slackWebhookSecret: e.target.value })} />
              </label>
            </div>
            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={routing.email ?? false} onChange={(e) => setRouting({ ...routing, email: e.target.checked })} />
                Email
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={routing.slackWebhook ?? false} onChange={(e) => setRouting({ ...routing, slackWebhook: e.target.checked })} />
                Slack
              </label>
            </div>
            <Button
              size="sm"
              disabled={savingRouting}
              onClick={async () => {
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
          </CardContent>
        </Card>

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


interface MonitorTableProps {
  monitors: Monitor[]
  monitorSloMap?: Map<string, import("@/lib/pulse-types").MonitorSLO>
  onRunNow: (monitorId: string) => Promise<any> | any
  onToggleActive: (monitorId: string, currentActive: boolean) => void
  onDeleteMonitor?: (monitorId: string) => void
}

function MonitorTable({ monitors, monitorSloMap, onRunNow, onToggleActive, onDeleteMonitor }: MonitorTableProps) {
  const [runningIds, setRunningIds] = useState<string[]>([])

  const handleRunClick = async (monitorId: string) => {
    if (runningIds.includes(monitorId)) return
    setRunningIds((prev) => [...prev, monitorId])
    try {
      await onRunNow(monitorId)
    } catch (err) {
      console.error("Failed to run monitor:", err)
    } finally {
      setRunningIds((prev) => prev.filter((id) => id !== monitorId))
    }
  }

  return (
    <Card className="overflow-hidden pt-2 pb-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[30%] text-xs ">Monitor</TableHead>
            <TableHead className="w-[12%] text-xs ">Status</TableHead>
            <TableHead className="w-[15%] text-xs ">Schedule</TableHead>
            <TableHead className="w-[12%] text-xs ">Last execution</TableHead>
            <TableHead className="w-[8%] text-xs text-center">7d</TableHead>
            <TableHead className="w-[8%] text-xs text-center">30d</TableHead>
            <TableHead className="w-[8%] text-xs ">State</TableHead>
            <TableHead className="text-right w-[12%] pr-6 text-xs ">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {monitors.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-48 text-center align-middle">
                <Empty className="border-0 bg-transparent py-6">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Activity className="size-5 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>No monitors found</EmptyTitle>
                    <EmptyDescription>
                      Create your first monitor to start tracking endpoint availability.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          ) : (
            monitors.map((monitor) => {
              const isRunning = runningIds.includes(monitor.id)
              return (
                <TableRow key={monitor.id} className="group hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium align-middle">
                    <div className="min-w-0 pr-2">
                      <Link href={`/monitors/${monitor.id}/runs`} className="font-semibold text-foreground hover:text-primary transition-colors hover:underline text-sm block">
                        {monitor.name}
                      </Link>
                      <p className="text-muted-foreground/80 truncate text-xs mt-0.5 font-medium">{monitor.description || "No description provided."}</p>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle">
                    <StatusPill status={monitor.status} />
                  </TableCell>
                  <TableCell className="align-middle">
                    <span className="text-muted-foreground font-medium text-[11px] bg-muted px-2 py-0.5 rounded border border-border/50 w-fit">
                      {monitor.scheduleLabel || "Manual check"}
                    </span>
                  </TableCell>
                  <TableCell className="align-middle text-muted-foreground text-xs font-medium">
                    {monitor.lastRunAt ? formatDate(monitor.lastRunAt) : "Never"}
                  </TableCell>
                  <TableCell className="align-middle text-center text-xs font-semibold">
                    {formatUptimePct(monitorSloMap?.get(monitor.id)?.uptime7d.uptimePct)}
                  </TableCell>
                  <TableCell className="align-middle text-center text-xs font-semibold">
                    {formatUptimePct(monitorSloMap?.get(monitor.id)?.uptime30d.uptimePct)}
                  </TableCell>
                  <TableCell className="align-middle">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border",
                      monitor.isActive 
                        ? "border-emerald-200/50 bg-emerald-500/10 text-emerald-600 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400" 
                        : "border-border/50 bg-muted text-muted-foreground"
                    )}>
                      <span className={cn("size-1.5 rounded-full", monitor.isActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground")} />
                      {monitor.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right pr-6 align-middle">
                    <div className="flex items-center justify-end gap-2 relative">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className={cn(
                          "h-8 text-xs font-semibold gap-1 hover:bg-primary/5 hover:text-primary min-w-[75px] justify-center",
                          isRunning && "opacity-80 cursor-not-allowed"
                        )}
                        disabled={isRunning}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRunClick(monitor.id)
                        }}
                      >
                        {isRunning ? (
                          <>
                            <RotateCw className="size-3 animate-spin" /> Running...
                          </>
                        ) : (
                          <>
                            <Play className="size-3" /> Run
                          </>
                        )}
                      </Button>

                      <Link href={`/monitors/${monitor.id}/runs`} onClick={(e) => e.stopPropagation()}>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-xs font-semibold gap-1 hover:bg-primary/5 hover:text-primary"
                        >
                          <Eye className="size-3" /> History
                        </Button>
                      </Link>

                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="sr-only">Open menu</span>
                            <span className="font-bold text-sm tracking-widest leading-none">...</span>
                          </Button>
                        } />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={
                            <Link 
                              href={`/monitors/${monitor.id}/edit`}
                              className="w-full h-full"
                              onClick={(e) => e.stopPropagation()}
                            />
                          }>
                            Edit monitor
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleActive(monitor.id, monitor.isActive)
                            }}
                          >
                            {monitor.isActive ? "Disable" : "Enable"}
                          </DropdownMenuItem>
                          {onDeleteMonitor && (
                            <DropdownMenuItem
                              className="text-rose-600 dark:text-rose-400 font-semibold border-t border-border/40 mt-1 focus:bg-red-700 dark:focus:bg-rose-950/20"
                              onClick={(e) => {
                                e.stopPropagation()
                                onDeleteMonitor(monitor.id)
                              }}
                            >
                              Delete monitor
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </Card>
  )
}

function SchedulerStatusCard({ monitors }: { monitors: Monitor[] }) {
  const activeCount = monitors.filter((m) => m.isActive && m.scheduleMode !== "manual").length

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
            </span>
            <span className="text-sm font-medium">Scheduler Status</span>
          </div>
          <p className="text-muted-foreground text-xs">
            {activeCount} active scheduled monitor{activeCount === 1 ? "" : "s"}
          </p>
        </div>
        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 rounded-full border border-emerald-200/30">
          HEALTHY
        </span>
      </CardContent>
    </Card>
  )
}

function AlertFeed({ alerts }: { alerts: AlertEvent[] }) {
  const latestAlerts = alerts.slice(0, 5)

  return (
    <Card>
      <CardHeader className="pb-3 border-b">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Bell className="size-3.5 text-primary" />
              Alert Events
            </CardTitle>
            <CardDescription className="text-xs">
              Persisted delivery lifecycle from monitor failures, cooldowns, and recoveries.
            </CardDescription>
          </div>
          <Link href="/alerts" className="shrink-0 text-[11px] font-semibold text-primary hover:underline">
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pt-4 text-xs font-semibold text-foreground space-y-3">
        {latestAlerts.length === 0 ? (
          <Empty className="border-0 bg-transparent py-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bell className="size-5 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-semibold">No alert events yet</EmptyTitle>
              <EmptyDescription className="text-xs">
                Alerts appear after a monitor crosses its failure threshold.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          latestAlerts.map((alert) => {
            const latestDelivery = alert.deliveries?.[0]
            return (
              <div key={alert.id} className="border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/alerts/${alert.id}`} className="block truncate font-bold text-foreground hover:text-primary hover:underline">{alert.title}</Link>
                    <p className="mt-0.5 truncate text-[11px] font-normal text-muted-foreground" title={alert.description}>
                      {alert.description || "Monitor run did not complete successfully."}
                    </p>
                  </div>
                  <span className={cn(
                    "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase",
                    alert.status === "open"
                      ? "border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-300"
                      : alert.status === "resolved"
                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300"
                        : "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300"
                  )}>
                    {alert.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-muted-foreground">
                  <span>{formatDate(alert.lastTriggeredAt)}</span>
                  <span>Channels: {alert.channels?.length ? alert.channels.join(", ") : "none"}</span>
                  {latestDelivery ? <span>Delivery: {latestDelivery.channel} {latestDelivery.status}</span> : null}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

interface DashboardProps {
  applications: Application[]
  monitors: Monitor[]
  runs: MonitorRun[]
  alerts: AlertEvent[]
  sloSummary: SLOSummary | null
  onRunNow: (monitorId: string) => void
  onToggleActive: (monitorId: string, currentActive: boolean) => void
  onDeleteMonitor?: (monitorId: string) => void
  onSaveApplication: (input: Application) => Promise<void>
  onRunApplication: (applicationId: string) => Promise<void>
  runningAppId?: string
  onImportExport?: () => void
}

function Dashboard({
  applications,
  monitors,
  runs,
  alerts,
  sloSummary,
  onRunNow,
  onToggleActive,
  onDeleteMonitor,
  onSaveApplication,
  onRunApplication,
  runningAppId,
  onImportExport,
}: DashboardProps) {
  const monitorSloLookup = useMemo(() => monitorSLOMap(sloSummary), [sloSummary])
  const applicationSloLookup = useMemo(() => applicationSLOMap(sloSummary), [sloSummary])
  const [activeTab, setActiveTab] = useState("overview")
  const [monitorSearch, setMonitorSearch] = useState("")
  const [monitorStatusFilter, setMonitorStatusFilter] = useState<"all" | "active" | "inactive" | "failed" | "healthy">("all")
  const [monitorScheduleFilter, setMonitorScheduleFilter] = useState<"all" | "scheduled" | "manual">("all")
  const [historyExpandedRowId, setHistoryExpandedRowId] = useState<string | null>(null)

  const failing = monitors.filter((monitor) => (monitor.status || "").toLowerCase() === "failed").length
  const active = monitors.filter((monitor) => monitor.isActive).length
  const averageResponse = Math.round(
    monitors.reduce((sum, monitor) => sum + (monitor.lastDurationMs || 0), 0) /
      Math.max(monitors.length, 1)
  )

  const systemHealthStatus = failing > 0 ? "Needs review" : "Fully operational"
  const systemHealthColor = failing > 0 
    ? "text-rose-700 bg-rose-500/5 border-rose-200/60 dark:text-rose-300 dark:border-rose-900/40 dark:bg-rose-950/20" 
    : "text-emerald-700 bg-emerald-500/5 border-emerald-200/60 dark:text-emerald-300 dark:border-emerald-900/40 dark:bg-emerald-950/20"

  const recentFailures = useMemo(() => {
    return [...monitors]
      .filter((m) => (m.status || "").toLowerCase() === "failed")
      .sort((a, b) => new Date(b.lastRunAt || 0).getTime() - new Date(a.lastRunAt || 0).getTime())
      .slice(0, 3)
  }, [monitors])

  const getMonitorFailureDetails = useCallback((monitorId: string) => {
    const monitorRuns = runs.filter((r) => r.monitorId === monitorId)
    const lastFailed = monitorRuns.find((r) => isFailedStatus(r.status))
    if (!lastFailed) return "Check execution failed"
    const failedStep = lastFailed.steps?.find((s) => isFailedStatus(s.status))
    return `${failedStep ? `[${failedStep.stepName}] ` : ""}${lastFailed.failureReason || "Assertion check failed"}`
  }, [runs])

  const slowestMonitors = useMemo(() => {
    return [...monitors]
      .filter((m) => m.isActive && (m.lastDurationMs || 0) > 0)
      .sort((a, b) => (b.lastDurationMs || 0) - (a.lastDurationMs || 0))
      .slice(0, 3)
  }, [monitors])

  const filteredMonitors = useMemo(() => {
    return monitors.filter((m) => {
      const q = monitorSearch.toLowerCase()
      const matchesSearch = !monitorSearch || 
        m.name.toLowerCase().includes(q) || 
        (m.description || "").toLowerCase().includes(q)

      const matchesStatus = 
        monitorStatusFilter === "all" ||
        (monitorStatusFilter === "active" && m.isActive) ||
        (monitorStatusFilter === "inactive" && !m.isActive) ||
        (monitorStatusFilter === "failed" && (m.status || "").toLowerCase() === "failed") ||
        (monitorStatusFilter === "healthy" && (m.status || "").toLowerCase() !== "failed")

      const matchesSchedule = 
        monitorScheduleFilter === "all" ||
        (monitorScheduleFilter === "scheduled" && m.scheduleMode !== "manual") ||
        (monitorScheduleFilter === "manual" && m.scheduleMode === "manual")

      return matchesSearch && matchesStatus && matchesSchedule
    })
  }, [monitors, monitorSearch, monitorStatusFilter, monitorScheduleFilter])

  const lastTickTime = useMemo(() => {
    const firstRun = runs[0]
    if (!firstRun) return "Never"
    try {
      const latestDate = new Date(firstRun.startedAt)
      return latestDate.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })
    } catch {
      return "10:17 AM"
    }
  }, [runs])

  return (
    <PageShell
      eyebrow="Pulse / Monitors"
      title="Synthetic monitors"
      description="Track endpoint health, response time, and recent failures."
      action={
        <div className="flex items-center gap-2">
          {onImportExport ? (
            <button
              type="button"
              onClick={onImportExport}
              className="border-input bg-background hover:bg-muted inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold shadow-sm"
            >
              <Upload className="size-4" />
              Import / Export
            </button>
          ) : null}
          <Link href="/monitors/create" className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-xs font-semibold shadow-sm tracking-normal">
            <Plus className="size-4" />
            New Monitor
          </Link>
        </div>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="border bg-muted/20 dark:bg-muted/5 p-1 gap-1 flex w-fit h-9 items-center justify-start rounded-lg">
          <TabsTrigger value="overview" className="cursor-pointer px-3.5 py-1 text-xs font-semibold gap-1.5 h-7">
            <Activity className="size-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="applications" className="cursor-pointer px-3.5 py-1 text-xs font-semibold gap-1.5 h-7">
            <Boxes className="size-3.5" />
            Applications
            <span className="ml-0.5 rounded-full bg-muted/85 dark:bg-muted/30 px-1.5 py-0.5 text-[10px] font-bold border border-border/40 text-muted-foreground">
              {applications.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="inventory" className="cursor-pointer px-3.5 py-1 text-xs font-semibold gap-1.5 h-7">
            <Workflow className="size-3.5" />
            Monitors
            <span className="ml-0.5 rounded-full bg-muted/85 dark:bg-muted/30 px-1.5 py-0.5 text-[10px] font-bold border border-border/40 text-muted-foreground">
              {monitors.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="history" className="cursor-pointer px-3.5 py-1 text-xs font-semibold gap-1.5 h-7">
            <Timer className="size-3.5" />
            Run History
            <span className="ml-0.5 rounded-full bg-muted/85 dark:bg-muted/30 px-1.5 py-0.5 text-[10px] font-bold border border-border/40 text-muted-foreground">
              {runs.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 outline-none">
          {/* Health Summary Banner */}
          <div className={cn("p-3.5 border rounded-lg flex items-center justify-between gap-4 text-xs font-semibold shadow-xs", systemHealthColor)}>
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", failing > 0 ? "bg-rose-400" : "bg-emerald-400")}></span>
                <span className={cn("relative inline-flex rounded-full size-2", failing > 0 ? "bg-rose-500" : "bg-emerald-500")}></span>
              </span>
              <span>System health: <span className="">{systemHealthStatus}</span></span>
            </div>
            <div className="text-muted-foreground font-medium text-[11px]">
              {failing} failing monitor{failing === 1 ? "" : "s"} · {active} active · {averageResponse}ms average response
            </div>
          </div>

          {/* Metrics Cards */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric 
              label="Total monitors" 
              value={String(monitors.length)} 
              detail="Active and manual checks" 
              icon={Workflow} 
              trend={{ text: `${monitors.length} configured`, positive: true }}
            />
            <Metric 
              label="Active monitors" 
              value={String(active)} 
              detail="Running background checks" 
              icon={Play} 
              trend={{ text: `${Math.round((active/Math.max(monitors.length, 1)) * 100)}% active`, positive: active > 0 }}
              onClick={() => {
                setMonitorStatusFilter("active")
                setActiveTab("inventory")
              }}
            />
            <Metric 
              label="Failing monitors" 
              value={String(failing)} 
              detail="Outage occurrences" 
              icon={AlertTriangle} 
              trend={failing > 0 ? { text: "Needs review", positive: false } : { text: "System healthy", positive: true }}
              className={cn(failing > 0 ? "border-rose-500/20 bg-rose-500/5 dark:bg-rose-950/10" : "")}
              onClick={() => {
                setMonitorStatusFilter("failed")
                setActiveTab("inventory")
              }}
            />
            <Metric 
              label="Average response" 
              value={`${averageResponse}ms`} 
              detail="Based on latest samples" 
              icon={Timer} 
            />
          </div>

          <ErrorBudgetWidget summary={sloSummary} />

          {/* Response Time Trend Chart */}
          <div className="w-full">
            <LatencyChart runs={runs} />
          </div>

          {/* Failures & Slowest Monitors Columns */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Recent Failures */}
            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-xs uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 text-rose-500" />
                  Recent Failures
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 text-xs font-semibold text-foreground space-y-3">
                {recentFailures.length === 0 ? (
                  <Empty className="border-0 bg-transparent py-4">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CheckCircle2 className="size-5 text-emerald-500" />
                      </EmptyMedia>
                      <EmptyTitle className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">All endpoints healthy</EmptyTitle>
                      <EmptyDescription className="text-xs">
                        No recent failures recorded for active monitors.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  recentFailures.map((m) => (
                    <div key={m.id} className="flex flex-col gap-1 border-b border-border/40 pb-2.5 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/monitors/${m.id}/runs`} className="hover:underline font-bold text-foreground hover:text-primary transition-colors truncate max-w-[200px]">
                          {m.name}
                        </Link>
                        <span className="text-[10px] text-rose-500 font-semibold bg-rose-500/5 border border-rose-500/20 px-1.5 py-0.5 rounded">
                          Failed
                        </span>
                      </div>
                      <p className="text-rose-600 dark:text-rose-300 font-normal leading-4 mt-0.5 text-[11px] truncate" title={getMonitorFailureDetails(m.id)}>
                        {getMonitorFailureDetails(m.id)}
                      </p>
                      <span className="text-[10px] text-muted-foreground font-medium mt-0.5">
                        Last run: {m.lastRunAt ? formatDate(m.lastRunAt) : "Never"}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Slowest Monitors */}
            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-xs uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <Timer className="size-3.5 text-amber-500" />
                  Slowest Monitors
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 text-xs font-semibold text-foreground space-y-3">
                {slowestMonitors.length === 0 ? (
                  <Empty className="border-0 bg-transparent py-4">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Timer className="size-5 text-muted-foreground" />
                      </EmptyMedia>
                      <EmptyTitle className="text-sm font-semibold">No latency stats available</EmptyTitle>
                      <EmptyDescription className="text-xs">
                        Run checks to compile response duration metrics.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  slowestMonitors.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 border-b border-border/40 pb-2.5 last:border-b-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <Link href={`/monitors/${m.id}/runs`} className="hover:underline font-bold text-foreground hover:text-primary transition-colors block truncate">
                          {m.name}
                        </Link>
                        <span className="text-[10px] text-muted-foreground font-medium block mt-0.5">
                          {m.scheduleLabel || "Manual"} · {m.timezone}
                        </span>
                      </div>
                      <span className={cn(
                        "text-xs font-bold font-heading px-2 py-0.5 rounded border",
                        m.alertPolicy?.responseTimeMs && (m.lastDurationMs || 0) > m.alertPolicy.responseTimeMs
                          ? "bg-rose-500/5 border-rose-500/20 text-rose-600 dark:text-rose-400"
                          : "bg-muted border-border/50 text-foreground"
                      )}>
                        {m.lastDurationMs || 0}ms
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <AlertFeed alerts={alerts} />
        </TabsContent>

        <TabsContent value="applications" className="space-y-6 outline-none">
          <ApplicationsView
            applications={applications}
            monitors={monitors}
            applicationSloMap={applicationSloLookup}
            onSaveApplication={onSaveApplication}
            onRunApplication={onRunApplication}
            runningAppId={runningAppId}
            embedded={true}
          />
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4 outline-none">
          {/* Search Toolbar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-muted/10 p-3 rounded-lg border border-border/60">
            <div className="relative flex-1 w-full">
              <Input
                placeholder="Search monitors by name or description..."
                value={monitorSearch}
                onChange={(e) => setMonitorSearch(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-between sm:justify-start">
              <div className="space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">Status</span>
                <NativeSelect
                  size="sm"
                  value={monitorStatusFilter}
                  onChange={(e: any) => setMonitorStatusFilter(e.target.value)}
                  className="w-[110px]"
                >
                  <NativeSelectOption value="all">All</NativeSelectOption>
                  <NativeSelectOption value="active">Active</NativeSelectOption>
                  <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
                  <NativeSelectOption value="healthy">Healthy</NativeSelectOption>
                  <NativeSelectOption value="failed">Failed</NativeSelectOption>
                </NativeSelect>
              </div>

              <div className="space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">Schedule</span>
                <NativeSelect
                  size="sm"
                  value={monitorScheduleFilter}
                  onChange={(e: any) => setMonitorScheduleFilter(e.target.value)}
                  className="w-[110px]"
                >
                  <NativeSelectOption value="all">All</NativeSelectOption>
                  <NativeSelectOption value="scheduled">Scheduled</NativeSelectOption>
                  <NativeSelectOption value="manual">Manual only</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
          </div>

          <MonitorTable 
            monitors={filteredMonitors}
            monitorSloMap={monitorSloLookup}
            onRunNow={onRunNow} 
            onToggleActive={onToggleActive} 
            onDeleteMonitor={onDeleteMonitor}
          />
        </TabsContent>

        <TabsContent value="history" className="outline-none">
          <div className="grid gap-6 xl:grid-cols-[300px_1fr] w-full">
            <div className="space-y-4 min-w-0">
              {/* Execution Status Card */}
              <Card>
                <CardHeader className="pb-3 bg-muted/10 border-b">
                  <CardTitle className="text-xs uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                    <Play className="size-3.5" />
                    Execution Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3 text-xs font-semibold text-foreground">
                  <div className="flex justify-between border-b pb-2.5">
                    <span className="text-muted-foreground font-medium">Scheduler</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <span className="size-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      Healthy
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-2.5">
                    <span className="text-muted-foreground font-medium">Active Monitors</span>
                    <span>{active} configured</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-medium">Last Tick</span>
                    <span className="font-mono text-muted-foreground font-bold">{lastTickTime}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Alert Policy Config */}
              <Card>
                <CardHeader className="pb-3 bg-muted/10 border-b">
                  <CardTitle className="text-xs uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                    <Bell className="size-3.5" />
                    Alert Policy
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3 text-xs font-semibold text-foreground">
                  <div className="flex justify-between border-b pb-2.5">
                    <span className="text-muted-foreground font-medium">Channels</span>
                    <span>Email + Slack</span>
                  </div>
                  <div className="flex justify-between border-b pb-2.5">
                    <span className="text-muted-foreground font-medium">Threshold</span>
                    <span>3 failures</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-medium">Cooldown</span>
                    <span>30 minutes</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Run History Tab Logs Table */}
            <div className="space-y-4 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-heading text-sm font-semibold tracking-tight text-foreground">Latest Execution Logs</h3>
                  <p className="text-muted-foreground text-xs font-medium">Click any row to expand details, steps, and assertions logs.</p>
                </div>
              </div>
              <Card className="overflow-x-auto min-w-0">
                <div className="min-w-[800px] p-2">
                  <div className="grid grid-cols-[85px_150px_1.5fr_90px_100px_140px] gap-3 px-4 py-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider border-b">
                    <span>Status</span>
                    <span>Run ID</span>
                    <span>Monitor</span>
                    <span>Duration</span>
                    <span>Trigger</span>
                    <span>Time</span>
                  </div>
                  <div className="divide-y divide-border/40 text-xs font-medium">
                    {runs.length === 0 ? (
                      <Empty className="border-0 bg-transparent py-8">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Workflow className="size-5 text-muted-foreground" />
                          </EmptyMedia>
                          <EmptyTitle className="text-sm font-semibold">No execution runs</EmptyTitle>
                          <EmptyDescription className="text-xs">
                            Trigger a monitor run manually or wait for the scheduler check.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      runs.slice(0, 10).map((run) => {
                        const isRowExpanded = historyExpandedRowId === run.id
                        const firstFailedStep = run.steps?.find((s) => s.status === "failed")
                        return (
                          <div key={run.id} className="transition-colors hover:bg-muted/5">
                            {/* Clickable Header Row */}
                            <div 
                              onClick={() => setHistoryExpandedRowId(isRowExpanded ? null : run.id)}
                              className="grid grid-cols-[85px_150px_1.5fr_90px_100px_140px] items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20"
                            >
                              <div>
                                <StatusPill status={run.status} />
                              </div>
                              <div className="font-mono text-muted-foreground/80 font-semibold select-all truncate" title={run.id}>
                                {run.id}
                              </div>
                              <span className="font-bold text-foreground truncate">{run.monitorName}</span>
                              <span className="font-semibold font-heading text-foreground">{run.durationMs}ms</span>
                              <span className="capitalize text-muted-foreground font-medium">{run.triggeredBy}</span>
                              <span className="text-muted-foreground font-medium text-[11px]">{formatDate(run.startedAt)}</span>
                            </div>

                            {/* Expandable step logs block */}
                            {isRowExpanded && (
                              <div className="px-4 pb-4 pt-2 bg-muted/5 border-t border-border/20 space-y-4">
                                {run.failureReason && (
                                  <div className="rounded-lg border border-rose-200/60 bg-rose-500/5 p-3.5 font-mono text-[11px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                                    <div className="font-bold text-[9px] uppercase tracking-wider text-rose-500 mb-1 flex items-center gap-1">
                                      <AlertTriangle className="size-3" />
                                      Outage Category: {run.failureCategory || "ERROR"}
                                    </div>
                                    <p className="whitespace-pre-wrap leading-5 mt-1">{run.failureReason}</p>
                                  </div>
                                )}
                                
                                <div className="space-y-2">
                                  <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1 block">Execution Steps</div>
                                  {(run.steps || []).map((step) => (
                                    <div key={step.id} className="grid grid-cols-[150px_1fr_90px] gap-4 rounded-lg bg-muted/20 border border-border/30 p-3 items-center">
                                      <div>
                                        <div className="font-semibold text-foreground truncate" title={step.stepName}>{step.stepName}</div>
                                        <div className="text-[9px] uppercase font-bold text-muted-foreground mt-0.5">{step.type}</div>
                                      </div>
                                      <div className="text-muted-foreground font-mono text-[11px] truncate leading-5" title={step.responseSummary}>{step.responseSummary}</div>
                                      <div className="text-right flex flex-col items-end gap-1">
                                        <span className="scale-90 origin-right"><StatusPill status={step.status} /></span>
                                        <span className="text-[10px] text-muted-foreground font-semibold mt-0.5">{step.latencyMs}ms</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="flex justify-end pt-1">
                                  <Link 
                                    href={`/runs/${run.id}`}
                                    className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-3 text-[11px] font-semibold hover:bg-muted transition-colors text-foreground gap-1"
                                  >
                                    View Diagnostic Details
                                  </Link>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}

function Builder({ monitor, applications, certificateProfiles }: { monitor: Monitor; applications: Application[]; certificateProfiles: CertificateProfile[] }) {
  return (
    <PageShell
      eyebrow="Monitor builder"
      title={monitor.id ? `Edit ${monitor.name}` : "Create monitor"}
    >
      <BuilderWorkbench monitor={monitor} applications={applications} certificateProfiles={certificateProfiles} />
    </PageShell>
  )
}

function HistoryPatternAnalysis({ monitor, runs }: { monitor: Monitor; runs: MonitorRun[] }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    patternDetected: boolean
    summary: string
    conclusions: string[]
  } | null>(null)

  const monitorRuns = runs.filter((run) => run.monitorId === monitor.id)
  const hasFailures = monitorRuns.some((r) => isFailedStatus(r.status))

  async function analyze() {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch("/api/copilot/root-cause-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runs: monitorRuns.slice(0, 15), monitorName: monitor.name }),
      })
      if (res.ok) {
        const data = await res.json()
        setResult(data.result)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (!hasFailures) return null

  return (
    <Card className="border border-primary/20 bg-primary/[0.01] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary animate-pulse" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-primary">Pulse Copilot: Run History Analytics</h3>
        </div>
        {!result && !loading && (
          <Button size="sm" onClick={analyze} className="h-7 text-[10px] bg-primary text-primary-foreground cursor-pointer px-2.5">
            Analyze Pattern
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-4 text-muted-foreground text-xs gap-2">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>Aggregating logs and analyzing status trends across runs...</span>
        </div>
      )}

      {result && (
        <div className="space-y-3 text-xs animate-in fade-in duration-200 font-sans">
          <div className="space-y-1">
            <span className="font-semibold text-foreground/80 block">AI Pattern Summary</span>
            <p className="text-muted-foreground leading-relaxed font-normal">{result.summary}</p>
          </div>
          {result.conclusions && result.conclusions.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="font-bold text-[9px] uppercase tracking-wider text-muted-foreground block">Key Findings:</span>
              <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                {result.conclusions.map((conclusion, idx) => (
                  <li key={idx}>{conclusion}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

interface RunsProps {
  monitor: Monitor
  runs: MonitorRun[]
  onRefresh: () => void
  onRunNow?: (monitorId: string) => void
}

function Runs({ monitor, runs, onRefresh, onRunNow }: RunsProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">("all")
  const [triggerFilter, setTriggerFilter] = useState<"all" | "manual" | "scheduled">("all")
  const [minLatency, setMinLatency] = useState<string>("")
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  const monitorRuns = useMemo(() => {
    return runs.filter((run) => run.monitorId === monitor.id)
  }, [runs, monitor.id])

  const stats = useMemo(() => {
    const total = monitorRuns.length
    const success = monitorRuns.filter((r) => isSuccessStatus(r.status)).length
    const rate = total > 0 ? Math.round((success / total) * 100) : 100
    const avg = total > 0 ? Math.round(monitorRuns.reduce((sum, r) => sum + r.durationMs, 0) / total) : 0
    const peak = total > 0 ? Math.max(...monitorRuns.map((r) => r.durationMs)) : 0
    return { total, rate, avg, peak }
  }, [monitorRuns])

  const filteredRuns = useMemo(() => {
    return monitorRuns.filter((run) => {
      const q = searchQuery.toLowerCase()
      const matchesSearch =
        !searchQuery ||
        (run.id || "").toLowerCase().includes(q) ||
        (run.failureReason || "").toLowerCase().includes(q) ||
        (run.triggeredBy || "").toLowerCase().includes(q)

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "success" && isSuccessStatus(run.status)) ||
        (statusFilter === "failed" && !isSuccessStatus(run.status))

      const matchesTrigger =
        triggerFilter === "all" ||
        (triggerFilter === "manual" && run.triggeredBy === "manual") ||
        (triggerFilter === "scheduled" && run.triggeredBy !== "manual")

      const matchesLatency =
        !minLatency ||
        run.durationMs >= parseInt(minLatency, 10)

      return matchesSearch && matchesStatus && matchesTrigger && matchesLatency
    })
  }, [monitorRuns, searchQuery, statusFilter, triggerFilter, minLatency])

  const lastRun = useMemo(() => {
    if (monitorRuns.length === 0) return null
    return [...monitorRuns].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]
  }, [monitorRuns])

  const lastFailedRun = useMemo(() => {
    const sorted = [...monitorRuns].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    return sorted.find((r) => isFailedStatus(r.status))
  }, [monitorRuns])

  const failedStep = useMemo(() => {
    return lastFailedRun?.steps?.find((s) => isFailedStatus(s.status))
  }, [lastFailedRun])

  return (
    <PageShell
      eyebrow="Monitor detail"
      title={monitor.name}
      action={
        <div className="flex items-center gap-2">
          {onRunNow && (
            <Button 
              size="sm" 
              onClick={() => onRunNow(monitor.id)}
              className="gap-1 font-semibold"
            >
              <Play className="size-3.5" /> Run Now
            </Button>
          )}
          <Link 
            href={`/monitors/${monitor.id}/edit`}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-muted transition-colors text-foreground"
          >
            Edit Monitor
          </Link>
          <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1 h-8 text-xs font-semibold">
            <RotateCw className="size-3.5" /> Refresh
          </Button>
        </div>
      }
    >
      <div className="space-y-6 min-w-0">
        {/* Compact Metadata Banner */}
        <div className="pb-4 border-b border-border/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-heading text-lg font-bold tracking-tight text-foreground">{monitor.name}</h2>
              <StatusPill status={monitor.status} />
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              {monitor.scheduleLabel || "Manual checks"} · {monitor.alertPolicy?.enabled ? "Alert enabled" : "Alert disabled"} · Threshold: {monitor.failureThreshold} failures
            </p>
            {lastRun && (
              <p className="text-[11px] text-muted-foreground/80 font-medium">
                Last run: <span className="text-foreground font-semibold">{lastRun.durationMs}ms</span> · {isSuccessStatus(lastRun.status) ? "Passed" : "Failed"} at {formatDate(lastRun.startedAt)}
              </p>
            )}
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full space-y-6">
          <TabsList className="border bg-muted/20 dark:bg-muted/5 p-1 gap-1 flex w-fit h-9 items-center justify-start rounded-lg">
            <TabsTrigger value="overview" className="cursor-pointer px-3.5 py-1 text-xs font-semibold gap-1.5 h-7">
              <Activity className="size-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="metrics" className="cursor-pointer px-3.5 py-1 text-xs font-semibold gap-1.5 h-7">
              <LineChart className="size-3.5" />
              Metrics
            </TabsTrigger>
            <TabsTrigger value="runs" className="cursor-pointer px-3.5 py-1 text-xs font-semibold gap-1.5 h-7">
              <Timer className="size-3.5" />
              Runs
              <span className="ml-0.5 rounded-full bg-muted/85 dark:bg-muted/30 px-1.5 py-0.5 text-[10px] font-bold border border-border/40 text-muted-foreground">
                {monitorRuns.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="steps" className="cursor-pointer px-3.5 py-1 text-xs font-semibold gap-1.5 h-7">
              <Braces className="size-3.5" />
              Steps
              <span className="ml-0.5 rounded-full bg-muted/85 dark:bg-muted/30 px-1.5 py-0.5 text-[10px] font-bold border border-border/40 text-muted-foreground">
                {monitor.steps?.length || 0}
              </span>
            </TabsTrigger>
            <TabsTrigger value="alerts" className="cursor-pointer px-3.5 py-1 text-xs font-semibold gap-1.5 h-7">
              <Bell className="size-3.5" />
              Alerts
            </TabsTrigger>
            <TabsTrigger value="settings" className="cursor-pointer px-3.5 py-1 text-xs font-semibold gap-1.5 h-7">
              <Settings className="size-3.5" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 outline-none">
            <HistoryPatternAnalysis monitor={monitor} runs={runs} />
            {/* Last Failure Card */}
            {lastFailedRun && (
              <Card className="border-rose-200/60 bg-rose-500/5 dark:border-rose-900/40 dark:bg-rose-950/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase font-bold text-rose-500 tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5" />
                    Last Failure
                  </CardTitle>
                  <CardDescription className="text-rose-600/90 dark:text-rose-300/90 text-[11px]">
                    Detailed diagnosis of the most recent failing run.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 font-mono text-xs">
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-rose-200/20 pb-2">
                    <span className="text-muted-foreground font-semibold">Failed Step:</span>
                    <span className="text-foreground font-bold">{failedStep?.stepName || "Unknown Step"}</span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-rose-200/20 pb-2">
                    <span className="text-muted-foreground font-semibold">Error Reason:</span>
                    <span className="text-rose-600 dark:text-rose-300 font-bold whitespace-pre-wrap leading-5">{lastFailedRun.failureReason || failedStep?.errorMessage || "Assertion error"}</span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2">
                    <span className="text-muted-foreground font-semibold">Time:</span>
                    <span className="text-foreground">{formatDate(lastFailedRun.startedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent execution runs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-sm font-semibold tracking-tight text-foreground">Recent execution runs</h3>
                <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">showing last 5</span>
              </div>
              <div className="space-y-3">
                {monitorRuns.slice(0, 5).map((run) => (
                  <RunTimeline key={run.id} run={run} />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="metrics" className="space-y-6 outline-none">
            {/* Slim Metrics Strip */}
            <Card className="bg-card">
              <CardContent className="p-2 flex flex-wrap md:flex-nowrap items-center divide-y md:divide-y-0 md:divide-x divide-border/60 text-xs font-semibold text-foreground">
                <div className="flex-1 min-w-[120px] p-2 md:px-4 text-center md:text-left">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Total Runs</span>
                  <span className="text-sm font-bold font-heading block mt-0.5">{stats.total}</span>
                </div>
                <div className="flex-1 min-w-[120px] p-2 md:px-4 text-center md:text-left">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Success Rate</span>
                  <span className="text-sm font-bold font-heading block mt-0.5 text-emerald-600 dark:text-emerald-400">{stats.rate}%</span>
                </div>
                <div className="flex-1 min-w-[120px] p-2 md:px-4 text-center md:text-left">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Avg Latency</span>
                  <span className="text-sm font-bold font-heading block mt-0.5">{stats.avg}ms</span>
                </div>
                <div className="flex-1 min-w-[120px] p-2 md:px-4 text-center md:text-left">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Peak Latency</span>
                  <span className={cn(
                    "text-sm font-bold font-heading block mt-0.5",
                    monitor.alertPolicy?.responseTimeMs && stats.peak > monitor.alertPolicy.responseTimeMs
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-foreground"
                  )}>
                    {stats.peak}ms
                  </span>
                </div>
              </CardContent>
            </Card>

            <MonitorRunsChart runs={monitorRuns} />
          </TabsContent>

          <TabsContent value="runs" className="space-y-4 outline-none">
            {/* Collapsible Filters */}
            <div className="flex flex-col gap-3 bg-muted/10 p-3 rounded-lg border border-border/60">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Input
                    placeholder="Search runs by ID, trigger, failure reason..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="flex bg-muted p-0.5 rounded-md h-9 shrink-0">
                  {(["all", "success", "failed"] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={cn(
                        "px-3 text-[11px] font-semibold capitalize rounded-md transition-all cursor-pointer",
                        statusFilter === status
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  className="h-9 text-xs gap-1 shrink-0 font-medium"
                >
                  Filters
                  <span className="text-[10px] text-muted-foreground">
                    {advancedOpen ? "▲" : "▼"}
                  </span>
                </Button>
              </div>

              {advancedOpen && (
                <div className="grid gap-3 md:grid-cols-2 pt-2 border-t border-border/40">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Trigger Source</span>
                    <div className="flex bg-muted p-0.5 rounded-md h-8 w-fit">
                      {(["all", "manual", "scheduled"] as const).map((trigger) => (
                        <button
                          key={trigger}
                          onClick={() => setTriggerFilter(trigger)}
                          className={cn(
                            "px-3 text-[10px] font-semibold capitalize rounded-md transition-all cursor-pointer",
                            triggerFilter === trigger
                              ? "bg-background text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {trigger === "scheduled" ? "Cron" : trigger}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Minimum Latency (ms)</span>
                    <Input
                      type="number"
                      placeholder="e.g. 500"
                      value={minLatency}
                      onChange={(e) => setMinLatency(e.target.value)}
                      className="h-8 text-xs max-w-[200px]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Run History Table */}
            <Card className="overflow-x-auto min-w-0">
              <div className="min-w-[800px] p-2">
                <div className="grid grid-cols-[85px_170px_100px_90px_140px_1fr] gap-3 px-4 py-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider border-b">
                  <span>Status</span>
                  <span>Run ID</span>
                  <span>Trigger</span>
                  <span>Duration</span>
                  <span>Started At</span>
                  <span>Failure Details</span>
                </div>
                <div className="divide-y divide-border/40 text-xs">
                  {filteredRuns.length === 0 ? (
                    <Empty className="border-0 bg-transparent py-8">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Workflow className="size-5 text-muted-foreground" />
                        </EmptyMedia>
                        <EmptyTitle className="text-sm font-semibold">No matching logs</EmptyTitle>
                        <EmptyDescription className="text-xs">
                          Try adjusting search query or active filter settings.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    filteredRuns.map((run) => {
                      const isRowExpanded = expandedRowId === run.id
                        const firstFailedStep = run.steps?.find((s) => isFailedStatus(s.status))
                      return (
                        <div key={run.id} className="transition-colors hover:bg-muted/5">
                          {/* Clickable Header Row */}
                          <div 
                            onClick={() => setExpandedRowId(isRowExpanded ? null : run.id)}
                            className="grid grid-cols-[85px_170px_100px_90px_140px_1fr] items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20"
                          >
                            <div>
                              <StatusPill status={run.status} />
                            </div>
                            <div className="font-mono text-muted-foreground/80 font-semibold select-all truncate" title={run.id}>
                              {run.id}
                            </div>
                            <span className="capitalize font-medium text-foreground">{run.triggeredBy}</span>
                            <span className="font-semibold font-heading text-foreground">{run.durationMs}ms</span>
                            <span className="text-muted-foreground font-medium text-[11px]">{formatDate(run.startedAt)}</span>
                            <div className="truncate text-muted-foreground pr-2 text-[11px]" title={run.failureReason}>
                              {isFailedStatus(run.status) ? (
                                <span className="text-rose-500 font-semibold">
                                  {firstFailedStep ? `[${firstFailedStep.stepName}] ` : ""}
                                  {run.failureReason || firstFailedStep?.errorMessage || "Outage"}
                                </span>
                              ) : (
                                <span className="text-emerald-600 font-medium">Completed successfully</span>
                              )}
                            </div>
                          </div>

                          {/* Expandable step logs block */}
                          {isRowExpanded && (
                            <div className="px-4 pb-4 pt-2 bg-muted/5 border-t border-border/20 space-y-4">
                              {run.failureReason && (
                                <div className="rounded-lg border border-rose-200/60 bg-rose-500/5 p-3.5 font-mono text-[11px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                                  <div className="font-bold text-[9px] uppercase tracking-wider text-rose-500 mb-1 flex items-center gap-1">
                                    <AlertTriangle className="size-3" />
                                    Outage Category: {run.failureCategory || "ERROR"}
                                  </div>
                                  <p className="whitespace-pre-wrap leading-5 mt-1">{run.failureReason}</p>
                                </div>
                              )}
                              
                              <div className="space-y-2">
                                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1 block">Execution Steps</div>
                                {(run.steps || []).map((step) => (
                                  <div key={step.id} className="grid grid-cols-[150px_1fr_90px] gap-4 rounded-lg bg-muted/20 border border-border/30 p-3 items-center">
                                    <div>
                                      <div className="font-semibold text-foreground truncate" title={step.stepName}>{step.stepName}</div>
                                      <div className="text-[9px] uppercase font-bold text-muted-foreground mt-0.5">{step.type}</div>
                                    </div>
                                    <div className="text-muted-foreground font-mono text-[11px] truncate leading-5" title={step.responseSummary}>{step.responseSummary}</div>
                                    <div className="text-right flex flex-col items-end gap-1">
                                      <span className="scale-90 origin-right"><StatusPill status={step.status} /></span>
                                      <span className="text-[10px] text-muted-foreground font-semibold mt-0.5">{step.latencyMs}ms</span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="flex justify-end pt-1">
                                <Link 
                                  href={`/runs/${run.id}`}
                                  className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-3 text-[11px] font-semibold hover:bg-muted transition-colors text-foreground gap-1"
                                >
                                  View Diagnostic Details
                                </Link>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="steps" className="space-y-4 outline-none">
            <div className="space-y-4">
              <div>
                <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">Configured Steps</h3>
                <p className="text-muted-foreground text-xs font-medium">Steps executed sequentially in this synthetic monitoring pipeline.</p>
              </div>

              {(!monitor.steps || monitor.steps.length === 0) ? (
                <Card>
                  <CardContent className="py-6">
                    <Empty className="border-0 bg-transparent py-4">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Braces className="size-5 text-muted-foreground" />
                        </EmptyMedia>
                        <EmptyTitle className="text-sm font-semibold">No steps configured</EmptyTitle>
                        <EmptyDescription className="text-xs">
                          Add HTTP check requests or script steps in the editor.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </CardContent>
                </Card>
              ) : (
                monitor.steps.map((step) => (
                  <Card key={step.id}>
                    <CardHeader className="pb-3 border-b bg-muted/10">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <span className="bg-muted px-2 py-0.5 rounded text-[10px] font-mono border">Step {step.order}</span>
                          {step.name}
                        </CardTitle>
                        <div className="flex items-center gap-4 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                          <span>Timeout: {step.timeoutMs}ms</span>
                          <span>Retries: {step.retryCount}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4 text-xs font-semibold text-foreground">
                      <div className="flex items-center gap-2 border rounded-md bg-muted/10 p-2 font-mono text-[11px] overflow-x-auto">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold text-white uppercase shrink-0",
                          step.method === "GET" ? "bg-blue-600" :
                          step.method === "POST" ? "bg-emerald-600" :
                          step.method === "PUT" ? "bg-amber-600" : "bg-zinc-600"
                        )}>
                          {step.method || step.type}
                        </span>
                        <span className="text-foreground truncate select-all">{step.url || "Manual/non-HTTP check"}</span>
                      </div>

                      {step.preRequestScript && (
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Pre-request JavaScript Script</span>
                          <pre className="p-2.5 rounded-md border bg-muted/30 font-mono text-[10px] whitespace-pre-wrap overflow-x-auto font-normal">
                            {step.preRequestScript}
                          </pre>
                        </div>
                      )}

                      {step.assertions && step.assertions.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Assertions ({step.assertions.length})</span>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {step.assertions.map((assertion) => (
                              <div key={assertion.id} className="flex items-center justify-between p-2 rounded border border-border/50 bg-muted/5 font-medium">
                                <span>{assertion.label || `${assertion.target} ${assertion.operator} ${assertion.expected}`}</span>
                                <span className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded tracking-wide">
                                  {assertion.type}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {step.extractors && step.extractors.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Variables Extractors ({step.extractors.length})</span>
                          <div className="grid gap-1.5 sm:grid-cols-2 font-normal">
                            {step.extractors.map((extractor) => (
                              <div key={extractor.id} className="flex items-center justify-between p-2 rounded border border-border/50 bg-muted/5 font-medium font-mono">
                                <span>{extractor.name} = extract({extractor.source})</span>
                                <span className="text-[9px] uppercase font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded tracking-wide">
                                  {extractor.type}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4 outline-none">
            <div className="space-y-4">
              <div>
                <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">Alert Policy Config</h3>
                <p className="text-muted-foreground text-xs font-medium">Rules triggered automatically to alert developers when this endpoint degrades or breaks.</p>
              </div>

              <Card>
                <CardHeader className="pb-3 border-b bg-muted/10">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "size-2 rounded-full",
                      monitor.alertPolicy?.enabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                    )} />
                    <CardTitle className="text-sm font-semibold">
                      Alerts: {monitor.alertPolicy?.enabled ? "Enabled" : "Disabled"}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-xs font-semibold text-foreground pt-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border p-3.5 bg-muted/5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Failure threshold</span>
                      <div className="text-base font-bold font-heading mt-1 text-foreground">{monitor.alertPolicy?.threshold || monitor.failureThreshold} Outages</div>
                      <p className="text-muted-foreground font-normal text-[11px] mt-0.5">Consecutive failures before alert triggers.</p>
                    </div>
                    <div className="rounded-lg border p-3.5 bg-muted/5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Target response time</span>
                      <div className="text-base font-bold font-heading mt-1 text-foreground">{monitor.alertPolicy?.responseTimeMs || 2000}ms</div>
                      <p className="text-muted-foreground font-normal text-[11px] mt-0.5">Response times above this trigger slow-warning alerts.</p>
                    </div>
                    <div className="rounded-lg border p-3.5 bg-muted/5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Cooldown timer</span>
                      <div className="text-base font-bold font-heading mt-1 text-foreground">{monitor.alertPolicy?.cooldownMinutes || 30} mins</div>
                      <p className="text-muted-foreground font-normal text-[11px] mt-0.5">Minutes before repeating alert reminders.</p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-border/40">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">Target Recipient Channels</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex items-center gap-2.5 p-3 rounded-lg border bg-muted/5">
                        <span className={cn(
                          "size-2 rounded-full",
                          monitor.alertPolicy?.email ? "bg-emerald-500" : "bg-muted-foreground/30"
                        )} />
                        <div>
                          <span className="font-semibold text-xs text-foreground">Email notifications</span>
                          <p className="text-muted-foreground font-normal text-[11px] mt-0.5">Sent to workspace administrator alerts registry.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 p-3 rounded-lg border bg-muted/5">
                        <span className={cn(
                          "size-2 rounded-full",
                          monitor.alertPolicy?.slackWebhook ? "bg-emerald-500" : "bg-muted-foreground/30"
                        )} />
                        <div>
                          <span className="font-semibold text-xs text-foreground">Slack webhook channels</span>
                          <p className="text-muted-foreground font-normal text-[11px] mt-0.5">Webhook integrations push failures immediately to channel feed.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 outline-none">
            <div className="space-y-4">
              <div>
                <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">General Monitor Settings</h3>
                <p className="text-muted-foreground text-xs font-medium">Properties controlling runtime execution, limits, variables, and timezone configurations.</p>
              </div>

              <Card className="text-xs">
                <CardContent className="pt-6 space-y-4 font-semibold text-foreground">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Timezone</span>
                      <div className="p-2.5 border rounded bg-muted/5 font-mono text-[11px] font-normal">{monitor.timezone}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Schedule specs (Cron)</span>
                      <div className="p-2.5 border rounded bg-muted/5 font-mono text-[11px] font-normal">{monitor.scheduleLabel || "Cron override"} (`{monitor.cron}`)</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Global check timeout</span>
                      <div className="p-2.5 border rounded bg-muted/5 font-mono text-[11px] font-normal">{monitor.timeoutMs}ms</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Global retry counts</span>
                      <div className="p-2.5 border rounded bg-muted/5 font-mono text-[11px] font-normal">{monitor.retryCount} retries</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Response body capture limits</span>
                      <div className="p-2.5 border rounded bg-muted/5 font-mono text-[11px] font-normal">{monitor.responseBodyLimitKb} KB max</div>
                    </div>
                  </div>

                  {monitor.variables && Object.keys(monitor.variables).length > 0 && (
                    <div className="space-y-2 pt-4 border-t border-border/40">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Environment Variables</span>
                      <div className="grid gap-2 font-mono text-[11px] font-normal">
                        {Object.entries(monitor.variables).map(([key, val]) => (
                          <div key={key} className="flex justify-between p-2 rounded border bg-muted/5">
                            <span className="text-muted-foreground">{key}</span>
                            <span className="text-foreground font-semibold">{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {monitor.secretAliases && monitor.secretAliases.length > 0 && (
                    <div className="space-y-2 pt-4 border-t border-border/40">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Referenced Encrypted Secrets</span>
                      <div className="flex flex-wrap gap-2 font-normal">
                        {monitor.secretAliases.map((alias) => (
                          <span key={alias} className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded font-mono text-[11px] border border-border/50">
                            <KeyRound className="size-3 text-muted-foreground" />
                            {alias}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  )
}





export function PulseConsole({ view = "dashboard", applicationId, monitorId, runId, alertId }: PulseConsoleProps) {
  const [applications, setApplications] = useState<Application[]>([])
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [runs, setRuns] = useState<MonitorRun[]>([])
  const [secrets, setSecrets] = useState<SecretReference[]>([])
  const [certificateProfiles, setCertificateProfiles] = useState<CertificateProfile[]>([])
  const [alerts, setAlerts] = useState<AlertEvent[]>([])
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null)
  const [retentionSettings, setRetentionSettings] = useState<RetentionSettings | null>(null)
  const [sloSummary, setSloSummary] = useState<SLOSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [isImportExportOpen, setIsImportExportOpen] = useState(false)

  const [activeMonitor, setActiveMonitor] = useState<Monitor | null>(null)
  const [activeRun, setActiveRun] = useState<MonitorRun | null>(null)
  const activeApplication = useMemo(() => {
    return applications.find((application) => application.id === applicationId) || null
  }, [applications, applicationId])

  // Filters for "/monitors" page
  const [monitorsSearch, setMonitorsSearch] = useState("")
  const [monitorsStatusFilter, setMonitorsStatusFilter] = useState<"all" | "active" | "inactive" | "failed" | "healthy">("all")
  const [monitorsScheduleFilter, setMonitorsScheduleFilter] = useState<"all" | "scheduled" | "manual">("all")

  // Confirmation Alert Dialog States
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    type: "disable" | "delete"
    monitorId: string
    monitorName: string
    currentActive?: boolean
  }>({
    isOpen: false,
    type: "disable",
    monitorId: "",
    monitorName: "",
    currentActive: false,
  })
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("")
  const [runningApp, setRunningApp] = useState<Application | null>(null)
  const [appRunStatus, setAppRunStatus] = useState<Record<string, { status: "queued" | "running" | "success" | "failed" | "skipped"; durationMs?: number; error?: string }>>({})
  const [appRunCompleted, setAppRunCompleted] = useState(false)

  const filteredMonitors = useMemo(() => {
    return monitors.filter((m) => {
      const q = monitorsSearch.toLowerCase()
      const matchesSearch = !monitorsSearch || 
        m.name.toLowerCase().includes(q) || 
        (m.description || "").toLowerCase().includes(q)

      const matchesStatus = 
        monitorsStatusFilter === "all" ||
        (monitorsStatusFilter === "active" && m.isActive) ||
        (monitorsStatusFilter === "inactive" && !m.isActive) ||
        (monitorsStatusFilter === "failed" && (m.status || "").toLowerCase() === "failed") ||
        (monitorsStatusFilter === "healthy" && (m.status || "").toLowerCase() !== "failed")

      const matchesSchedule = 
        monitorsScheduleFilter === "all" ||
        (monitorsScheduleFilter === "scheduled" && m.scheduleMode !== "manual") ||
        (monitorsScheduleFilter === "manual" && m.scheduleMode === "manual")

      return matchesSearch && matchesStatus && matchesSchedule
    })
  }, [monitors, monitorsSearch, monitorsStatusFilter, monitorsScheduleFilter])

  const fetchMonitors = async () => {
    try {
      const res = await fetch("/api/monitors")
      if (res.ok) {
        const data = await res.json()
        setMonitors(data.monitors || [])
      }
    } catch (err) {
      console.error("Failed to fetch monitors:", err)
    }
  }

  const fetchApplications = async () => {
    try {
      const res = await fetch("/api/applications")
      if (res.ok) {
        const data = await res.json()
        setApplications(data.applications || [])
      }
    } catch (err) {
      console.error("Failed to fetch applications:", err)
    }
  }

  const fetchSecrets = async () => {
    try {
      const res = await fetch("/api/secrets")
      if (res.ok) {
        const data = await res.json()
        setSecrets(data.secrets || [])
      }
    } catch (err) {
      console.error("Failed to fetch secrets:", err)
    }
  }

  const fetchCertificateProfiles = async () => {
    try {
      const res = await fetch("/api/settings/certificates")
      if (res.ok) {
        const data = await res.json()
        setCertificateProfiles(data.profiles || [])
      }
    } catch (err) {
      console.error("Failed to fetch certificate profiles:", err)
    }
  }

  const fetchAlerts = async () => {
    try {
      const res = await fetch("/api/alerts")
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.alerts || [])
      }
    } catch (err) {
      console.error("Failed to fetch alerts:", err)
    }
  }

  const fetchRuns = async () => {
    try {
      const res = await fetch("/api/runs")
      if (res.ok) {
        const data = await res.json()
        setRuns(data.runs || [])
      }
    } catch (err) {
      console.error("Failed to fetch runs:", err)
    }
  }

  const fetchNotificationSettings = async () => {
    try {
      const res = await fetch("/api/settings/notifications")
      if (res.ok) {
        const data = await res.json()
        setNotificationSettings(data.settings || null)
      }
    } catch (err) {
      console.error("Failed to fetch notification settings:", err)
    }
  }

  const fetchRetentionSettings = async () => {
    try {
      const res = await fetch("/api/settings/retention")
      if (res.ok) {
        const data = await res.json()
        setRetentionSettings(data.settings || null)
      }
    } catch (err) {
      console.error("Failed to fetch retention settings:", err)
    }
  }

  const fetchSLOSummary = async () => {
    try {
      const res = await fetch("/api/metrics/slo")
      if (res.ok) {
        const data = await res.json()
        setSloSummary(data.summary || null)
      }
    } catch (err) {
      console.error("Failed to fetch SLO summary:", err)
    }
  }

  const fetchSingleMonitor = async (id: string) => {
    try {
      const res = await fetch(`/api/monitors/${id}`)
      if (res.ok) {
        const data = await res.json()
        setActiveMonitor((data.draft ?? data.published ?? data.monitor) || null)
      }
    } catch (err) {
      console.error(`Failed to fetch monitor ${id}:`, err)
    }
  }

  const fetchSingleRun = async (id: string) => {
    try {
      const res = await fetch(`/api/runs/${id}`)
      if (res.ok) {
        const data = await res.json()
        setActiveRun(data.run || null)
      }
    } catch (err) {
      console.error(`Failed to fetch run ${id}:`, err)
    }
  }

  useEffect(() => {
    setLoading(true)
    const promises = [
      fetchApplications(),
      fetchMonitors(),
      fetchSecrets(),
      fetchCertificateProfiles(),
      fetchAlerts(),
      fetchRuns(),
      fetchNotificationSettings(),
      fetchRetentionSettings(),
      fetchSLOSummary(),
    ]
    if (monitorId) {
      promises.push(fetchSingleMonitor(monitorId))
    }
    if (runId) {
      promises.push(fetchSingleRun(runId))
    }
    Promise.all(promises).finally(() => {
      setLoading(false)
    })
  }, [applicationId, monitorId, runId, alertId])

  const handleRunNow = async (monitorIdVal: string) => {
    try {
      const res = await fetch(`/api/monitors/${monitorIdVal}/run`, { method: "POST" })
      if (res.ok) {
        await Promise.all([fetchMonitors(), fetchRuns(), fetchAlerts(), fetchSLOSummary()])
      }
    } catch (err) {
      console.error("Failed to trigger monitor run:", err)
    }
  }

  const handleRunApplication = async (applicationIdVal: string) => {
    const app = applications.find(a => a.id === applicationIdVal)
    if (!app) return
    
    setRunningApp(app)
    setAppRunCompleted(false)
    const appMonitors = monitors.filter(m => m.applicationId === applicationIdVal)
    
    const initialStates: Record<string, any> = {}
    appMonitors.forEach(m => {
      initialStates[m.id] = {
        status: m.isActive ? "running" : "skipped",
      }
    })
    setAppRunStatus(initialStates)
    
    const clickTime = new Date()
    
    try {
      const res = await fetch(`/api/applications/${applicationIdVal}/run`, { method: "POST" })
      if (!res.ok) {
        throw new Error("Failed to trigger application run")
      }
      
      let ticks = 0
      const maxTicks = 15
      const interval = setInterval(async () => {
        ticks++
        const [updatedMonitors, updatedRunsRes] = await Promise.all([
          fetch(`/api/monitors`).then(r => r.json()).catch(() => ({ monitors: [] })),
          fetch(`/api/runs`).then(r => r.json()).catch(() => ({ runs: [] })),
        ])
        
        const latestMonitors = updatedMonitors.monitors || []
        const latestRuns = updatedRunsRes.runs || []
        
        setMonitors(latestMonitors)
        setRuns(latestRuns)
        
        const newStates = { ...initialStates }
        let allDone = true
        
        appMonitors.forEach(m => {
          if (!m.isActive) {
            newStates[m.id] = { status: "skipped" }
            return
          }
          
          const monitorRuns = latestRuns.filter((r: any) => r.monitorId === m.id)
          monitorRuns.sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
          const latestRun = monitorRuns[0]
          
          if (latestRun && new Date(latestRun.startedAt).getTime() >= clickTime.getTime() - 5000) {
            const isCompleted = ["success", "failed", "timeout", "error"].includes(latestRun.status)
            newStates[m.id] = {
              status: latestRun.status === "success" ? "success" : "failed",
              durationMs: latestRun.durationMs,
              error: latestRun.failureReason,
            }
            if (!isCompleted) {
              allDone = false
            }
          } else {
            newStates[m.id] = { status: "running" }
            allDone = false
          }
        })
        
        setAppRunStatus(newStates)
        
        if (allDone || ticks >= maxTicks) {
          clearInterval(interval)
          setAppRunCompleted(true)
          await fetchAlerts()
        }
      }, 1500)
    } catch (err) {
      console.error("Failed to run application:", err)
      setRunningApp(null)
    }
  }

  const handleSaveApplication = async (input: Application) => {
    const res = await fetch(input.id ? `/api/applications/${input.id}` : "/api/applications", {
      method: input.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to save application.")
    }
    await fetchApplications()
  }

  const executeToggleActive = async (monitorIdVal: string, currentActive: boolean) => {
    const monitorItem = monitors.find((m) => m.id === monitorIdVal) || activeMonitor
    if (!monitorItem) return
    try {
      const res = await fetch(`/api/monitors/${monitorIdVal}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...monitorItem, isActive: !currentActive }),
      })
      if (res.ok) {
        await Promise.all([fetchMonitors(), monitorIdVal ? fetchSingleMonitor(monitorIdVal) : Promise.resolve()])
      }
    } catch (err) {
      console.error("Failed to toggle monitor active status:", err)
    }
  }

  const executeDeleteMonitor = async (monitorIdVal: string) => {
    try {
      const res = await fetch(`/api/monitors/${monitorIdVal}`, {
        method: "DELETE",
      })
      if (res.ok) {
        await Promise.all([fetchMonitors(), fetchRuns(), fetchAlerts(), fetchSLOSummary()])
      }
    } catch (err) {
      console.error("Failed to delete monitor:", err)
    }
  }

  const handleToggleActive = async (monitorIdVal: string, currentActive: boolean) => {
    if (currentActive) {
      const mName = monitors.find((m) => m.id === monitorIdVal)?.name || activeMonitor?.name || "Monitor"
      setConfirmDialog({
        isOpen: true,
        type: "disable",
        monitorId: monitorIdVal,
        monitorName: mName,
        currentActive,
      })
    } else {
      await executeToggleActive(monitorIdVal, currentActive)
    }
  }

  const handleDeleteMonitor = async (monitorIdVal: string) => {
    const mName = monitors.find((m) => m.id === monitorIdVal)?.name || activeMonitor?.name || "Monitor"
    setDeleteConfirmInput("")
    setConfirmDialog({
      isOpen: true,
      type: "delete",
      monitorId: monitorIdVal,
      monitorName: mName,
    })
  }

  const handleSaveSecret = async (secret: SecretReference | null, input: SecretInput) => {
    const payload = {
      name: input.name.trim(),
      alias: input.alias.trim(),
      description: input.description.trim(),
      provider: "encrypted-db",
      value: input.value,
      isActive: input.isActive,
    }
    const res = await fetch(secret ? `/api/secrets/${secret.id}` : "/api/secrets", {
      method: secret ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to save secret.")
    }
    await fetchSecrets()
  }

  const handleTestSecret = async (secret: SecretReference) => {
    const res = await fetch(`/api/secrets/${secret.id}/test`, { method: "POST" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to test secret.")
    }
    const data = await res.json()
    return Boolean(data.ok)
  }

  const handleDeleteSecret = async (secretIdVal: string) => {
    try {
      const res = await fetch(`/api/secrets/${secretIdVal}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to delete secret.")
      }
      await fetchSecrets()
    } catch (err) {
      console.error("Failed to delete secret:", err)
      throw err
    }
  }

  const handleSaveNotificationSettings = async (input: NotificationSettingsInput) => {
    const res = await fetch("/api/settings/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to save notification settings.")
    }
    setNotificationSettings(data.settings || null)
    await fetchSecrets()
  }

  const handleTestNotificationSettings = async (input: NotificationSettingsInput): Promise<NotificationTestResult> => {
    const res = await fetch("/api/settings/notifications/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to send test alert.")
    }
    return data as NotificationTestResult
  }

  const handleSaveRetentionSettings = async (settings: RetentionSettings): Promise<RetentionSettings> => {
    const res = await fetch("/api/settings/retention", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to save retention settings.")
    }
    const updated = (data.settings || settings) as RetentionSettings
    setRetentionSettings(updated)
    return updated
  }

  const handlePurgeRetention = async (): Promise<RetentionPurgeResult> => {
    const res = await fetch("/api/settings/retention/purge", { method: "POST" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to purge expired runs.")
    }
    await fetchRuns()
    return data as RetentionPurgeResult
  }

  const handleSaveCertificateProfile = async (input: CertificateProfileInput) => {
    const url = input.id ? `/api/settings/certificates/${input.id}` : "/api/settings/certificates"
    const res = await fetch(url, {
      method: input.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to save certificate profile.")
    }
    await Promise.all([fetchCertificateProfiles(), fetchSecrets()])
  }

  const handleTestCertificateProfile = async (profile: CertificateProfile): Promise<boolean> => {
    const res = await fetch(`/api/settings/certificates/${profile.id}/test`, { method: "POST" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to test certificate profile.")
    }
    await fetchCertificateProfiles()
    if (data.error) {
      throw new Error(data.error)
    }
    return Boolean(data.ok)
  }

  const handleDeleteCertificateProfile = async (profileId: string) => {
    const res = await fetch(`/api/settings/certificates/${profileId}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || "Failed to delete certificate profile.")
    }
    await fetchCertificateProfiles()
  }

  if (loading && ((applicationId && !activeApplication) || (monitorId && !activeMonitor) || (runId && !activeRun) || (alertId && alerts.length === 0) || (!applicationId && !monitorId && !runId && !alertId))) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <RotateCw className="text-primary size-8 animate-spin" />
          <p className="text-muted-foreground text-sm font-medium">Loading Pulse Console...</p>
        </div>
      </div>
    )
  }

  let viewContent: React.ReactNode

  if (view === "applications") {
    viewContent = (
      <ApplicationsView
        applications={applications}
        monitors={monitors}
        onSaveApplication={handleSaveApplication}
        onRunApplication={handleRunApplication}
        runningAppId={runningApp?.id}
      />
    )
  } else if (view === "application-detail") {
    if (!activeApplication) {
      viewContent = (
        <PageShell eyebrow="Application" title="Application not found">
          <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
            This application group was not found.
          </div>
        </PageShell>
      )
    } else {
      viewContent = (
        <ApplicationDetailView
          application={activeApplication}
          monitors={monitors.filter((monitor) => monitor.applicationId === activeApplication.id)}
          applicationSlo={applicationSLOMap(sloSummary).get(activeApplication.id)}
          onRunApplication={handleRunApplication}
          onRunNow={handleRunNow}
          onToggleActive={handleToggleActive}
          onDeleteMonitor={handleDeleteMonitor}
          onSaveApplication={handleSaveApplication}
          runningAppId={runningApp?.id}
        />
      )
    }
  } else if (view === "monitors") {
    viewContent = (
      <PageShell
        eyebrow="Inventory"
        title="Monitors"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsImportExportOpen(true)}
              className="border-input bg-background hover:bg-muted inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium"
            >
              <Upload className="size-4" />
              Import / Export
            </button>
            <Link href="/monitors/create" className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium">
              <Plus className="size-4" /> New monitor
            </Link>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Search Toolbar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-muted/10 p-3 rounded-lg border border-border/60">
            <div className="relative flex-1 w-full">
              <Input
                placeholder="Search monitors by name or description..."
                value={monitorsSearch}
                onChange={(e) => setMonitorsSearch(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-between sm:justify-start">
              <div className="space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">Status</span>
                <NativeSelect
                  size="sm"
                  value={monitorsStatusFilter}
                  onChange={(e: any) => setMonitorsStatusFilter(e.target.value)}
                  className="w-[110px]"
                >
                  <NativeSelectOption value="all">All</NativeSelectOption>
                  <NativeSelectOption value="active">Active</NativeSelectOption>
                  <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
                  <NativeSelectOption value="healthy">Healthy</NativeSelectOption>
                  <NativeSelectOption value="failed">Failed</NativeSelectOption>
                </NativeSelect>
              </div>

              <div className="space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">Schedule</span>
                <NativeSelect
                  size="sm"
                  value={monitorsScheduleFilter}
                  onChange={(e: any) => setMonitorsScheduleFilter(e.target.value)}
                  className="w-[110px]"
                >
                  <NativeSelectOption value="all">All</NativeSelectOption>
                  <NativeSelectOption value="scheduled">Scheduled</NativeSelectOption>
                  <NativeSelectOption value="manual">Manual only</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
          </div>

          <MonitorTable 
            monitors={filteredMonitors} 
            onRunNow={handleRunNow} 
            onToggleActive={handleToggleActive} 
            onDeleteMonitor={handleDeleteMonitor} 
          />
        </div>
      </PageShell>
    )
  } else if (view === "builder") {
    const defaultNewMonitor: Monitor = {
      id: "",
      applicationId: applications[0]?.id || "",
      name: "New API Monitor",
      description: "",
      scheduleMode: "every-5m",
      scheduleLabel: "Every 5 minutes",
      cron: "*/5 * * * *",
      timezone: "UTC",
      timeoutMs: 30000,
      retryCount: 1,
      failureThreshold: 3,
      responseBodyLimitKb: 32,
      isActive: true,
      variables: {},
      secretAliases: [],
      steps: [
        {
          id: "step-1",
          order: 1,
          name: "Fetch Health Check",
          type: "http",
          method: "GET",
          url: "https://api.example.com/health",
          timeoutMs: 10000,
          retryCount: 1,
          continueOnFailure: false,
          assertions: [
            {
              id: "assert-1",
              type: "statusCode",
              label: "Status code is 200",
              target: "status",
              operator: "equals",
              expected: "200",
            }
          ],
          extractors: [],
        }
      ],
      alertPolicy: {
        enabled: true,
        threshold: 3,
        responseTimeMs: 2000,
        email: true,
        slackWebhook: false,
        cooldownMinutes: 30,
      },
      status: "skipped",
      lastRunAt: new Date().toISOString(),
      lastDurationMs: 0,
      successRate24h: 100,
    }
    viewContent = <Builder monitor={activeMonitor || defaultNewMonitor} applications={applications} certificateProfiles={certificateProfiles} />
  } else if (view === "runs") {
    if (!activeMonitor) {
      viewContent = (
        <PageShell eyebrow="Run history" title="Loading...">
          <div className="text-center text-sm text-muted-foreground p-8">Monitor not found or loading...</div>
        </PageShell>
      )
    } else {
      viewContent = <Runs monitor={activeMonitor} runs={runs} onRefresh={fetchRuns} onRunNow={handleRunNow} />
    }
  } else if (view === "run-detail") {
    if (!activeRun) {
      viewContent = (
        <PageShell eyebrow="Run detail" title="Loading...">
          <div className="text-center text-sm text-muted-foreground p-8">Run not found or loading...</div>
        </PageShell>
      )
    } else {
      viewContent = <RunDetail run={activeRun} />
    }
  } else if (view === "alerts") {
    viewContent = <AlertsHistory alerts={alerts} monitors={monitors} runs={runs} />
  } else if (view === "alert-detail") {
    const activeAlert = alerts.find((alert) => alert.id === alertId)
    if (!activeAlert) {
      viewContent = (
        <PageShell eyebrow="Alert detail" title="Alert not found">
          <div className="space-y-4 rounded-md border bg-card p-6">
            <p className="text-sm text-muted-foreground">This alert event was not found in persisted alert history.</p>
            <Link href="/alerts" className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs font-semibold hover:bg-muted">
              <ArrowLeft className="size-3.5" /> Back to alerts
            </Link>
          </div>
        </PageShell>
      )
    } else {
      const monitor = monitors.find((item) => item.id === activeAlert.monitorId)
      const run = activeAlert.runId ? runs.find((item) => item.id === activeAlert.runId) : undefined
      viewContent = <AlertDetail alert={activeAlert} monitor={monitor} run={run} onAlertUpdated={fetchAlerts} />
    }
  } else if (view === "secrets") {
    viewContent = <Secrets secrets={secrets} onSave={handleSaveSecret} onTest={handleTestSecret} onDelete={handleDeleteSecret} />
  } else if (view === "settings") {
    viewContent = (
      <SettingsView
        notificationSettings={notificationSettings}
        onSaveNotifications={handleSaveNotificationSettings}
        onTestNotifications={handleTestNotificationSettings}
        retentionSettings={retentionSettings}
        onSaveRetention={handleSaveRetentionSettings}
        onPurgeRetention={handlePurgeRetention}
        certificateProfiles={certificateProfiles}
        onSaveCertificateProfile={handleSaveCertificateProfile}
        onTestCertificateProfile={handleTestCertificateProfile}
        onDeleteCertificateProfile={handleDeleteCertificateProfile}
        applications={applications}
        monitors={monitors}
      />
    )
  } else {
    viewContent = (
      <Dashboard
        applications={applications}
        monitors={monitors}
        runs={runs}
        alerts={alerts}
        sloSummary={sloSummary}
        onRunNow={handleRunNow}
        onToggleActive={handleToggleActive}
        onDeleteMonitor={handleDeleteMonitor}
        onSaveApplication={handleSaveApplication}
        onRunApplication={handleRunApplication}
        runningAppId={runningApp?.id}
        onImportExport={() => setIsImportExportOpen(true)}
      />
    )
  }

  return (
    <>
      {viewContent}

      <MonitorImportExportDialog
        open={isImportExportOpen}
        onOpenChange={setIsImportExportOpen}
        mode="inventory"
        applications={applications}
        monitors={monitors}
        onSaved={() => void fetchMonitors()}
      />

      <AlertDialog
        open={confirmDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
          }
        }}
      >
        <AlertDialogContent size={confirmDialog.type === "delete" ? "default" : "sm"}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.type === "delete" ? "Delete Monitor?" : "Disable Monitor?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 text-left">
              {confirmDialog.type === "delete" ? (
                <>
                  <span>
                    This action is permanent. All historical run logs, step configurations, and alert configurations for the monitor{" "}
                    <strong className="text-foreground">"{confirmDialog.monitorName}"</strong> will be permanently deleted.
                  </span>
                  <div className="space-y-2 mt-4 text-left">
                    <label className="text-xs font-semibold text-muted-foreground block">
                      To confirm, please type the monitor name below:
                    </label>
                    <Input
                      placeholder={confirmDialog.monitorName}
                      value={deleteConfirmInput}
                      onChange={(e) => setDeleteConfirmInput(e.target.value)}
                      className="h-9 text-xs"
                      autoFocus
                    />
                  </div>
                </>
              ) : (
                <span>
                  Are you sure you want to disable checking for{" "}
                  <strong className="text-foreground">"{confirmDialog.monitorName}"</strong>? This will pause all background schedules until you re-enable it.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            {confirmDialog.type === "delete" ? (
              <AlertDialogAction
                variant="destructive"
                className="cursor-pointer"
                disabled={deleteConfirmInput !== confirmDialog.monitorName}
                onClick={async () => {
                  await executeDeleteMonitor(confirmDialog.monitorId)
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
                }}
              >
                Delete Monitor
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                className="bg-amber-600 hover:bg-amber-700 text-white cursor-pointer hover:text-white"
                onClick={async () => {
                  await executeToggleActive(confirmDialog.monitorId, confirmDialog.currentActive ?? true)
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
                }}
              >
                Disable Monitor
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!runningApp} onOpenChange={(open) => { if (!open) setRunningApp(null) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              {appRunCompleted ? (
                <CheckCircle2 className={cn("size-4", Object.values(appRunStatus).some(s => s.status === "failed") ? "text-rose-500" : "text-emerald-500")} />
              ) : (
                <RotateCw className="size-4 animate-spin text-primary" />
              )}
              <span>{appRunCompleted ? "Application Run Completed" : "Running Application Checks"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {appRunCompleted ? `Execution reports for ${runningApp?.name} group` : `Triggering background checks for ${runningApp?.name} (${runningApp?.carId})`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-2">
            <div className="text-xs font-semibold text-muted-foreground mb-1">
              Monitors in execution queue:
            </div>
            
            <div className="border border-border/40 rounded-md overflow-hidden bg-muted/10 max-h-[220px] overflow-y-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs w-[60%]">Monitor Name</TableHead>
                    <TableHead className="text-xs w-[20%] text-center">Status</TableHead>
                    <TableHead className="text-xs w-[20%] text-right pr-4">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runningApp && monitors
                    .filter(m => m.applicationId === runningApp.id)
                    .map(m => {
                      const runState = appRunStatus[m.id] || { status: "queued" }
                      return (
                        <TableRow key={m.id} className="hover:bg-transparent py-2.5">
                          <TableCell className="align-middle text-xs font-semibold">
                            <div>
                              {m.name}
                              {runState.error && (
                                <p className="text-[10px] text-rose-500 font-normal mt-0.5 leading-normal max-w-[320px]">
                                  {runState.error}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="align-middle text-center">
                            <span className="inline-flex items-center justify-center">
                              {runState.status === "running" ? (
                                <RotateCw className="size-3.5 animate-spin text-primary" />
                              ) : runState.status === "success" ? (
                                <CheckCircle2 className="size-4 text-emerald-500" />
                              ) : runState.status === "failed" ? (
                                <AlertTriangle className="size-4 text-rose-500" />
                              ) : runState.status === "skipped" ? (
                                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/50">Skipped</span>
                              ) : (
                                <span className="size-2 rounded-full bg-muted-foreground/35 animate-pulse" />
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="align-middle text-right pr-4 text-xs font-medium text-muted-foreground">
                            {runState.durationMs !== undefined ? `${runState.durationMs}ms` : "—"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                </TableBody>
              </Table>
            </div>

            {/* Application Run Execution Report */}
            {appRunCompleted && (
              <div className="mt-3 border border-border/40 bg-card p-3.5 rounded-lg space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Activity className="size-3.5 text-primary" /> Run Execution Report
                </h3>
                
                {/* Metrics row */}
                <div className="grid grid-cols-3 gap-2 text-center border-b border-border/20 pb-3">
                  <div className="bg-muted/10 p-2 rounded">
                    <span className="text-[10px] text-muted-foreground block font-medium">Checks Run</span>
                    <span className="text-sm font-bold text-foreground">
                      {Object.values(appRunStatus).filter(s => s.status !== "skipped").length}
                    </span>
                  </div>
                  <div className="bg-muted/10 p-2 rounded">
                    <span className="text-[10px] text-muted-foreground block font-medium">Passed</span>
                    <span className="text-sm font-bold text-emerald-500">
                      {Object.values(appRunStatus).filter(s => s.status === "success").length}
                    </span>
                  </div>
                  <div className="bg-muted/10 p-2 rounded">
                    <span className="text-[10px] text-muted-foreground block font-medium">Failed</span>
                    <span className={cn(
                      "text-sm font-bold",
                      Object.values(appRunStatus).filter(s => s.status === "failed").length > 0
                        ? "text-rose-500"
                        : "text-foreground"
                    )}>
                      {Object.values(appRunStatus).filter(s => s.status === "failed").length}
                    </span>
                  </div>
                </div>
                
                {/* Latency and Warning summaries */}
                <div className="text-xs space-y-1.5">
                  {(() => {
                    const activeRuns = Object.values(appRunStatus).filter(s => s.status !== "skipped" && s.durationMs !== undefined)
                    const avg = activeRuns.length > 0 
                      ? Math.round(activeRuns.reduce((sum, s) => sum + (s.durationMs || 0), 0) / activeRuns.length)
                      : 0
                    
                    const slowest = Object.entries(appRunStatus)
                      .filter(([_, s]) => s.status !== "skipped" && s.durationMs !== undefined)
                      .map(([id, s]) => {
                        const m = monitors.find(m => m.id === id)
                        return { name: m?.name || "Monitor", durationMs: s.durationMs || 0 }
                      })
                      .sort((a, b) => b.durationMs - a.durationMs)[0]

                    const highLatencyChecks = Object.entries(appRunStatus)
                      .filter(([_, s]) => s.status !== "skipped" && s.durationMs !== undefined && (s.durationMs || 0) > 500)
                      .map(([id, s]) => {
                        const m = monitors.find(m => m.id === id)
                        return { name: m?.name || "Monitor", durationMs: s.durationMs || 0 }
                      })

                    const failedCount = Object.values(appRunStatus).filter(s => s.status === "failed").length
                    
                    return (
                      <>
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span>Average Response Latency:</span>
                          <span className="font-semibold text-foreground">{avg}ms</span>
                        </div>
                        {slowest && (
                          <div className="flex justify-between items-center text-muted-foreground">
                            <span>Slowest Check Run:</span>
                            <span className="font-semibold text-foreground">
                              {slowest.name} ({slowest.durationMs}ms)
                            </span>
                          </div>
                        )}
                        
                        {/* High Latency Warnings */}
                        {highLatencyChecks.length > 0 && (
                          <div className="mt-2 bg-amber-500/10 border border-amber-500/25 p-2 rounded text-[11px] text-amber-600 dark:text-amber-400 space-y-1">
                            <span className="font-bold flex items-center gap-1">
                              <AlertTriangle className="size-3" /> High Latency Warning (&gt;500ms)
                            </span>
                            <ul className="list-disc list-inside space-y-0.5">
                              {highLatencyChecks.map((c, i) => (
                                <li key={i}>{c.name} took <span className="font-semibold">{c.durationMs}ms</span></li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* General Health Summary Message */}
                        <div className={cn(
                          "mt-3 p-2.5 rounded-md border font-semibold text-center text-xs",
                          failedCount > 0
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                        )}>
                          {failedCount > 0 
                            ? `⚠️ Outage Alert: ${failedCount} test check${failedCount === 1 ? "" : "s"} failed. Please check endpoint configurations.`
                            : "✅ All checks passed successfully! Application health is optimal."
                          }
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="border-t border-border/20 pt-3 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Info className="size-3" /> {appRunCompleted ? "Execution complete." : "Background execution running..."}
            </p>
            <Button
              size="sm"
              onClick={() => setRunningApp(null)}
              className="h-8 text-xs cursor-pointer"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
