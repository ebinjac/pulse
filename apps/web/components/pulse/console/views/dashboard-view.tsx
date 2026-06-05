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
import {
  Button,
  Card,
  Chip,
  Description,
  EmptyState,
  Label,
  ListBox,
  SearchField,
  Select,
  Tabs,
} from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"

import { applicationHealth, dateTimeLocalToISOString, toDateTimeLocalInput, validationStatusLabel } from "../utils/console-utils"
import type { DeploymentValidationCreateInput } from "../types"
import { AlertFeed } from "../components/alert-feed"
import { DeploymentValidationPanel } from "../components/deployment-validation-panel"
import { HistoryPatternAnalysis } from "../components/history-pattern-analysis"
import { MonitorTable } from "../components/monitor-table"
import { SchedulerStatusCard } from "../components/scheduler-status-card"
import { ValidationResultPill } from "../components/validation-result-pill"
import { ApplicationsView } from "./applications-view"


export interface DashboardProps {
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

export function Dashboard({
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
            <Button variant="secondary" onPress={onImportExport} className="h-9 gap-2 text-xs font-semibold">
              <Upload className="size-4" />
              Import / Export
            </Button>
          ) : null}
          <Link href="/monitors/create" className="inline-flex">
            <Button className="h-9 gap-2 px-3.5 text-xs font-semibold">
              <Plus className="size-4" />
              New Monitor
            </Button>
          </Link>
        </div>
      }
    >
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(String(key))}
        variant="secondary"
        className="w-full gap-6"
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Dashboard sections">
            <Tabs.Tab id="overview">
              <Activity className="size-3.5" />
              Overview
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="applications">
              <Boxes className="size-3.5" />
              Applications
              <span className="ml-1 rounded-full bg-muted/10 dark:bg-muted/30 px-1.5 py-0.5 text-[10px] font-bold border border-border/40 text-muted-foreground">
                {applications.length}
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="inventory">
              <Workflow className="size-3.5" />
              Monitors
              <span className="ml-1 rounded-full bg-muted/10 dark:bg-muted/30 px-1.5 py-0.5 text-[10px] font-bold border border-border/40 text-muted-foreground">
                {monitors.length}
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="history">
              <Timer className="size-3.5" />
              Run History
              <span className="ml-1 rounded-full bg-muted/10 dark:bg-muted/30 px-1.5 py-0.5 text-[10px] font-bold border border-border/40 text-muted-foreground">
                {runs.length}
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="overview" className="space-y-6">
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
              tone="success"
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
              tone="danger"
              trend={failing > 0 ? { text: "Needs review", positive: false } : { text: "System healthy", positive: true }}
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
              tone="accent"
            />
          </div>

          {/* Response Time Trend Chart */}
          <div className="w-full">
            <LatencyChart runs={runs} />
          </div>

          {/* Failures & Slowest Monitors Columns */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Recent Failures */}
            <Card>
              <Card.Header >
                <Card.Title className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <AlertTriangle className="size-3.5 text-danger" />
                  Recent Failures
                </Card.Title>
              </Card.Header>
              <Card.Content className="space-y-3 pt-4 text-xs font-semibold text-foreground">
                {recentFailures.length === 0 ? (
                  <EmptyState className="flex flex-col items-center justify-center gap-2 border-0 bg-transparent py-4 text-center">
                    <CheckCircle2 className="size-6 text-success" aria-hidden />
                    <p className="text-sm font-semibold text-success">All endpoints healthy</p>
                    <Description className="text-xs">No recent failures recorded for active monitors.</Description>
                  </EmptyState>
                ) : (
                  recentFailures.map((m) => (
                    <div key={m.id} className="flex flex-col gap-1 border-b border-border/40 pb-2.5 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/monitors/${m.id}/runs`} className="font-bold text-foreground transition-colors hover:text-primary hover:underline truncate max-w-[200px]">
                          {m.name}
                        </Link>
                        <Chip color="danger" variant="primary" className="text-[10px]">
                          <Chip.Label>Failed</Chip.Label>
                        </Chip>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] font-normal leading-4 text-danger" title={getMonitorFailureDetails(m.id)}>
                        {getMonitorFailureDetails(m.id)}
                      </p>
                      <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">
                        Last run: {m.lastRunAt ? formatDate(m.lastRunAt) : "Never"}
                      </span>
                    </div>
                  ))
                )}
              </Card.Content>
            </Card>

            {/* Slowest Monitors */}
            <Card>
              <Card.Header >
                <Card.Title className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Timer className="size-3.5 text-warning" />
                  Slowest Monitors
                </Card.Title>
              </Card.Header>
              <Card.Content className="space-y-3 pt-4 text-xs font-semibold text-foreground">
                {slowestMonitors.length === 0 ? (
                  <EmptyState className="flex flex-col items-center justify-center gap-2 border-0 bg-transparent py-4 text-center">
                    <Timer className="size-6 text-muted" aria-hidden />
                    <p className="text-sm font-semibold">No latency stats available</p>
                    <Description className="text-xs">Run checks to compile response duration metrics.</Description>
                  </EmptyState>
                ) : (
                  slowestMonitors.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 border-b border-border/40 pb-2.5 last:border-b-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <Link href={`/monitors/${m.id}/runs`} className="block truncate font-bold text-foreground transition-colors hover:text-primary hover:underline">
                          {m.name}
                        </Link>
                        <span className="mt-0.5 block text-[10px] font-medium text-muted-foreground">
                          {m.scheduleLabel || "Manual"} · {m.timezone}
                        </span>
                      </div>
                      <span className={cn(
                        "rounded border px-2 py-0.5 text-xs font-bold font-heading",
                        m.alertPolicy?.responseTimeMs && (m.lastDurationMs || 0) > m.alertPolicy.responseTimeMs
                          ? "border-danger/30 bg-danger/10 text-danger"
                          : "border-border/50 bg-muted text-foreground"
                      )}>
                        {m.lastDurationMs || 0}ms
                      </span>
                    </div>
                  ))
                )}
              </Card.Content>
            </Card>
          </div>

          <ErrorBudgetWidget summary={sloSummary} />

          <AlertFeed alerts={alerts} />
        </Tabs.Panel>

        <Tabs.Panel id="applications" className="space-y-6">
          <ApplicationsView
            applications={applications}
            monitors={monitors}
            applicationSloMap={applicationSloLookup}
            onSaveApplication={onSaveApplication}
            onRunApplication={onRunApplication}
            runningAppId={runningAppId}
            embedded={true}
          />
        </Tabs.Panel>

        <Tabs.Panel id="inventory" className="space-y-4">
          {/* Search Toolbar */}
          <div className="flex flex-col items-center gap-3 rounded-lg  sm:flex-row">
            <div className=" space-y-1 flex-1">
              <Label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Search</Label>
              <SearchField
              value={monitorSearch}
              onChange={setMonitorSearch}
              className="flex-1"
            >
              <SearchField.Group >
                <SearchField.SearchIcon />
                <SearchField.Input
                  className="w-full"
                  placeholder="Search monitors by name or description..."
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            </div>
            
            <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-start">
              <div className="space-y-1">
                <Label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Status</Label>
                <Select
                  className="w-[130px]"
                  variant="secondary"
                  value={monitorStatusFilter}
                  onChange={(value) => setMonitorStatusFilter((value as typeof monitorStatusFilter) ?? "all")}
                  aria-label="Filter by status"
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="all" textValue="All">All</ListBox.Item>
                      <ListBox.Item id="active" textValue="Active">Active</ListBox.Item>
                      <ListBox.Item id="inactive" textValue="Inactive">Inactive</ListBox.Item>
                      <ListBox.Item id="healthy" textValue="Healthy">Healthy</ListBox.Item>
                      <ListBox.Item id="failed" textValue="Failed">Failed</ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Schedule</Label>
                <Select
                  className="w-[130px]"
                  variant="secondary"
                  value={monitorScheduleFilter}
                  onChange={(value) => setMonitorScheduleFilter((value as typeof monitorScheduleFilter) ?? "all")}
                  aria-label="Filter by schedule"
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="all" textValue="All">All</ListBox.Item>
                      <ListBox.Item id="scheduled" textValue="Scheduled">Scheduled</ListBox.Item>
                      <ListBox.Item id="manual" textValue="Manual only">Manual only</ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
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
        </Tabs.Panel>

        <Tabs.Panel id="history" className="space-y-4">
          <div className="grid w-full gap-6 xl:grid-cols-[300px_1fr]">
            <div className="min-w-0 space-y-4">
              {/* Execution Status Card */}
              <Card>
                <Card.Header className="border-b">
                  <Card.Title className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <Play className="size-3.5" />
                    Execution Status
                  </Card.Title>
                </Card.Header>
                <Card.Content className="space-y-3 pt-4 text-xs font-semibold text-foreground">
                  <div className="flex justify-between border-b border-border/30 pb-2.5">
                    <span className="font-medium text-muted-foreground">Scheduler</span>
                    <span className="flex items-center gap-1 font-bold text-success">
                      <span className="size-1.5 animate-pulse rounded-full bg-success" />
                      Healthy
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-border/30 pb-2.5">
                    <span className="font-medium text-muted-foreground">Active Monitors</span>
                    <span>{active} configured</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-muted-foreground">Last Tick</span>
                    <span className="font-mono font-bold text-muted-foreground">{lastTickTime}</span>
                  </div>
                </Card.Content>
              </Card>

              {/* Alert Policy Config */}
              <Card >
                <Card.Header className="border-b">
                  <Card.Title className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <Bell className="size-3.5" />
                    Alert Policy
                  </Card.Title>
                </Card.Header>
                <Card.Content className="space-y-3 pt-4 text-xs font-semibold text-foreground">
                  <div className="flex justify-between border-b border-border/30 pb-2.5">
                    <span className="font-medium text-muted-foreground">Channels</span>
                    <span>Email + Slack</span>
                  </div>
                  <div className="flex justify-between border-b border-border/30 pb-2.5">
                    <span className="font-medium text-muted-foreground">Threshold</span>
                    <span>3 failures</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-muted-foreground">Cooldown</span>
                    <span>30 minutes</span>
                  </div>
                </Card.Content>
              </Card>
            </div>

            {/* Run History Tab Logs Table */}
            <div className="min-w-0 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-heading text-sm font-semibold tracking-tight text-foreground">Latest Execution Logs</h3>
                  <p className="text-xs font-medium text-muted-foreground">Click any row to expand details, steps, and assertions logs.</p>
                </div>
              </div>
              <Card className="min-w-0 overflow-x-auto">
                <div className="min-w-[800px] p-2">
                  <div className="grid grid-cols-[85px_150px_1.5fr_90px_100px_140px] gap-3 border-b border-border/40 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <span>Status</span>
                    <span>Run ID</span>
                    <span>Monitor</span>
                    <span>Duration</span>
                    <span>Trigger</span>
                    <span>Time</span>
                  </div>
                  <div className="divide-y divide-border/30 text-xs font-medium">
                    {runs.length === 0 ? (
                      <EmptyState className="flex flex-col items-center justify-center gap-2 border-0 bg-transparent py-8 text-center">
                        <Workflow className="size-6 text-muted" aria-hidden />
                        <p className="text-sm font-semibold">No execution runs</p>
                        <Description className="text-xs">
                          Trigger a monitor run manually or wait for the scheduler check.
                        </Description>
                      </EmptyState>
                    ) : (
                      runs.slice(0, 10).map((run) => {
                        const isRowExpanded = historyExpandedRowId === run.id
                        const firstFailedStep = run.steps?.find((s) => s.status === "failed")
                        return (
                          <div key={run.id} className="transition-colors">
                            {/* Clickable Header Row */}
                            <div
                              onClick={() => setHistoryExpandedRowId(isRowExpanded ? null : run.id)}
                              className="grid grid-cols-[85px_150px_1.5fr_90px_100px_140px] cursor-pointer items-center gap-3 px-4 py-3 hover:bg-default/40"
                            >
                              <div>
                                <StatusPill status={run.status} />
                              </div>
                              <div className="truncate font-mono font-semibold text-muted-foreground/80 select-all" title={run.id}>
                                {run.id}
                              </div>
                              <span className="truncate font-bold text-foreground">{run.monitorName}</span>
                              <span className="font-heading font-semibold text-foreground">{run.durationMs}ms</span>
                              <span className="font-medium capitalize text-muted-foreground">{run.triggeredBy}</span>
                              <span className="text-[11px] font-medium text-muted-foreground">{formatDate(run.startedAt)}</span>
                            </div>

                            {/* Expandable step logs block */}
                            {isRowExpanded && (
                              <div className="space-y-4 border-t border-border/20 px-4 pb-4 pt-2">
                                {run.failureReason && (
                                  <div className="rounded-lg border border-danger/30 bg-danger/5 p-3.5 font-mono text-[11px] text-danger">
                                    <div className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-danger">
                                      <AlertTriangle className="size-3" />
                                      Outage Category: {run.failureCategory || "ERROR"}
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap leading-5">{run.failureReason}</p>
                                  </div>
                                )}

                                <div className="space-y-2">
                                  <div className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Execution Steps</div>
                                  {(run.steps || []).map((step) => (
                                    <div key={step.id} className="grid grid-cols-[150px_1fr_90px] items-center gap-4 rounded-lg border border-border/30 bg-default/40 p-3">
                                      <div>
                                        <div className="truncate font-semibold text-foreground" title={step.stepName}>{step.stepName}</div>
                                        <div className="mt-0.5 text-[9px] font-bold uppercase text-muted-foreground">{step.type}</div>
                                      </div>
                                      <div className="truncate font-mono text-[11px] leading-5 text-muted-foreground" title={step.responseSummary}>{step.responseSummary}</div>
                                      <div className="flex flex-col items-end gap-1 text-right">
                                        <span className="origin-right scale-90"><StatusPill status={step.status} /></span>
                                        <span className="mt-0.5 text-[10px] font-semibold text-muted-foreground">{step.latencyMs}ms</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="flex justify-end pt-1">
                                  <Link href={`/runs/${run.id}`} className="inline-flex">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      className="h-7 gap-1 px-3 text-[11px] font-semibold"
                                    >
                                      View Diagnostic Details
                                    </Button>
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
        </Tabs.Panel>
      </Tabs>
    </PageShell>
  )
}
