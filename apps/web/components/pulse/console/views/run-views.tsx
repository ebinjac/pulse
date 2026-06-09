"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, ChevronDown, ChevronRight, Info, Network, TerminalSquare, Sparkles, Loader2, Copy, Check, FileText } from "lucide-react"
import type { HttpTiming, MonitorRun, StepRun } from "@/lib/pulse-types"
import { Button, Card as HeroCard, Tooltip } from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"
import { Field, formatDate, isFailedStatus, PageShell, Section, StatusPill } from "../layout"

export function RunTimeline({ run, compact = false, defaultExpanded = false }: { run: MonitorRun; compact?: boolean; defaultExpanded?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <HeroCard className={cn("overflow-hidden transition-all duration-200", isExpanded ? "bg-card" : "bg-card/60 hover:bg-muted/10")}>
      <div
        className={cn("flex flex-wrap items-center justify-between gap-3 min-w-0 cursor-pointer select-none", compact ? "p-3" : "p-4")}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="shrink-0 mt-0.5 text-muted-foreground">
            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusPill status={run.status} />
              <Link
                href={`/runs/${run.id}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-block max-w-[150px] truncate font-mono font-semibold text-foreground transition-colors hover:text-accent hover:underline"
                title={run.id}
              >
                {run.id}
              </Link>
              {isFailedStatus(run.status) && run.failureReason && (
                <span className="truncate text-[11px] font-medium text-danger max-w-[280px] sm:max-w-[450px]" title={run.failureReason}>
                  · {run.failureReason}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{run.monitorName}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-right text-[10px] font-medium text-muted-foreground">
          <div>
            <div>{formatDate(run.startedAt)}</div>
            <div>{run.durationMs}ms · <span className="capitalize">{run.triggeredBy}</span></div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className={cn("space-y-4 border-t border-border/40 bg-muted/5", compact ? "p-3" : "px-4 pb-4 pt-4")}>
          {!compact && run.failureReason && (
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-3.5 font-mono text-xs text-danger">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-danger">
                <AlertTriangle className="size-3.5" />
                {run.failureCategory || "EXECUTION FAILURE"}
              </div>
              <p className="whitespace-pre-wrap leading-5">{run.failureReason}</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Steps Execution Logs</div>
            {(run.steps || []).map((step) => {
              if (compact) {
                return (
                  <div key={step.id} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/30 bg-muted/30 p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="max-w-[150px] truncate font-semibold">{step.stepName}</div>
                      <span className="origin-right scale-90 shrink-0">
                        <StatusPill status={step.status} />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="truncate">{step.responseSummary}</span>
                      <span className="shrink-0">{step.latencyMs}ms</span>
                    </div>
                  </div>
                )
              }
              return (
                <div key={step.id} className="rounded-lg border border-border/30 bg-muted/5 p-3 text-xs">
                  <div className="grid items-start gap-3 md:grid-cols-[180px_1fr_90px]">
                    <div>
                      <div className="truncate font-semibold text-foreground" title={step.stepName}>{step.stepName}</div>
                      <div className="mt-0.5 text-[10px] font-bold uppercase text-muted-foreground">{step.type}</div>
                    </div>
                    <div className="break-all whitespace-pre-wrap font-mono text-[11px] leading-5 text-muted-foreground">{step.responseSummary}</div>
                    <div className="flex flex-col items-end justify-start gap-1 text-right">
                      <StatusPill status={step.status} />
                      <div className="text-[10px] font-medium text-muted-foreground">{step.latencyMs}ms</div>
                    </div>
                  </div>
                  {step.type === "http" ? <NetworkTimingBreakdown step={step} /> : null}
                </div>
              )
            })}
          </div>

          <div className="flex justify-end pt-2">
            <Link href={`/runs/${run.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex">
              <Button variant="secondary" size="sm" className="h-8 gap-1 text-xs font-semibold">
                Open Full Diagnostics Page
              </Button>
            </Link>
          </div>
        </div>
      )}
    </HeroCard>
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
      className: "bg-orange-500",
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
    <div className="mt-3 space-y-3 rounded-md border border-border/50 bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Network className="size-3.5 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Network timing</span>
        </div>
        <span className="font-mono text-[10px] font-semibold text-muted-foreground">{total}ms total</span>
      </div>

      <div className="flex h-3 overflow-hidden rounded-full bg-default/40">
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
          <div key={phase.key} className="rounded border border-border/40 bg-muted/10 px-2 py-1.5">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className={cn("size-2.5 shrink-0 rounded-full ring-1 ring-background", phase.className)} />
                <span className="truncate text-[10px] font-semibold text-muted-foreground">{phase.label}</span>
              </div>
              <Tooltip>
                <Tooltip.Trigger>
                  <button
                    type="button"
                    aria-label={`What ${phase.label} means`}
                    className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Info className="size-3" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Content placement="top" className="max-w-64 text-left leading-4">
                  {phase.description}
                </Tooltip.Content>
              </Tooltip>
            </div>
            <div className="mt-1 font-mono text-xs font-semibold text-foreground">{phase.value}ms</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-border/40 pt-2">
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
    <div className="mt-1.5 w-full border-t border-border/10 pt-1.5">
      {!result && !loading && (
        <button
          onClick={analyze}
          className="flex cursor-pointer items-center gap-1 text-[10px] font-semibold text-accent hover:underline"
        >
          <Sparkles className="size-3" /> Diagnose phase bottleneck with Pulse Copilot
        </button>
      )}

      {loading && (
        <div className="flex animate-pulse items-center gap-1.5 text-[10px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin text-accent" />
          Analyzing latency breakdown...
        </div>
      )}

      {result && (
        <div className="animate-in fade-in space-y-2 rounded border border-border/40 bg-muted/5 p-2.5 text-[10px] duration-200">
          <div className="flex items-center gap-1 font-semibold text-foreground">
            <Sparkles className="size-3 animate-pulse text-accent" />
            <span>AI Latency Diagnostics</span>
          </div>
          <p className="leading-relaxed text-muted-foreground">{result.analysis}</p>
          {result.recommendations && result.recommendations.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-3.5 text-muted-foreground">
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
    <HeroCard className="space-y-4 border border-accent/20 bg-accent/[0.02] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 animate-pulse text-accent" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-accent">Pulse Copilot Diagnostic</h3>
        </div>
        {!result && !loading && (
          <Button size="sm" onPress={analyze} className="h-7 cursor-pointer px-2.5 text-[10px]">
            Analyze Outage
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="size-5 animate-spin text-accent" />
          <span>Investigating steps, failure reasons, and responses...</span>
        </div>
      )}

      {error && (
        <div className="py-2 text-xs font-medium text-danger">
          Failed to analyze: {error}
        </div>
      )}

      {result && (
        <div className="animate-in fade-in slide-in-from-top-1 space-y-4 text-xs duration-200">
          <div className="space-y-1">
            <span className="block font-semibold text-foreground/80">Root Cause Explanation</span>
            <p className="font-normal leading-relaxed text-muted-foreground">{result.explanation}</p>
          </div>

          {result.probableCauses && result.probableCauses.length > 0 && (
            <div className="space-y-1">
              <span className="block font-semibold text-foreground/80">Probable Causes</span>
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                {result.probableCauses.map((cause, idx) => (
                  <li key={idx}>{cause}</li>
                ))}
              </ul>
            </div>
          )}

          {result.suggestedSteps && result.suggestedSteps.length > 0 && (
            <div className="space-y-1">
              <span className="block font-semibold text-foreground/80">Suggested Diagnostics</span>
              <ul className="list-decimal space-y-1 pl-4 text-muted-foreground">
                {result.suggestedSteps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2 border-t border-border/40 pt-3">
            {!incident && !incidentLoading && (
              <Button
                variant="secondary"
                size="sm"
                className="h-8 cursor-pointer gap-1 px-3 text-[10px]"
                onPress={generateIncident}
              >
                <FileText className="size-3" /> Draft ServiceNow Ticket
              </Button>
            )}

            {incidentLoading && (
              <Button variant="secondary" size="sm" isDisabled className="h-8 gap-1 px-3 text-[10px]">
                <Loader2 className="size-3 animate-spin" /> Preparing Draft...
              </Button>
            )}

            {incident && (
              <Button
                variant="secondary"
                size="sm"
                className="h-8 cursor-pointer gap-1 px-3 text-[10px]"
                onPress={() => {
                  navigator.clipboard.writeText(
                    `TITLE: ${incident.title}\nSEVERITY: ${incident.severity}\n\n${incident.markdownContent}`
                  )
                  setCopiedDraft(true)
                  setTimeout(() => setCopiedDraft(false), 2000)
                }}
              >
                {copiedDraft ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                {copiedDraft ? "Copied!" : "Copy Incident Details"}
              </Button>
            )}
          </div>

          {incident && (
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border bg-muted/30 p-2.5 font-mono text-[9px] text-muted-foreground">
              <strong>[ServiceNow Draft Template]</strong><br />
              <strong>Title:</strong> {incident.title}<br />
              <strong>Severity:</strong> {incident.severity}<br />
              <strong>Description:</strong><br />
              {incident.markdownContent}
            </div>
          )}
        </div>
      )}
    </HeroCard>
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
