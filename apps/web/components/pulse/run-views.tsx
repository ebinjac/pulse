"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronDown, ChevronRight, Info, Network, TerminalSquare, Sparkles, Loader2, Copy, Check, FileText } from "lucide-react"
import type { HttpTiming, MonitorRun, StepRun } from "@/lib/pulse-types"
import { Card } from "@workspace/ui/components/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { Field, formatDate, isFailedStatus, PageShell, Section, StatusPill } from "./console-shared"

export function RunTimeline({ run, compact = false, defaultExpanded = false }: { run: MonitorRun; compact?: boolean; defaultExpanded?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <Card className={cn("overflow-hidden transition-all duration-200 border-border/85 p-0", isExpanded ? " bg-card" : "hover:bg-muted/10 bg-card/60")}>
      <div 
        className={cn("flex flex-wrap items-center justify-between gap-3 min-w-0 cursor-pointer select-none", compact ? "p-3" : "p-4")}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="text-muted-foreground shrink-0 mt-0.5">
            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <StatusPill status={run.status} />
              <Link 
                href={`/runs/${run.id}`} 
                onClick={(e) => e.stopPropagation()} 
                className="font-semibold text-foreground hover:text-primary transition-colors hover:underline truncate max-w-[150px] inline-block font-mono" 
                title={run.id}
              >
                {run.id}
              </Link>
              {isFailedStatus(run.status) && run.failureReason && (
                <span className="text-[11px] text-rose-500 font-medium truncate max-w-[280px] sm:max-w-[450px]" title={run.failureReason}>
                  · {run.failureReason}
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-[11px] truncate">{run.monitorName}</p>
          </div>
        </div>
        <div className="text-muted-foreground text-right text-[10px] shrink-0 font-medium flex items-center gap-4">
          <div>
            <div>{formatDate(run.startedAt)}</div>
            <div>{run.durationMs}ms · <span className="capitalize">{run.triggeredBy}</span></div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className={cn("border-t border-border/40 bg-muted/5 space-y-4", compact ? "p-3" : "px-4 pb-4 pt-4")}>
          {!compact && run.failureReason && (
            <div className="rounded-lg border border-rose-200 bg-rose-500/5 p-3.5 text-xs font-mono text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
              <div className="font-semibold text-[10px] uppercase tracking-wider text-rose-500 mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" />
                {run.failureCategory || "EXECUTION FAILURE"}
              </div>
              <p className="whitespace-pre-wrap leading-5">{run.failureReason}</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2 block">Steps Execution Logs</div>
            {(run.steps || []).map((step) => {
              if (compact) {
                return (
                  <div key={step.id} className="flex flex-col gap-1.5 rounded-lg bg-muted/30 border border-border/30 p-2.5 text-xs min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold truncate max-w-[150px]">{step.stepName}</div>
                      <span className="shrink-0 scale-90 origin-right">
                        <StatusPill status={step.status} />
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground text-[10px] gap-2">
                      <span className="truncate">{step.responseSummary}</span>
                      <span className="shrink-0">{step.latencyMs}ms</span>
                    </div>
                  </div>
                )
              }
              return (
                <div key={step.id} className="rounded-lg bg-muted/20 border border-border/30 p-3 text-xs">
                  <div className="grid gap-3 md:grid-cols-[180px_1fr_90px] items-start">
                    <div>
                      <div className="font-semibold text-foreground truncate" title={step.stepName}>{step.stepName}</div>
                      <div className="text-muted-foreground text-[10px] uppercase font-bold mt-0.5">{step.type}</div>
                    </div>
                    <div className="text-muted-foreground font-mono text-[11px] leading-5 whitespace-pre-wrap break-all">{step.responseSummary}</div>
                    <div className="text-right flex flex-col items-end justify-start gap-1">
                      <StatusPill status={step.status} />
                      <div className="text-muted-foreground text-[10px] font-medium">{step.latencyMs}ms</div>
                    </div>
                  </div>
                  {step.type === "http" ? <NetworkTimingBreakdown step={step} /> : null}
                </div>
              )
            })}
          </div>

          <div className="flex justify-end pt-2">
            <Link 
              href={`/runs/${run.id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-muted transition-colors text-foreground gap-1"
            >
              Open Full Diagnostics Page
            </Link>
          </div>
        </div>
      )}
    </Card>
  )
}

function NetworkTimingBreakdown({ step }: { step: StepRun }) {
  const timing = step.timing
  if (!hasTiming(timing)) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-border/60 bg-background/60 p-3 text-[11px] text-muted-foreground">
        Timing breakdown was not captured for this run.
      </div>
    )
  }
  const capturedTiming = timing

  const total = Math.max(capturedTiming.totalMs || step.latencyMs || 0, 1)
  const phases = [
    {
      key: "dns",
      label: "DNS",
      value: capturedTiming.dnsLookupMs || 0,
      className: "bg-sky-500",
      description: "Time spent resolving the hostname to an IP address before Pulse can open a connection.",
    },
    {
      key: "tcp",
      label: "TCP",
      value: capturedTiming.tcpConnectMs || 0,
      className: "bg-indigo-500",
      description: "Time spent opening the network connection from Pulse to the target server.",
    },
    {
      key: "tls",
      label: "TLS",
      value: capturedTiming.tlsHandshakeMs || 0,
      className: "bg-violet-500",
      description: "Time spent completing the HTTPS handshake and certificate negotiation.",
    },
    {
      key: "waiting",
      label: "Waiting",
      value: capturedTiming.timeToFirstByteMs || 0,
      className: "bg-amber-500",
      description:
        "Time from sending the request until the first response byte arrives. This is Pulse's client-side estimate of server processing plus network return time.",
    },
    {
      key: "download",
      label: "Download",
      value: capturedTiming.downloadMs || 0,
      className: "bg-emerald-500",
      description: "Time spent reading the captured response body after the first byte arrives.",
    },
  ]
  const dominant = phases.reduce((max, phase) => (phase.value > max.value ? phase : max), phases[0]!)
  const dominantPercent = Math.round((dominant.value / total) * 100)

  return (
    <div className="mt-3 space-y-3 rounded-md border border-border/50 bg-background/75 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Network className="size-3.5 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Network timing</span>
        </div>
        <span className="font-mono text-[10px] font-semibold text-muted-foreground">{total}ms total</span>
      </div>

      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {phases.map((phase) => (
          <div
            key={phase.key}
            className={cn(phase.className, phase.value > 0 && "min-w-[2px]")}
            style={{ width: `${Math.max((phase.value / total) * 100, phase.value > 0 ? 2 : 0)}%` }}
            title={`${phase.label}: ${phase.value}ms`}
          />
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-5">
        {phases.map((phase) => (
          <div key={phase.key} className="rounded border border-border/40 bg-muted/25 px-2 py-1.5">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className={cn("size-2 shrink-0 rounded-full", phase.className)} />
                <span className="truncate text-[10px] font-semibold text-muted-foreground">{phase.label}</span>
              </div>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`What ${phase.label} means`}
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Info className="size-3" />
                    </button>
                  }
                />
                <TooltipContent side="top" className="max-w-64 text-left leading-4">
                  {phase.description}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-1 font-mono text-xs font-semibold text-foreground">{phase.value}ms</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
        <p className="text-[11px] text-muted-foreground">
          {dominant.label} took <span className="font-semibold text-foreground">{dominantPercent}%</span> of this request.
          {dominant.key === "waiting" ? " Waiting for server is a client-side estimate based on time to first byte." : null}
        </p>
        <TimingAiDiagnosis timing={capturedTiming} stepName={step.stepName} />
      </div>
    </div>
  )
}

function TimingAiDiagnosis({ timing, stepName }: { timing: HttpTiming; stepName: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    analysis: string
    recommendations: string[]
  } | null>(null)

  async function analyze() {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch("/api/copilot/performance-diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timing, stepName }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setResult(data.result)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full mt-1.5 pt-1.5 border-t border-border/10">
      {!result && !loading && (
        <button
          onClick={analyze}
          className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
        >
          <Sparkles className="size-3" /> Diagnose phase bottleneck with Pulse Copilot
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground animate-pulse">
          <Loader2 className="size-3 animate-spin text-primary" />
          Analyzing latency breakdown...
        </div>
      )}

      {result && (
        <div className="rounded bg-muted/40 p-2.5 border border-border/40 text-[10px] space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-1 text-foreground font-semibold">
            <Sparkles className="size-3 text-primary animate-pulse" />
            <span>AI Latency Diagnostics</span>
          </div>
          <p className="text-muted-foreground leading-relaxed">{result.analysis}</p>
          {result.recommendations && result.recommendations.length > 0 && (
            <ul className="list-disc pl-3.5 space-y-0.5 text-muted-foreground">
              {result.recommendations.map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function hasTiming(timing: HttpTiming | undefined): timing is HttpTiming {
  if (!timing) return false
  return Boolean(
    timing.totalMs ||
      timing.dnsLookupMs ||
      timing.tcpConnectMs ||
      timing.tlsHandshakeMs ||
      timing.timeToFirstByteMs ||
      timing.downloadMs
  )
}

function RunAiDiagnostics({ run }: { run: MonitorRun }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    explanation: string
    probableCauses: string[]
    suggestedSteps: string[]
  } | null>(null)
  const [copiedDraft, setCopiedDraft] = useState(false)
  const [incidentLoading, setIncidentLoading] = useState(false)
  const [incident, setIncident] = useState<{
    title: string
    severity: string
    markdownContent: string
  } | null>(null)

  const isFailed = run.status === "failed"

  async function analyze() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/copilot/failure-investigation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data.result)
    } catch (e: any) {
      setError(e.message || "Failed to analyze run details.")
    } finally {
      setLoading(false)
    }
  }

  async function generateIncident() {
    if (incidentLoading) return
    setIncidentLoading(true)
    try {
      const res = await fetch("/api/copilot/incident-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setIncident(data.result)
    } catch (e: any) {
      console.error(e)
    } finally {
      setIncidentLoading(false)
    }
  }

  if (!isFailed) return null

  return (
    <Card className="border border-primary/20 bg-primary/[0.02] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary animate-pulse" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-primary">Pulse Copilot Diagnostic</h3>
        </div>
        {!result && !loading && (
          <Button size="sm" onClick={analyze} className="h-7 text-[10px] px-2.5 bg-primary text-primary-foreground cursor-pointer">
            Analyze Outage
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-xs gap-2">
          <Loader2 className="size-5 animate-spin text-primary" />
          <span>Investigating steps, failure reasons, and responses...</span>
        </div>
      )}

      {error && (
        <div className="text-xs text-rose-500 font-medium py-2">
          Failed to analyze: {error}
        </div>
      )}

      {result && (
        <div className="space-y-4 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="space-y-1">
            <span className="font-semibold text-foreground/80 block">Root Cause Explanation</span>
            <p className="text-muted-foreground leading-relaxed font-normal">{result.explanation}</p>
          </div>

          {result.probableCauses && result.probableCauses.length > 0 && (
            <div className="space-y-1">
              <span className="font-semibold text-foreground/80 block">Probable Causes</span>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                {result.probableCauses.map((cause, idx) => (
                  <li key={idx}>{cause}</li>
                ))}
              </ul>
            </div>
          )}

          {result.suggestedSteps && result.suggestedSteps.length > 0 && (
            <div className="space-y-1">
              <span className="font-semibold text-foreground/80 block">Suggested Diagnostics</span>
              <ul className="list-decimal pl-4 space-y-1 text-muted-foreground">
                {result.suggestedSteps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-border/40 pt-3 flex gap-2">
            {!incident && !incidentLoading && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-[10px] gap-1 px-3 cursor-pointer"
                onClick={generateIncident}
              >
                <FileText className="size-3" /> Draft ServiceNow Ticket
              </Button>
            )}

            {incidentLoading && (
              <Button variant="outline" size="sm" className="h-8 text-[10px] gap-1 px-3" disabled>
                <Loader2 className="size-3 animate-spin" /> Preparing Draft...
              </Button>
            )}

            {incident && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-[10px] gap-1 px-3 cursor-pointer"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `TITLE: ${incident.title}\nSEVERITY: ${incident.severity}\n\n${incident.markdownContent}`
                  )
                  setCopiedDraft(true)
                  setTimeout(() => setCopiedDraft(false), 2000)
                }}
              >
                {copiedDraft ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                {copiedDraft ? "Copied!" : "Copy Incident Details"}
              </Button>
            )}
          </div>

          {incident && (
            <div className="rounded border bg-muted/30 p-2.5 font-mono text-[9px] text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
              <strong>[ServiceNow Draft Template]</strong><br />
              <strong>Title:</strong> {incident.title}<br />
              <strong>Severity:</strong> {incident.severity}<br />
              <strong>Description:</strong><br />
              {incident.markdownContent}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export function RunDetail({ run }: { run: MonitorRun }) {
  return (
    <PageShell eyebrow="Run detail" title={run.id}>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <RunTimeline run={run} defaultExpanded={true} />
        <div className="space-y-6">
          <Section title="Execution context" icon={TerminalSquare}>
            <div className="space-y-2">
              <Field label="Triggered by" value={run.triggeredBy} />
              <Field label="Duration" value={`${run.durationMs}ms`} />
              <Field label="Failure reason" value={run.failureReason ?? "No failure"} />
              <Field label="Stored body handling" value="Masked first, truncated to 32 KB, then stored" />
            </div>
          </Section>
          <RunAiDiagnostics run={run} />
        </div>
      </div>
    </PageShell>
  )
}
