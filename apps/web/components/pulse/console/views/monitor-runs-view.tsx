"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  Bell,
  Braces,
  CheckCircle2,
  KeyRound,
  LineChart,
  Play,
  RotateCw,
  Settings,
  Timer,
  Workflow,
} from "lucide-react"

import Editor from "@monaco-editor/react"
import { useTheme } from "next-themes"

import {
  formatDate,
  isFailedStatus,
  isSuccessStatus,
  Metric,
  MonitorRunsChart,
  PageShell,
  StatusPill,
} from "@/components/pulse/console-shared"
import { RunTimeline } from "./run-views"
import type { Monitor, MonitorRun } from "@/lib/pulse-types"
import { Button, Card as HeroCard, Chip, Description, EmptyState, SearchField, Tabs } from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"

import { HistoryPatternAnalysis } from "../components/history-pattern-analysis"

export interface RunsProps {
  monitor: Monitor
  runs: MonitorRun[]
  onRefresh: () => void
  onRunNow?: (monitorId: string) => void
}

export function Runs({ monitor, runs, onRefresh, onRunNow }: RunsProps) {
  const { resolvedTheme } = useTheme()
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
              onPress={() => onRunNow(monitor.id)}
              className="gap-1 font-semibold"
            >
              <Play className="size-3.5" /> Run Now
            </Button>
          )}
          <Link href={`/monitors/${monitor.id}/edit`} className="inline-flex">
            <Button variant="secondary" size="sm" className="h-8 text-xs font-semibold">
              Edit Monitor
            </Button>
          </Link>
          <Button variant="secondary" size="sm" onPress={onRefresh} className="gap-1 h-8 text-xs font-semibold">
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

        <Tabs
          defaultSelectedKey="overview"
          variant="secondary"
          className="w-full gap-6"
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="Monitor sections">
              <Tabs.Tab id="overview" className=" gap-1">
                <Activity className="size-3.5" />
                Overview
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="metrics" className=" gap-1">
                <LineChart className="size-3.5" />
                Metrics
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="runs" className=" gap-1">
                <Timer className="size-3.5" />
                Runs
                <span className="ml-1 rounded-full bg-muted/5 dark:bg-muted/30 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {monitorRuns.length}
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="steps" className=" gap-1">
                <Braces className="size-3.5" />
                Steps
                <span className="ml-1 rounded-full bg-muted/5 dark:bg-muted/30 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {monitor.steps?.length || 0}
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="alerts" className=" gap-1">
                <Bell className="size-3.5" />
                Alerts
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="settings" className=" gap-1">
                <Settings className="size-3.5" />
                Settings
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="overview" className="space-y-6">
            <HistoryPatternAnalysis monitor={monitor} runs={runs} />
            {/* Last Failure Card */}
            {lastFailedRun && (
              <HeroCard className="border-danger/30 bg-danger/5 dark:bg-danger/10">
                <HeroCard.Header>
                  <HeroCard.Title className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-danger">
                    <AlertTriangle className="size-3.5" />
                    Last Failure
                  </HeroCard.Title>
                  <Description className="text-[11px] text-danger">
                    Detailed diagnosis of the most recent failing run.
                  </Description>
                </HeroCard.Header>
                <HeroCard.Content className="space-y-3 font-mono text-xs">
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-danger/20 pb-2">
                    <span className="font-semibold text-muted-foreground">Failed Step:</span>
                    <span className="font-bold text-foreground">{failedStep?.stepName || "Unknown Step"}</span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-danger/20 pb-2">
                    <span className="font-semibold text-muted-foreground">Error Reason:</span>
                    <span className="whitespace-pre-wrap font-bold leading-5 text-danger">{lastFailedRun.failureReason || failedStep?.errorMessage || "Assertion error"}</span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2">
                    <span className="font-semibold text-muted-foreground">Time:</span>
                    <span className="text-foreground">{formatDate(lastFailedRun.startedAt)}</span>
                  </div>
                </HeroCard.Content>
              </HeroCard>
            )}

            {/* Recent execution runs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-sm font-semibold tracking-tight text-foreground">Recent execution runs</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">showing last 5</span>
              </div>
              <div className="space-y-3">
                {monitorRuns.slice(0, 5).map((run) => (
                  <RunTimeline key={run.id} run={run} />
                ))}
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="metrics" className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Total runs"
                value={String(stats.total)}
                detail="Stored executions"
                icon={Timer}
                tone="accent"
              />
              <Metric
                label="Success rate"
                value={`${stats.rate}%`}
                detail={`${monitorRuns.filter((run) => isSuccessStatus(run.status)).length} passed`}
                icon={CheckCircle2}
                tone={stats.rate >= 95 ? "success" : stats.rate >= 80 ? "warning" : "danger"}
              />
              <Metric
                label="Avg latency"
                value={`${stats.avg}ms`}
                detail="Mean response time"
                icon={Activity}
                tone="default"
              />
              <Metric
                label="Peak latency"
                value={`${stats.peak}ms`}
                detail={
                  monitor.alertPolicy?.responseTimeMs && stats.peak > monitor.alertPolicy.responseTimeMs
                    ? "Above alert threshold"
                    : "Highest recorded"
                }
                icon={LineChart}
                tone={
                  monitor.alertPolicy?.responseTimeMs && stats.peak > monitor.alertPolicy.responseTimeMs
                    ? "danger"
                    : "default"
                }
              />
            </div>

            <MonitorRunsChart runs={monitorRuns} />
          </Tabs.Panel>

          <Tabs.Panel id="runs" className="space-y-4">
            {/* Collapsible Filters */}
            <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <SearchField
                    aria-label="Search runs"
                    className="h-9 [&_[data-slot=input-wrapper]]:h-9 [&_[data-slot=input]]:h-9 [&_[data-slot=input]]:text-xs"
                  >
                    <SearchField.Group className="h-9">
                      <SearchField.SearchIcon />
                      <SearchField.Input
                        placeholder="Search runs by ID, trigger, failure reason..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.currentTarget.value)}
                      />
                      <SearchField.ClearButton />
                    </SearchField.Group>
                  </SearchField>
                </div>
                <div className="flex h-9 shrink-0 rounded-md bg-muted p-0.5">
                  {(["all", "success", "failed"] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={cn(
                        "cursor-pointer rounded-md px-3 text-[11px] font-semibold capitalize transition-all",
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
                  variant="secondary"
                  size="sm"
                  onPress={() => setAdvancedOpen(!advancedOpen)}
                  className="h-9 shrink-0 gap-1 text-xs font-medium"
                >
                  Filters
                  <span className="text-[10px] text-muted-foreground">
                    {advancedOpen ? "▲" : "▼"}
                  </span>
                </Button>
              </div>

              {advancedOpen && (
                <div className="grid gap-3 border-t border-border/40 pt-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Trigger Source</span>
                    <div className="flex h-8 w-fit rounded-md bg-muted p-0.5">
                      {(["all", "manual", "scheduled"] as const).map((trigger) => (
                        <button
                          key={trigger}
                          onClick={() => setTriggerFilter(trigger)}
                          className={cn(
                            "cursor-pointer rounded-md px-3 text-[10px] font-semibold capitalize transition-all",
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
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Minimum Latency (ms)</span>
                    <SearchField
                      aria-label="Minimum latency"
                      className="h-8 max-w-[200px] [&_[data-slot=input-wrapper]]:h-8 [&_[data-slot=input]]:h-8 [&_[data-slot=input]]:text-xs"
                    >
                      <SearchField.Group className="h-8">
                        <SearchField.Input
                          type="number"
                          inputMode="numeric"
                          placeholder="e.g. 500"
                          value={minLatency}
                          onChange={(e) => setMinLatency(e.currentTarget.value)}
                        />
                      </SearchField.Group>
                    </SearchField>
                  </div>
                </div>
              )}
            </div>

            {/* Run History Table */}
            <HeroCard className="min-w-0 overflow-x-auto">
              <div className="min-w-[800px] p-2">
                <div className="grid grid-cols-[85px_170px_100px_90px_140px_1fr] gap-3 border-b px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Status</span>
                  <span>Run ID</span>
                  <span>Trigger</span>
                  <span>Duration</span>
                  <span>Started At</span>
                  <span>Failure Details</span>
                </div>
                <div className="divide-y divide-border/40 text-xs">
                  {filteredRuns.length === 0 ? (
                    <EmptyState className="flex flex-col items-center justify-center gap-2 border-0 bg-transparent py-8 text-center">
                      <Workflow className="size-5 text-muted-foreground" />
                      <h4 className="text-sm font-semibold text-foreground">No matching logs</h4>
                      <Description>
                        Try adjusting search query or active filter settings.
                      </Description>
                    </EmptyState>
                  ) : (
                    filteredRuns.map((run) => {
                      const isRowExpanded = expandedRowId === run.id
                        const firstFailedStep = run.steps?.find((s) => isFailedStatus(s.status))
                      return (
                        <div key={run.id} className="transition-colors hover:bg-muted/5">
                          {/* Clickable Header Row */}
                          <div
                            onClick={() => setExpandedRowId(isRowExpanded ? null : run.id)}
                            className="grid grid-cols-[85px_170px_100px_90px_140px_1fr] cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/20"
                          >
                            <div>
                              <StatusPill status={run.status} />
                            </div>
                            <div className="truncate font-mono font-semibold text-muted-foreground/80 select-all" title={run.id}>
                              {run.id}
                            </div>
                            <span className="font-medium capitalize text-foreground">{run.triggeredBy}</span>
                            <span className="font-heading font-semibold text-foreground">{run.durationMs}ms</span>
                            <span className="text-[11px] font-medium text-muted-foreground">{formatDate(run.startedAt)}</span>
                            <div className="truncate pr-2 text-[11px] text-muted-foreground" title={run.failureReason}>
                              {isFailedStatus(run.status) ? (
                                <span className="font-semibold text-danger">
                                  {firstFailedStep ? `[${firstFailedStep.stepName}] ` : ""}
                                  {run.failureReason || firstFailedStep?.errorMessage || "Outage"}
                                </span>
                              ) : (
                                <span className="font-medium text-success">Completed successfully</span>
                              )}
                            </div>
                          </div>

                          {/* Expandable step logs block */}
                          {isRowExpanded && (
                            <div className="space-y-4 border-t border-border/20 bg-muted/5 px-4 pb-4 pt-2">
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
                                  <div key={step.id} className="grid grid-cols-[150px_1fr_90px] items-center gap-4 rounded-lg border border-border/30 bg-muted/20 p-3">
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
                                  <Button variant="secondary" size="sm" className="h-7 gap-1 text-[11px] font-semibold">
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
            </HeroCard>
          </Tabs.Panel>

          <Tabs.Panel id="steps" className="space-y-4">
            <div className="space-y-4">
              <div>
                <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">Configured Steps</h3>
                <p className="text-xs font-medium text-muted-foreground">Steps executed sequentially in this synthetic monitoring pipeline.</p>
              </div>

              {(!monitor.steps || monitor.steps.length === 0) ? (
                <HeroCard>
                  <HeroCard.Content className="py-6">
                    <EmptyState className="flex flex-col items-center justify-center gap-2 border-0 bg-transparent py-4 text-center">
                      <Braces className="size-5 text-muted-foreground" />
                      <h4 className="text-sm font-semibold text-foreground">No steps configured</h4>
                      <Description>
                        Add HTTP check requests or script steps in the editor.
                      </Description>
                    </EmptyState>
                  </HeroCard.Content>
                </HeroCard>
              ) : (
                monitor.steps.map((step) => (
                  <HeroCard key={step.id}>
                    <HeroCard.Header className="border-b border-border/40 pb-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full">
                        <HeroCard.Title className="flex items-center gap-2 text-sm font-bold">
                          <span className="rounded-lg bg-primary/10 border border-primary/20 text-primary px-2.5 py-0.5 font-mono text-[10px] font-bold">Step {step.order}</span>
                          <span className="text-foreground font-semibold">{step.name}</span>
                        </HeroCard.Title>
                        <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-semibold">
                          <span>Timeout: <strong className="text-foreground font-semibold">{step.timeoutMs}ms</strong></span>
                          <span className="text-muted-foreground/30">•</span>
                          <span>Retries: <strong className="text-foreground font-semibold">{step.retryCount}</strong></span>
                        </div>
                      </div>
                    </HeroCard.Header>
                    <HeroCard.Content className="space-y-5 pt-4 text-xs font-semibold text-foreground">
                      <div className="flex items-center gap-3 overflow-x-auto rounded-xl border border-border/40 bg-background/50 p-3 font-mono text-xs shadow-xs">
                        <Chip
                          size="sm"
                          variant="primary"
                          color={
                            step.method === "GET" ? "default" :
                            step.method === "POST" ? "success" :
                            step.method === "PUT" ? "warning" : "default"
                          }
                          className="shrink-0"
                        >
                          <Chip.Label>{step.method || step.type}</Chip.Label>
                        </Chip>
                        <span className="truncate select-all text-foreground font-semibold">{step.url || "Manual/non-HTTP check"}</span>
                      </div>

                      {step.preRequestScript && (
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold tracking-wider text-muted-foreground/85 block">Pre-request JavaScript script</span>
                          <div className="relative overflow-hidden rounded-xl border border-border/30 bg-background shadow-xs h-[240px]">
                            <Editor
                              height="240px"
                              language="javascript"
                              theme={resolvedTheme === "light" ? "light" : "vs-dark"}
                              value={step.preRequestScript}
                              options={{
                                readOnly: true,
                                minimap: { enabled: false },
                                fontSize: 11,
                                fontFamily: "var(--font-mono), monospace",
                                lineNumbers: "on",
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: { top: 12, bottom: 12 },
                                tabSize: 2,
                                fixedOverflowWidgets: true,
                                domReadOnly: true,
                                lineDecorationsWidth: 0,
                                lineNumbersMinChars: 3,
                                glyphMargin: false,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {step.assertions && step.assertions.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold tracking-wider text-muted-foreground/85 block">Assertions ({step.assertions.length})</span>
                          <div className="grid gap-2.5 sm:grid-cols-2">
                            {step.assertions.map((assertion) => (
                              <div key={assertion.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-background/50 p-3 font-semibold text-foreground text-xs shadow-xs">
                                <span>{assertion.label || `${assertion.target} ${assertion.operator} ${assertion.expected}`}</span>
                                <span className="rounded-lg bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-extrabold text-primary">
                                  {assertion.type}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {step.extractors && step.extractors.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold tracking-wider text-muted-foreground/85 block">Variables extractors ({step.extractors.length})</span>
                          <div className="grid gap-2.5 sm:grid-cols-2">
                            {step.extractors.map((extractor) => (
                              <div key={extractor.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-background/50 p-3 font-mono text-xs font-semibold text-foreground shadow-xs">
                                <span className="truncate">{extractor.name} = extract({extractor.source})</span>
                                <span className="rounded-lg bg-secondary/10 border border-secondary/20 px-2 py-0.5 text-[9px] font-extrabold text-secondary">
                                  {extractor.type}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </HeroCard.Content>
                  </HeroCard>
                ))
              )}
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="alerts" className="space-y-6">
            <div className="space-y-6">
              <div>
                <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">Alert Policy Config</h3>
                <p className="text-xs font-medium text-muted-foreground">Rules triggered automatically to alert developers when this endpoint degrades or breaks.</p>
              </div>

              <div className={cn(
                "flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-semibold w-fit",
                monitor.alertPolicy?.enabled 
                  ? "bg-success/10 text-success" 
                  : "bg-muted-foreground/10 text-muted-foreground"
              )}>
                <span className={cn(
                  "size-2 rounded-full",
                  monitor.alertPolicy?.enabled ? "bg-success animate-pulse" : "bg-muted-foreground/50"
                )} />
                <span>Alerts: {monitor.alertPolicy?.enabled ? "Enabled" : "Disabled"}</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-muted/15 p-5 transition-all hover:bg-muted/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 block">Failure threshold</span>
                  <div className="font-heading mt-1.5 text-lg font-bold text-foreground">{monitor.alertPolicy?.threshold || monitor.failureThreshold} Outages</div>
                  <p className="mt-1 text-[11px] font-normal text-muted-foreground/80 leading-relaxed">Consecutive failures before alert triggers.</p>
                </div>
                <div className="rounded-2xl bg-muted/15 p-5 transition-all hover:bg-muted/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 block">Target response time</span>
                  <div className="font-heading mt-1.5 text-lg font-bold text-foreground">{monitor.alertPolicy?.responseTimeMs || 2000}ms</div>
                  <p className="mt-1 text-[11px] font-normal text-muted-foreground/80 leading-relaxed">Response times above this trigger slow-warning alerts.</p>
                </div>
                <div className="rounded-2xl bg-muted/15 p-5 transition-all hover:bg-muted/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 block">Cooldown timer</span>
                  <div className="font-heading mt-1.5 text-lg font-bold text-foreground">{monitor.alertPolicy?.cooldownMinutes || 30} mins</div>
                  <p className="mt-1 text-[11px] font-normal text-muted-foreground/80 leading-relaxed">Minutes before repeating alert reminders.</p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Target recipient channels</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-3.5 rounded-2xl bg-muted/15 p-4.5 transition-all hover:bg-muted/20">
                    <span className={cn(
                      "size-2.5 rounded-full shrink-0",
                      monitor.alertPolicy?.email ? "bg-success animate-pulse" : "bg-muted-foreground/30"
                    )} />
                    <div>
                      <span className="text-xs font-bold text-foreground block">Email notifications</span>
                      <p className="mt-0.5 text-[11px] font-normal text-muted-foreground/80 leading-relaxed">Sent to workspace administrator alerts registry.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3.5 rounded-2xl bg-muted/15 p-4.5 transition-all hover:bg-muted/20">
                    <span className={cn(
                      "size-2.5 rounded-full shrink-0",
                      monitor.alertPolicy?.slackWebhook ? "bg-success animate-pulse" : "bg-muted-foreground/30"
                    )} />
                    <div>
                      <span className="text-xs font-bold text-foreground block">Slack webhook channels</span>
                      <p className="mt-0.5 text-[11px] font-normal text-muted-foreground/80 leading-relaxed">Webhook integrations push failures immediately to channel feed.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="settings" className="space-y-6">
            <div className="space-y-6">
              <div>
                <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">General Monitor Settings</h3>
                <p className="text-xs font-medium text-muted-foreground">Properties controlling runtime execution, limits, variables, and timezone configurations.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-2xl bg-muted/15 p-5 transition-all hover:bg-muted/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 block">Timezone</span>
                  <div className="font-mono text-sm font-semibold text-foreground mt-1.5">{monitor.timezone}</div>
                </div>
                <div className="rounded-2xl bg-muted/15 p-5 transition-all hover:bg-muted/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 block">Schedule specs (Cron)</span>
                  <div className="font-mono text-sm font-semibold text-foreground mt-1.5">{monitor.scheduleLabel || "Cron override"} (`{monitor.cron}`)</div>
                </div>
                <div className="rounded-2xl bg-muted/15 p-5 transition-all hover:bg-muted/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 block">Global check timeout</span>
                  <div className="font-mono text-sm font-semibold text-foreground mt-1.5">{monitor.timeoutMs}ms</div>
                </div>
                <div className="rounded-2xl bg-muted/15 p-5 transition-all hover:bg-muted/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 block">Global retry counts</span>
                  <div className="font-mono text-sm font-semibold text-foreground mt-1.5">{monitor.retryCount} retries</div>
                </div>
                <div className="rounded-2xl bg-muted/15 p-5 transition-all hover:bg-muted/20">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 block">Response body capture limits</span>
                  <div className="font-mono text-sm font-semibold text-foreground mt-1.5">{monitor.responseBodyLimitKb} KB max</div>
                </div>
              </div>

              {monitor.variables && Object.keys(monitor.variables).length > 0 && (
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 block">Environment variables</span>
                  <div className="grid gap-3 font-mono text-xs sm:grid-cols-2">
                    {Object.entries(monitor.variables).map(([key, val]) => (
                      <div key={key} className="flex justify-between items-center rounded-2xl bg-muted/15 p-3.5 px-4.5 hover:bg-muted/20 transition-all">
                        <span className="text-muted-foreground font-semibold">{key}</span>
                        <span className="font-bold text-foreground">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {monitor.secretAliases && monitor.secretAliases.length > 0 && (
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 block">Referenced encrypted secrets</span>
                  <div className="flex flex-wrap gap-2.5">
                    {monitor.secretAliases.map((alias) => (
                      <span key={alias} className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary px-3 py-1 font-mono text-xs font-semibold shadow-xs">
                        <KeyRound className="size-3.5 text-primary" />
                        {alias}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Tabs.Panel>
        </Tabs>
      </div>
    </PageShell>
  )
}
