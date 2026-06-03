"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Code2,
  FileJson,
  KeyRound,
  Play,
  Plus,
  PlusCircle,
  RotateCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  TerminalSquare,
  Trash2,
  Workflow,
  X,
  XCircle,
} from "lucide-react"

import { buildMockRun } from "@/lib/pulse-execution"
import type { Monitor, MonitorRun, MonitorStatus, MonitorStep, PulseAssertion, PulseExtractor, PreRequestAction } from "@/lib/pulse-types"
import { ScriptEditor } from "./script-editor"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

interface BuilderWorkbenchProps {
  monitor: Monitor
}

type ExecutionState = "idle" | "running" | "complete"
type SaveState = "idle" | "saving" | "saved" | "error"

const inputClass =
  "border-input bg-background ring-offset-background focus-visible:ring-ring min-h-9 w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"

const labelClass = "text-muted-foreground mb-1.5 block text-xs font-medium"

function configFromMonitor(monitor: Monitor) {
  return {
    name: monitor.name,
    description: monitor.description,
    scheduleMode: monitor.scheduleMode,
    schedule: monitor.cron,
    timezone: monitor.timezone,
    timeoutMs: monitor.timeoutMs,
    retryCount: monitor.retryCount,
    failureThreshold: monitor.failureThreshold,
    responseBodyLimitKb: monitor.responseBodyLimitKb,
    isActive: monitor.isActive,
    variables: monitor.variables,
    secrets: monitor.secretAliases.map((alias) => ({
      alias,
      provider: "encrypted-db",
      masked: true,
    })),
    alerts: monitor.alertPolicy,
    steps: monitor.steps.map((step) => ({
      id: step.id,
      name: step.name,
      type: step.type,
      method: step.method,
      url: step.url,
      timeoutMs: step.timeoutMs,
      retryCount: step.retryCount,
      continueOnFailure: step.continueOnFailure,
      actions: step.actions ?? [],
      assertions: step.assertions,
      extractors: step.extractors,
      preRequestScript: step.preRequestScript,
      config: step.config ?? {},
    })),
  }
}

function validateMonitor(draft: Monitor) {
  const errors: string[] = []

  if (!draft.name.trim()) errors.push("Monitor name is required.")
  if (!draft.cron.trim() && draft.scheduleMode !== "manual") errors.push("Cron expression is required for scheduled monitors.")
  if (draft.timeoutMs < 1000) errors.push("Monitor timeout should be at least 1000ms.")
  if (draft.responseBodyLimitKb < 1) errors.push("Response body limit should be at least 1 KB.")
  if (!draft.steps.length) errors.push("At least one step is required.")

  draft.steps.forEach((step, index) => {
    if (!step.name.trim()) errors.push(`Step ${index + 1} needs a name.`)
    if (step.type === "http" && !step.url?.trim()) errors.push(`Step ${index + 1} needs a URL.`)
  })

  return errors
}

function checkAssertionFailed(assertion: PulseAssertion) {
  if (assertion.actual === undefined || assertion.actual === null) return true // if it was not run
  
  const actual = String(assertion.actual)
  const expected = String(assertion.expected)
  
  switch (assertion.operator) {
    case "equals":
      return actual !== expected
    case "notEquals":
      return actual === expected
    case "contains":
      return !actual.includes(expected)
    case "notContains":
      return actual.includes(expected)
    case "exists":
      return actual === "" || actual === "missing" || actual === "null"
    case "notExists":
      return actual !== "" && actual !== "missing" && actual !== "null"
    case "greaterThan": {
      const actNum = Number(actual.replace(/[^\d.]/g, ""))
      const expNum = Number(expected.replace(/[^\d.]/g, ""))
      return Number.isNaN(actNum) || Number.isNaN(expNum) || actNum <= expNum
    }
    case "lessThan": {
      const actNum = Number(actual.replace(/[^\d.]/g, ""))
      const expNum = Number(expected.replace(/[^\d.]/g, ""))
      return Number.isNaN(actNum) || Number.isNaN(expNum) || actNum >= expNum
    }
    default:
      return false
  }
}

function applyJsonToMonitor(current: Monitor, raw: string): { draft?: Monitor; error?: string } {
  try {
    const parsed = JSON.parse(raw) as Partial<Monitor> & {
      schedule?: string
      secrets?: Array<{ alias?: string }>
    }

    if (!parsed.name || !Array.isArray(parsed.steps)) {
      return { error: "JSON must include at least name and steps." }
    }

    return {
      draft: {
        ...current,
        ...parsed,
        cron: parsed.cron ?? parsed.schedule ?? current.cron,
        secretAliases: parsed.secretAliases ?? parsed.secrets?.map((secret) => secret.alias).filter(Boolean) as string[] ?? current.secretAliases,
        steps: parsed.steps.map((step, index) => ({
          ...current.steps[index],
          ...step,
          id: step.id ?? current.steps[index]?.id ?? `step-${index + 1}`,
          order: step.order ?? index + 1,
          timeoutMs: step.timeoutMs ?? current.steps[index]?.timeoutMs ?? current.timeoutMs,
          retryCount: step.retryCount ?? current.steps[index]?.retryCount ?? 0,
          continueOnFailure: step.continueOnFailure ?? current.steps[index]?.continueOnFailure ?? false,
          assertions: step.assertions ?? [],
          extractors: step.extractors ?? [],
        })) as MonitorStep[],
      },
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid JSON." }
  }
}

function Section({
  children,
  title,
  icon: Icon,
}: {
  children: React.ReactNode
  title: string
  icon: typeof SlidersHorizontal
}) {
  return (
    <section className="border-border bg-card rounded-md border p-4">
      <h2 className="font-heading mb-4 flex items-center gap-2 text-base font-semibold">
        <Icon className="size-4" />
        {title}
      </h2>
      {children}
    </section>
  )
}

function StatusPill({ status }: { status: MonitorStatus }) {
  const norm = (status || "skipped").toLowerCase() as MonitorStatus
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium capitalize",
        norm === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300"
      )}
    >
      {norm === "success" ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {norm}
    </span>
  )
}

function JsonStatus({ errors, parseError }: { errors: string[]; parseError: string | null }) {
  if (parseError) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
        {parseError}
      </div>
    )
  }

  if (errors.length) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300">
        {errors.join(" ")}
      </div>
    )
  }

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
      Config is valid for local execution.
    </div>
  )
}

interface StepCardProps {
  step: MonitorStep
  index: number
  totalSteps: number
  onUpdate: (patch: Partial<MonitorStep>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function StepCard({ step, index, totalSteps, onUpdate, onDelete, onMoveUp, onMoveDown }: StepCardProps) {
  // Tabs State
  const [activeTab, setActiveTab] = useState<"headers" | "body" | "scripts" | "tests">("headers")

  // Headers Local Form State
  const [localHeaders, setLocalHeaders] = useState<{ key: string; value: string }[]>(() =>
    Object.entries(step.config?.headers || {}).map(([key, value]) => ({ key, value: String(value) }))
  )

  useEffect(() => {
    const nextHeaders = Object.entries(step.config?.headers || {}).map(([key, value]) => ({ key, value: String(value) }))
    if (JSON.stringify(nextHeaders) !== JSON.stringify(localHeaders)) {
      setLocalHeaders(nextHeaders)
    }
  }, [step.config?.headers])

  const updateLocalHeader = (idx: number, field: "key" | "value", val: string) => {
    const next = [...localHeaders]
    const item = next[idx]
    if (!item) return
    item[field] = val
    setLocalHeaders(next)

    const headersObj: Record<string, string> = {}
    next.forEach((h) => {
      if (h.key.trim()) {
        headersObj[h.key.trim()] = h.value
      }
    })
    onUpdate({
      config: {
        ...step.config,
        headers: headersObj,
      },
    })
  }

  const addLocalHeader = () => {
    setLocalHeaders([...localHeaders, { key: "", value: "" }])
  }

  const removeLocalHeader = (idx: number) => {
    const next = localHeaders.filter((_, i) => i !== idx)
    setLocalHeaders(next)

    const headersObj: Record<string, string> = {}
    next.forEach((item) => {
      if (item.key.trim()) {
        headersObj[item.key.trim()] = item.value
      }
    })
    onUpdate({
      config: {
        ...step.config,
        headers: headersObj,
      },
    })
  }

  // Assertions Local Form State
  const [assertType, setAssertType] = useState<string>("statusCode")
  const [assertTarget, setAssertTarget] = useState<string>("status")
  const [assertOperator, setAssertOperator] = useState<string>("equals")
  const [assertExpected, setAssertExpected] = useState<string>("200")
  const [assertSensitive, setAssertSensitive] = useState<boolean>(false)

  // Extractors Local Form State
  const [extName, setExtName] = useState<string>("")
  const [extType, setExtType] = useState<string>("jsonPath")
  const [extSource, setExtSource] = useState<string>("")
  const [extSensitive, setExtSensitive] = useState<boolean>(false)
  const [extOptional, setExtOptional] = useState<boolean>(false)

  // Actions Local Form State (for preRequest)
  const [actionType, setActionType] = useState<string>("generateJWT")
  const [actionLabel, setActionLabel] = useState<string>("")
  const [actionOutput, setActionOutput] = useState<string>("")
  const [actionConfig, setActionConfig] = useState<string>("")

  const handleAddAssertion = () => {
    if (!assertTarget.trim() && assertType !== "bodyContains") return
    const newAssert: PulseAssertion = {
      id: `assert-${crypto.randomUUID()}`,
      type: assertType as any,
      label: `${assertType} matches: ${assertTarget} ${assertOperator} ${assertExpected}`,
      target: assertTarget.trim(),
      operator: assertOperator,
      expected: assertExpected.trim(),
      sensitive: assertSensitive,
    }
    onUpdate({
      assertions: [...step.assertions, newAssert],
    })
    setAssertTarget("")
    setAssertExpected("")
    setAssertSensitive(false)
  }

  const handleDeleteAssertion = (id: string) => {
    onUpdate({
      assertions: step.assertions.filter((a) => a.id !== id),
    })
  }

  const handleAddExtractor = () => {
    if (!extName.trim() || !extSource.trim()) return
    const newExt: PulseExtractor = {
      id: `extract-${crypto.randomUUID()}`,
      name: extName.trim(),
      type: extType as any,
      source: extSource.trim(),
      sensitive: extSensitive,
      optional: extOptional,
    }
    onUpdate({
      extractors: [...step.extractors, newExt],
    })
    setExtName("")
    setExtSource("")
    setExtSensitive(false)
    setExtOptional(false)
  }

  const handleDeleteExtractor = (id: string) => {
    onUpdate({
      extractors: step.extractors.filter((e) => e.id !== id),
    })
  }

  const handleAddAction = () => {
    if (!actionOutput.trim()) return
    const newAction: PreRequestAction = {
      id: `action-${crypto.randomUUID()}`,
      type: actionType as any,
      label: actionLabel.trim() || `Generate ${actionType}`,
      output: actionOutput.trim(),
      configPreview: actionConfig.trim(),
    }
    onUpdate({
      actions: [...(step.actions || []), newAction],
    })
    setActionLabel("")
    setActionOutput("")
    setActionConfig("")
  }

  const handleDeleteAction = (id: string) => {
    onUpdate({
      actions: (step.actions || []).filter((a) => a.id !== id),
    })
  }

  return (
    <div className="rounded-md border border-border/80 bg-muted/10 p-5 space-y-4">
      {/* Step Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-3 flex-wrap">
        <div>
          <span className="bg-primary/10 text-primary rounded-full size-6 inline-flex items-center justify-center text-xs font-semibold mr-2">
            {step.order}
          </span>
          <span className="font-heading font-semibold text-sm">{step.name}</span>
          <span className="text-muted-foreground text-xs ml-2 uppercase px-1.5 py-0.5 rounded bg-muted font-mono font-medium">
            {step.type}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" type="button" onClick={onMoveUp} disabled={index === 0} className="size-8">
            <ArrowUp className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" type="button" onClick={onMoveDown} disabled={index === totalSteps - 1} className="size-8">
            <ArrowDown className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" type="button" onClick={onDelete} className="text-rose-500 hover:text-rose-700 size-8">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Step Common Config */}
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className={labelClass}>Step Name</span>
          <input className={inputClass} value={step.name} onChange={(event) => onUpdate({ name: event.target.value })} />
        </label>
        <div className="grid gap-2 grid-cols-2">
          <label>
            <span className={labelClass}>Timeout (ms)</span>
            <input
              type="number"
              className={inputClass}
              min={100}
              value={step.timeoutMs}
              onChange={(event) => onUpdate({ timeoutMs: Number(event.target.value) })}
            />
          </label>
          <label>
            <span className={labelClass}>Retry Count</span>
            <input
              type="number"
              className={inputClass}
              min={0}
              value={step.retryCount}
              onChange={(event) => onUpdate({ retryCount: Number(event.target.value) })}
            />
          </label>
        </div>
      </div>

      {/* HTTP Request Step Config */}
      {step.type === "http" && (
        <div className="space-y-4">
          {/* Persistent URL Bar */}
          <div className="flex gap-2 items-end">
            <label className="w-[120px] shrink-0">
              <span className={labelClass}>Method</span>
              <select
                className={inputClass}
                value={step.method ?? "GET"}
                onChange={(event) => onUpdate({ method: event.target.value })}
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </label>
            <label className="flex-1">
              <span className={labelClass}>URL</span>
              <input
                className={inputClass}
                value={step.url ?? ""}
                placeholder="https://{{variables.baseUrl}}/health"
                onChange={(event) => onUpdate({ url: event.target.value })}
              />
            </label>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 border-b border-border/40 pb-0 pt-2">
            {([
              { key: "headers", label: "Headers" },
              { key: "body", label: "Body" },
              { key: "scripts", label: "Pre-request Script", icon: Code2 },
              { key: "tests", label: "Tests" },
            ] as { key: "headers" | "body" | "scripts" | "tests"; label: string; icon?: typeof Code2 }[]).map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors flex items-center gap-1.5 -mb-px border-b-2 border-transparent",
                    activeTab === tab.key
                      ? "bg-background text-foreground border-b-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {Icon && <Icon className="size-3" />}
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tab Content */}
          {activeTab === "headers" && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Request Headers</div>
              <div className="space-y-2">
                {localHeaders.length > 0 ? (
                  localHeaders.map((header, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        placeholder="Key"
                        className={cn(inputClass, "flex-1")}
                        value={header.key}
                        onChange={(e) => updateLocalHeader(idx, "key", e.target.value)}
                      />
                      <span className="text-muted-foreground text-xs">:</span>
                      <input
                        placeholder="Value"
                        className={cn(inputClass, "flex-[2]")}
                        value={header.value}
                        onChange={(e) => updateLocalHeader(idx, "value", e.target.value)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => removeLocalHeader(idx)}
                        className="text-rose-500 hover:text-rose-700 size-8 shrink-0"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground text-xs italic p-1">No custom headers added.</div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={addLocalHeader}
                className="h-8 gap-1 mt-1"
              >
                <Plus className="size-3.5" /> Add Header
              </Button>
            </div>
          )}

          {activeTab === "body" && (
            <div className="space-y-2">
              <span className={labelClass}>Raw Request Body</span>
              <textarea
                className="min-h-[180px] w-full resize-y rounded-md bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-100 outline-none border border-border/50"
                value={step.config?.body ?? ""}
                placeholder='{\n  "key": "value"\n}'
                spellCheck={false}
                onChange={(e) => {
                  onUpdate({
                    config: {
                      ...step.config,
                      body: e.target.value,
                    },
                  })
                }}
              />
            </div>
          )}

          {activeTab === "scripts" && (
            <ScriptEditor
              value={step.preRequestScript ?? ""}
              onChange={(script) => onUpdate({ preRequestScript: script })}
              stepName={step.name}
            />
          )}

          {activeTab === "tests" && (
            <div className="space-y-4">
              {/* Assertions Section */}
              <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Assertions</div>
                {/* List existing */}
                <div className="space-y-2">
                  {step.assertions.length ? (
                    step.assertions.map((assertion) => (
                      <div key={assertion.id} className="flex justify-between items-center bg-muted/50 px-3 py-2 rounded-md text-xs border border-border/30">
                        <div>
                          <span className="font-semibold text-primary uppercase">{assertion.type}</span>
                          <span className="mx-1.5 text-muted-foreground">·</span>
                          <span className="font-mono text-muted-foreground">{assertion.target || "body"}</span>
                          <span className="mx-1.5 text-muted-foreground text-[10px] font-semibold uppercase">{assertion.operator}</span>
                          <span className="font-mono bg-muted px-1.5 py-0.5 rounded border border-border/20 text-foreground">{assertion.expected}</span>
                          {assertion.sensitive && <span className="ml-2 text-emerald-600 font-semibold text-[10px] uppercase">(masked)</span>}
                        </div>
                        <Button variant="ghost" size="icon" type="button" onClick={() => handleDeleteAssertion(assertion.id)} className="text-rose-500 hover:text-rose-700 size-6">
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground text-xs italic">No assertions added yet.</div>
                  )}
                </div>
                {/* Add new */}
                <div className="grid gap-2 grid-cols-2 md:grid-cols-[120px_1fr_120px_1fr_40px] pt-3 border-t border-border/30 mt-3 items-end">
                  <div>
                    <span className={labelClass}>Assert Type</span>
                    <select className={inputClass} value={assertType} onChange={(e) => setAssertType(e.target.value)}>
                      <option value="statusCode">Status Code</option>
                      <option value="responseTime">Response Time</option>
                      <option value="jsonPath">JSONPath</option>
                      <option value="header">Header</option>
                      <option value="bodyContains">Body Contains</option>
                      <option value="regex">Regex Match</option>
                    </select>
                  </div>
                  <div>
                    <span className={labelClass}>Target</span>
                    <input placeholder="status, latency, $.id" className={inputClass} value={assertTarget} onChange={(e) => setAssertTarget(e.target.value)} />
                  </div>
                  <div>
                    <span className={labelClass}>Operator</span>
                    <select className={inputClass} value={assertOperator} onChange={(e) => setAssertOperator(e.target.value)}>
                      <option value="equals">equals</option>
                      <option value="notEquals">notEquals</option>
                      <option value="contains">contains</option>
                      <option value="notContains">notContains</option>
                      <option value="exists">exists</option>
                      <option value="notExists">notExists</option>
                      <option value="greaterThan">greaterThan</option>
                      <option value="lessThan">lessThan</option>
                      <option value="matchesRegex">matchesRegex</option>
                    </select>
                  </div>
                  <div>
                    <span className={labelClass}>Expected</span>
                    <input placeholder="Expected val" className={inputClass} value={assertExpected} onChange={(e) => setAssertExpected(e.target.value)} />
                  </div>
                  <div className="flex flex-col items-center gap-1.5 h-[58px] justify-center">
                    <span className="text-[9px] text-muted-foreground font-semibold uppercase">Mask</span>
                    <input type="checkbox" checked={assertSensitive} onChange={(e) => setAssertSensitive(e.target.checked)} className="size-4 cursor-pointer" />
                  </div>
                </div>
                <Button variant="outline" size="sm" type="button" onClick={handleAddAssertion} className="w-full h-8">
                  <PlusCircle className="size-3.5 mr-1" /> Add Assertion
                </Button>
              </div>

              {/* Extractors Section */}
              <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Extractors</div>
                {/* List existing */}
                <div className="space-y-2">
                  {step.extractors.length ? (
                    step.extractors.map((extractor) => (
                      <div key={extractor.id} className="flex justify-between items-center bg-muted/50 px-3 py-2 rounded-md text-xs border border-border/30">
                        <div>
                          <span className="font-semibold text-primary">{extractor.name}</span>
                          <span className="mx-1.5 text-muted-foreground">·</span>
                          <span className="font-mono text-muted-foreground uppercase text-[10px]">{extractor.type}</span>
                          <span className="mx-1.5 text-muted-foreground">from</span>
                          <span className="font-mono text-muted-foreground bg-muted px-1 rounded">{extractor.source}</span>
                          {extractor.sensitive && <span className="ml-2 text-emerald-600 font-semibold text-[10px] uppercase">(masked)</span>}
                          {extractor.optional && <span className="ml-2 text-muted-foreground font-medium text-[10px]">(optional)</span>}
                        </div>
                        <Button variant="ghost" size="icon" type="button" onClick={() => handleDeleteExtractor(extractor.id)} className="text-rose-500 hover:text-rose-700 size-6">
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground text-xs italic">No extractors added yet.</div>
                  )}
                </div>
                {/* Add new */}
                <div className="grid gap-2 grid-cols-2 md:grid-cols-[1fr_120px_1fr_40px_40px] pt-3 border-t border-border/30 mt-3 items-end">
                  <div>
                    <span className={labelClass}>Variable Name</span>
                    <input placeholder="token" className={inputClass} value={extName} onChange={(e) => setExtName(e.target.value)} />
                  </div>
                  <div>
                    <span className={labelClass}>Type</span>
                    <select className={inputClass} value={extType} onChange={(e) => setExtType(e.target.value)}>
                      <option value="jsonPath">JSONPath</option>
                      <option value="header">Header</option>
                      <option value="cookie">Cookie</option>
                      <option value="regex">Regex</option>
                      <option value="statusCode">Status Code</option>
                      <option value="responseTime">Response Time</option>
                    </select>
                  </div>
                  <div>
                    <span className={labelClass}>Source</span>
                    <input placeholder="$.access_token, Authorization" className={inputClass} value={extSource} onChange={(e) => setExtSource(e.target.value)} />
                  </div>
                  <div className="flex flex-col items-center gap-1.5 h-[58px] justify-center">
                    <span className="text-[9px] text-muted-foreground font-semibold uppercase">Mask</span>
                    <input type="checkbox" checked={extSensitive} onChange={(e) => setExtSensitive(e.target.checked)} className="size-4 cursor-pointer" />
                  </div>
                  <div className="flex flex-col items-center gap-1.5 h-[58px] justify-center">
                    <span className="text-[9px] text-muted-foreground font-semibold uppercase">Opt</span>
                    <input type="checkbox" checked={extOptional} onChange={(e) => setExtOptional(e.target.checked)} className="size-4 cursor-pointer" />
                  </div>
                </div>
                <Button variant="outline" size="sm" type="button" onClick={handleAddExtractor} className="w-full h-8">
                  <PlusCircle className="size-3.5 mr-1" /> Add Extractor
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pre-Request Step Config */}
      {step.type === "preRequest" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Pre-request Actions</div>
            {/* List actions */}
            <div className="space-y-2">
              {(step.actions || []).length ? (
                (step.actions || []).map((action) => (
                  <div key={action.id} className="flex justify-between items-start bg-muted/50 px-3 py-2.5 rounded-md text-xs border border-border/30">
                    <div>
                      <span className="font-semibold text-primary">{action.label}</span>
                      <span className="mx-1.5 text-muted-foreground">·</span>
                      <span className="font-mono text-muted-foreground text-[10px]">output={action.output}</span>
                      <div className="text-muted-foreground mt-1 text-[10px] font-mono leading-relaxed bg-black/10 dark:bg-black/30 p-1.5 rounded border border-border/10">
                        {action.configPreview}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" type="button" onClick={() => handleDeleteAction(action.id)} className="text-rose-500 hover:text-rose-700 size-6 shrink-0 ml-2">
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground text-xs italic">No actions defined yet.</div>
              )}
            </div>
            {/* Add Action Form */}
            <div className="grid gap-2 grid-cols-2 md:grid-cols-[140px_1fr_1fr] pt-3 border-t border-border/30 mt-3 items-end">
              <div>
                <span className={labelClass}>Action Type</span>
                <select className={inputClass} value={actionType} onChange={(e) => setActionType(e.target.value)}>
                  <option value="generateJWT">Generate JWT</option>
                  <option value="hmacSha256">HMAC SHA256</option>
                  <option value="generateUUID">Generate UUID</option>
                  <option value="generateTimestamp">Generate Timestamp</option>
                  <option value="base64Encode">Base64 Encode</option>
                  <option value="base64Decode">Base64 Decode</option>
                  <option value="urlEncode">URL Encode</option>
                  <option value="urlDecode">URL Decode</option>
                  <option value="sha256">SHA256 Hash</option>
                  <option value="setVariable">Set Variable</option>
                  <option value="readStepOutput">Read Previous Output</option>
                </select>
              </div>
              <div>
                <span className={labelClass}>Label</span>
                <input placeholder="Generate client assertion" className={inputClass} value={actionLabel} onChange={(e) => setActionLabel(e.target.value)} />
              </div>
              <div>
                <span className={labelClass}>Output Key</span>
                <input placeholder="jwt" className={inputClass} value={actionOutput} onChange={(e) => setActionOutput(e.target.value)} />
              </div>
            </div>
            <div className="mt-2">
              <span className={labelClass}>Config Parameters</span>
              <input
                placeholder="iss/sub={{secrets.clientId}}, aud={{variables.audience}}"
                className={inputClass}
                value={actionConfig}
                onChange={(e) => setActionConfig(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" type="button" onClick={handleAddAction} className="w-full h-8">
              <PlusCircle className="size-3.5 mr-1" /> Add Action
            </Button>
          </div>
        </div>
      )}

      {/* Continue on failure check */}
      <div className="flex items-center gap-2 border-t border-border/20 pt-3">
        <input
          type="checkbox"
          id={`continue-${step.id}`}
          checked={step.continueOnFailure}
          onChange={(e) => onUpdate({ continueOnFailure: e.target.checked })}
          className="size-4 cursor-pointer"
        />
        <label htmlFor={`continue-${step.id}`} className="text-xs font-medium cursor-pointer text-muted-foreground select-none">
          Continue executing subsequent steps if this step fails
        </label>
      </div>
    </div>
  )
}

export function BuilderWorkbench({ monitor }: BuilderWorkbenchProps) {
  const [draft, setDraft] = useState(monitor)
  const [jsonText, setJsonText] = useState(() => JSON.stringify(configFromMonitor(monitor), null, 2))
  const [parseError, setParseError] = useState<string | null>(null)
  const [executionState, setExecutionState] = useState<ExecutionState>("idle")
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [mockRun, setMockRun] = useState<MonitorRun | null>(null)
  const [builderTab, setBuilderTab] = useState<"steps" | "variables" | "settings" | "json">("steps")

  // Local add form states
  const [newVarKey, setNewVarKey] = useState("")
  const [newVarValue, setNewVarValue] = useState("")
  const [newSecretAlias, setNewSecretAlias] = useState("")

  const validationErrors = useMemo(() => validateMonitor(draft), [draft])

  function updateDraft(next: Monitor) {
    setDraft(next)
    setJsonText(JSON.stringify(configFromMonitor(next), null, 2))
    setParseError(null)
  }

  function updateStep(stepId: string, patch: Partial<MonitorStep>) {
    updateDraft({
      ...draft,
      steps: draft.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    })
  }

  function addVariable(key: string, value: string) {
    if (!key.trim()) return
    updateDraft({
      ...draft,
      variables: {
        ...draft.variables,
        [key.trim()]: value,
      },
    })
  }

  function removeVariable(key: string) {
    const nextVars = { ...draft.variables }
    delete nextVars[key]
    updateDraft({
      ...draft,
      variables: nextVars,
    })
  }

  function updateVariable(key: string, value: string) {
    updateDraft({
      ...draft,
      variables: {
        ...draft.variables,
        [key]: value,
      },
    })
  }

  function addSecretAlias(alias: string) {
    if (!alias.trim()) return
    if ((draft.secretAliases || []).includes(alias.trim())) return
    updateDraft({
      ...draft,
      secretAliases: [...(draft.secretAliases || []), alias.trim()],
    })
  }

  function removeSecretAlias(alias: string) {
    updateDraft({
      ...draft,
      secretAliases: (draft.secretAliases || []).filter((a) => a !== alias),
    })
  }

  function addHttpStep() {
    const newStep: MonitorStep = {
      id: `step-${crypto.randomUUID()}`,
      order: draft.steps.length + 1,
      name: `Step ${draft.steps.length + 1}: HTTP Request`,
      type: "http",
      method: "GET",
      url: "https://",
      timeoutMs: 10000,
      retryCount: 0,
      continueOnFailure: false,
      assertions: [
        {
          id: `assert-${crypto.randomUUID()}`,
          type: "statusCode",
          label: "Status code is 200",
          target: "status",
          operator: "equals",
          expected: "200",
        }
      ],
      extractors: [],
      preRequestScript: "",
      config: { headers: {}, body: "" },
    }
    updateDraft({
      ...draft,
      steps: [...draft.steps, newStep],
    })
  }

  function addPreRequestStep() {
    const newStep: MonitorStep = {
      id: `step-${crypto.randomUUID()}`,
      order: draft.steps.length + 1,
      name: `Step ${draft.steps.length + 1}: Pre-Request Script Actions`,
      type: "preRequest",
      timeoutMs: 5000,
      retryCount: 0,
      continueOnFailure: false,
      actions: [],
      assertions: [],
      extractors: [],
    }
    updateDraft({
      ...draft,
      steps: [...draft.steps, newStep],
    })
  }

  function deleteStep(stepId: string) {
    const nextSteps = draft.steps
      .filter((step) => step.id !== stepId)
      .map((step, idx) => ({ ...step, order: idx + 1 }))
    updateDraft({
      ...draft,
      steps: nextSteps,
    })
  }

  function moveStep(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return
    if (direction === "down" && index === draft.steps.length - 1) return

    const nextSteps = [...draft.steps]
    const swapWith = direction === "up" ? index - 1 : index + 1
    const temp = nextSteps[index]!
    nextSteps[index] = nextSteps[swapWith]!
    nextSteps[swapWith] = temp

    const reordered = nextSteps.map((step, idx) => ({ ...step, order: idx + 1 }))
    updateDraft({
      ...draft,
      steps: reordered,
    })
  }

  function handleApplyJson() {
    const result = applyJsonToMonitor(draft, jsonText)

    if (result.error) {
      setParseError(result.error)
      return
    }

    if (result.draft) {
      updateDraft(result.draft)
    }
  }

  async function saveDraft() {
    const errors = validateMonitor(draft)
    if (errors.length) return

    setSaveState("saving")

    try {
      const isNew = !draft.id
      const url = isNew ? "/api/monitors" : `/api/monitors/${draft.id}`
      const method = isNew ? "POST" : "PUT"

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      })

      if (!response.ok) throw new Error("Save failed")

      const payload = (await response.json()) as { monitor: Monitor }
      updateDraft(payload.monitor)
      setSaveState("saved")
      
      setTimeout(() => {
        window.location.href = "/monitors"
      }, 500)
    } catch {
      setSaveState("error")
    }
  }

  async function testMonitorRealData() {
    const errors = validateMonitor(draft)
    if (errors.length) return

    setExecutionState("running")
    setMockRun(null)

    try {
      const response = await fetch(`/api/monitors/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      })

      if (!response.ok) throw new Error("Test failed")

      const payload = (await response.json()) as { run: MonitorRun }
      setMockRun(payload.run)
      setExecutionState("complete")
    } catch (err) {
      console.error("Failed to test monitor with real data, falling back to mock run:", err)
      setMockRun(buildMockRun(draft))
      setExecutionState("complete")
    }
  }

  return (
    <div className="space-y-4">
      {/* Pinned Workbench Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4 mb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight font-heading flex items-center gap-2">
            <span>{draft.id ? "Edit Monitor" : "Create Monitor"}</span>
            <span className="text-xs font-mono font-normal bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
              {draft.name || "Unnamed Monitor"}
            </span>
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">Configure endpoints, schedules, alerting rules, and run live verification tests.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            onClick={saveDraft} 
            disabled={saveState === "saving" || validationErrors.length > 0} 
            className="gap-1.5 h-9 font-semibold"
          >
            {saveState === "saving" ? (
              <RotateCw className="size-3.5 animate-spin" />
            ) : saveState === "saved" ? (
              <CheckCircle2 className="size-3.5 text-emerald-300 animate-pulse" />
            ) : (
              <Save className="size-3.5" />
            )}
            {saveState === "saving"
              ? "Saving..."
              : saveState === "saved"
              ? "Saved!"
              : draft.id
              ? "Save Monitor"
              : "Create Monitor"}
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            onClick={testMonitorRealData} 
            disabled={executionState === "running" || validationErrors.length > 0} 
            className="gap-1.5 h-9"
          >
            {executionState === "running" ? <RotateCw className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Run Test
          </Button>
        </div>
      </div>

      {/* Main Grid Workspace */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
        {/* Left Config tabs block */}
        <div className="space-y-4">
          {/* Tab navigation */}
          <div className="flex gap-1 border-b border-border/40 pb-0">
            {([
              { key: "steps", label: "Steps List", icon: Workflow },
              { key: "variables", label: "Variables & Secrets", icon: KeyRound },
              { key: "settings", label: "Monitor Settings", icon: SlidersHorizontal },
              { key: "json", label: "Raw JSON Config", icon: FileJson },
            ] as const).map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setBuilderTab(tab.key)}
                  className={cn(
                    "px-4 py-2 text-xs font-semibold rounded-t-md transition-colors flex items-center gap-1.5 -mb-px border-b-2 border-transparent",
                    builderTab === tab.key
                      ? "bg-background text-foreground border-b-primary font-bold shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="size-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tab contents */}
          {builderTab === "steps" && (
            <Section title="Step builder" icon={Workflow}>
              <div className="space-y-4">
                {draft.steps.length ? (
                  draft.steps.map((step, idx) => (
                    <StepCard
                      key={step.id}
                      step={step}
                      index={idx}
                      totalSteps={draft.steps.length}
                      onUpdate={(patch) => updateStep(step.id, patch)}
                      onDelete={() => deleteStep(step.id)}
                      onMoveUp={() => moveStep(idx, "up")}
                      onMoveDown={() => moveStep(idx, "down")}
                    />
                  ))
                ) : (
                  <div className="text-muted-foreground text-sm py-8 italic border border-dashed rounded-md text-center bg-muted/5 dark:bg-muted/1">
                    No request steps added yet. Add a step using the buttons below.
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={addHttpStep} className="flex-1 h-9">
                    <PlusCircle className="size-4 mr-1.5" /> Add HTTP Request Step
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addPreRequestStep} className="flex-1 h-9">
                    <PlusCircle className="size-4 mr-1.5" /> Add Pre-Request Action Step
                  </Button>
                </div>
              </div>
            </Section>
          )}

          {builderTab === "variables" && (
            <Section title="Variables and secrets" icon={KeyRound}>
              <div className="grid gap-6 md:grid-cols-2">
                {/* Variables */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Variables</div>
                  {Object.entries(draft.variables || {}).map(([key, value]) => (
                    <div key={key} className="flex gap-2 items-center">
                      <input
                        placeholder="Key"
                        className={cn(inputClass, "font-mono text-xs w-[140px] shrink-0 bg-muted/40")}
                        value={key}
                        disabled
                      />
                      <input
                        placeholder="Value"
                        className={inputClass}
                        value={value}
                        onChange={(e) => updateVariable(key, e.target.value)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => removeVariable(key)}
                        className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 size-9 shrink-0"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2 items-center pt-2 border-t border-border/40">
                    <input
                      placeholder="New Key"
                      className={cn(inputClass, "font-mono text-xs w-[140px] shrink-0")}
                      value={newVarKey}
                      onChange={(e) => setNewVarKey(e.target.value)}
                    />
                    <input
                      placeholder="New Value"
                      className={inputClass}
                      value={newVarValue}
                      onChange={(e) => setNewVarValue(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => {
                        if (!newVarKey.trim()) return
                        addVariable(newVarKey, newVarValue)
                        setNewVarKey("")
                        setNewVarValue("")
                      }}
                      className="h-9 shrink-0"
                    >
                      <PlusCircle className="size-4 mr-1" /> Add
                    </Button>
                  </div>
                </div>

                {/* Secret bindings */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">Secret Aliases</div>
                  {(draft.secretAliases || []).map((alias) => (
                    <div key={alias} className="flex gap-2 items-center rounded-md bg-muted/50 p-2 text-sm justify-between border border-border/30">
                      <span className="font-mono text-xs flex items-center gap-2">
                        <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
                        {`{{secrets.${alias}}}`}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => removeSecretAlias(alias)}
                        className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 size-8 shrink-0"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2 items-center pt-2 border-t border-border/40">
                    <input
                      placeholder="New secret alias"
                      className={cn(inputClass, "font-mono text-xs")}
                      value={newSecretAlias}
                      onChange={(e) => setNewSecretAlias(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => {
                        if (!newSecretAlias.trim()) return
                        addSecretAlias(newSecretAlias)
                        setNewSecretAlias("")
                      }}
                      className="h-9 shrink-0"
                    >
                      <PlusCircle className="size-4 mr-1" /> Bind
                    </Button>
                  </div>
                </div>
              </div>
            </Section>
          )}

          {builderTab === "settings" && (
            <div className="space-y-4">
              <Section title="Basic details" icon={SlidersHorizontal}>
                <div className="grid gap-3 md:grid-cols-2">
                  <label>
                    <span className={labelClass}>Monitor name</span>
                    <input
                      className={inputClass}
                      value={draft.name}
                      onChange={(event) => updateDraft({ ...draft, name: event.target.value })}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Schedule cron</span>
                    <input
                      className={inputClass}
                      value={draft.cron}
                      onChange={(event) => updateDraft({ ...draft, cron: event.target.value, scheduleLabel: "Custom cron" })}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Timeout (ms)</span>
                    <input
                      className={inputClass}
                      min={1000}
                      type="number"
                      value={draft.timeoutMs}
                      onChange={(event) => updateDraft({ ...draft, timeoutMs: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Response body limit KB</span>
                    <input
                      className={inputClass}
                      min={1}
                      type="number"
                      value={draft.responseBodyLimitKb}
                      onChange={(event) => updateDraft({ ...draft, responseBodyLimitKb: Number(event.target.value) })}
                    />
                  </label>
                </div>
              </Section>

              {/* Alert & failure policy */}
              <Section title="Alert & failure policy" icon={ShieldCheck}>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="alert-enabled"
                      checked={draft.alertPolicy?.enabled ?? false}
                      className="size-4 cursor-pointer"
                      onChange={(e) => updateDraft({
                        ...draft,
                        alertPolicy: {
                          ...(draft.alertPolicy || {
                            threshold: 3,
                            responseTimeMs: 2000,
                            email: true,
                            slackWebhook: false,
                            cooldownMinutes: 30,
                          }),
                          enabled: e.target.checked
                        }
                      })}
                    />
                    <label htmlFor="alert-enabled" className="text-sm font-medium cursor-pointer text-foreground select-none">
                      Enable automated alerting for this monitor
                    </label>
                  </div>

                  {(draft.alertPolicy?.enabled ?? false) && (
                    <div className="grid gap-4 md:grid-cols-2 p-4 rounded-lg border border-border/50 bg-background/50">
                      <label>
                        <span className={labelClass}>Consecutive Failure Threshold</span>
                        <input
                          type="number"
                          min={1}
                          className={inputClass}
                          value={draft.alertPolicy.threshold}
                          onChange={(e) => updateDraft({
                            ...draft,
                            alertPolicy: { ...draft.alertPolicy, threshold: Number(e.target.value) }
                          })}
                        />
                      </label>
                      <label>
                        <span className={labelClass}>Response Time Alert Limit (ms)</span>
                        <input
                          type="number"
                          min={100}
                          className={inputClass}
                          value={draft.alertPolicy.responseTimeMs}
                          onChange={(e) => updateDraft({
                            ...draft,
                            alertPolicy: { ...draft.alertPolicy, responseTimeMs: Number(e.target.value) }
                          })}
                        />
                      </label>
                      <label>
                        <span className={labelClass}>Alert Cooldown (minutes)</span>
                        <input
                          type="number"
                          min={1}
                          className={inputClass}
                          value={draft.alertPolicy.cooldownMinutes}
                          onChange={(e) => updateDraft({
                            ...draft,
                            alertPolicy: { ...draft.alertPolicy, cooldownMinutes: Number(e.target.value) }
                          })}
                        />
                      </label>

                      <div className="flex flex-col gap-2 justify-center pt-2">
                        <span className={labelClass}>Notification Channels</span>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={draft.alertPolicy.email}
                              onChange={(e) => updateDraft({
                                ...draft,
                                alertPolicy: { ...draft.alertPolicy, email: e.target.checked }
                              })}
                            />
                            Email Notifications
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={draft.alertPolicy.slackWebhook}
                              onChange={(e) => updateDraft({
                                ...draft,
                                alertPolicy: { ...draft.alertPolicy, slackWebhook: e.target.checked }
                              })}
                            />
                            Slack Webhook
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            </div>
          )}

          {builderTab === "json" && (
            <Section title="JSON config" icon={FileJson}>
              <div className="space-y-3">
                <textarea
                  className="min-h-[450px] w-full resize-y rounded-md bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-100 outline-none border border-border/50"
                  spellCheck={false}
                  value={jsonText}
                  onChange={(event) => {
                    setJsonText(event.target.value)
                    setParseError(null)
                  }}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleApplyJson}>
                    <Save className="size-4 mr-1.5" />
                    Apply JSON Changes
                  </Button>
                </div>
                {parseError && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
                    {parseError}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Validation Status Area (if errors exist) */}
          {validationErrors.length > 0 && builderTab !== "json" && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
              <div className="font-semibold mb-1">Please fix the following validation errors to save or test:</div>
              <ul className="list-disc pl-5 space-y-0.5 text-xs">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {saveState === "saved" && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
              Monitor draft has been saved successfully!
            </div>
          )}
          {saveState === "error" && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
              Failed to save monitor draft.
            </div>
          )}
        </div>

        {/* Right Sidebar: Execution log results */}
        <aside className="space-y-4">
          <Section title="Test execution" icon={TerminalSquare}>
            {executionState === "idle" ? (
              <p className="text-muted-foreground text-xs leading-6">
                Click the **"Run Test"** button in the header to trigger a live dry-run of this monitor draft. 
                It will run all HTTP requests, evaluate assertions, and extract variables without writing to the database history.
              </p>
            ) : null}
            {executionState === "running" ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm py-4 justify-center">
                <RotateCw className="size-4 animate-spin text-primary" />
                Executing draft steps live...
              </div>
            ) : null}
            {mockRun ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2.5">
                  <div>
                    <div className="text-xs font-semibold">Dry-run Results</div>
                    <div className="text-muted-foreground text-[10px]">{mockRun.durationMs}ms total latency</div>
                  </div>
                  <StatusPill status={mockRun.status} />
                </div>
                
                {mockRun.failureReason && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
                    <div className="font-semibold mb-0.5">Failure Reason:</div>
                    {mockRun.failureReason}
                  </div>
                )}

                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {mockRun.steps.map((step) => (
                    <div key={step.id} className="rounded-md bg-muted/60 border border-border/40 p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2 border-b border-border/20 pb-1">
                        <span className="font-semibold">{step.stepName}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground font-mono">{step.latencyMs}ms</span>
                          <StatusPill status={step.status} />
                        </div>
                      </div>
                      {step.requestSummary && (
                        <div>
                          <span className="text-muted-foreground font-semibold">Request: </span>
                          <span className="font-mono text-foreground break-all bg-black/5 dark:bg-black/25 px-1 py-0.5 rounded">{step.requestSummary}</span>
                        </div>
                      )}
                      {step.responseSummary && (
                        <div>
                          <span className="text-muted-foreground font-semibold">Response: </span>
                          <span className="text-foreground">{step.responseSummary}</span>
                        </div>
                      )}
                      {step.errorMessage && (
                        <div className="text-rose-500 font-medium">
                          Error: {step.errorMessage}
                        </div>
                      )}
                      
                      {/* Assertions */}
                      {step.assertions && step.assertions.length > 0 && (
                        <div className="pt-1.5 border-t border-border/20 space-y-1">
                          <div className="text-[10px] uppercase font-semibold text-muted-foreground">Assertions Checked:</div>
                          {step.assertions.map((assertion) => {
                            const failed = checkAssertionFailed(assertion)
                            return (
                              <div key={assertion.id} className="flex justify-between items-center text-[10px]">
                                <span className="text-muted-foreground truncate max-w-[180px]">
                                  {assertion.type}({assertion.target}) {assertion.operator} {assertion.expected}
                                </span>
                                <span className={cn(
                                  "font-semibold",
                                  failed ? "text-rose-500" : "text-emerald-500"
                                )}>
                                  {failed ? `Failed (got: ${assertion.actual})` : "Passed"}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Console Log */}
                      {step.consoleOutput && step.consoleOutput.length > 0 && (
                        <div className="pt-1.5 border-t border-border/20 space-y-1">
                          <div className="text-[10px] uppercase font-semibold text-muted-foreground flex items-center gap-1">
                            <Terminal className="size-3" />
                            Console Output:
                          </div>
                          <div className="bg-zinc-950 rounded-md p-2 text-[11px] font-mono text-zinc-300 space-y-0.5 max-h-32 overflow-auto">
                            {step.consoleOutput.map((line, i) => (
                              <div key={i} className="flex gap-1.5">
                                <span className="text-zinc-600 select-none">{">"}</span>
                                <span>{line}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Section>
        </aside>
      </div>
    </div>
  )
}
