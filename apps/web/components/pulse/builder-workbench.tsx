"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
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
  Sparkles,
  X,
  XCircle,
  Edit3,
  AlertTriangle,
  Loader2,
  Copy,
  Check,
  Upload,
  History,
  Rocket,
} from "lucide-react"

import { MonitorImportExportDialog } from "./monitor-import-export-dialog"
import { MonitorVersionsPanel } from "./monitor-versions-panel"
import { ScriptEditor } from "./script-editor"
import Editor from "@monaco-editor/react"
import { useTheme } from "next-themes"
import type { Application, Monitor, MonitorRun, MonitorStatus, MonitorStep, PulseAssertion, PulseExtractor, PreRequestAction } from "@/lib/pulse-types"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@workspace/ui/components/dialog"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

interface BuilderWorkbenchProps {
  monitor: Monitor
  applications?: Application[]
}

type ExecutionState = "idle" | "running" | "complete"
type SaveState = "idle" | "saving" | "saved" | "error"

const inputClass =
  "border-input bg-background ring-offset-background focus-visible:ring-ring min-h-9 w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"

const labelClass = "text-muted-foreground mb-1.5 block text-xs font-medium"

function configFromMonitor(monitor: Monitor) {
  return {
    applicationId: monitor.applicationId || "",
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
  mockRun: MonitorRun | null
  onUpdate: (patch: Partial<MonitorStep>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

const methodColors: Record<string, string> = {
  GET: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  POST: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
  PUT: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
  PATCH: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20",
  DELETE: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
  HEAD: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
  OPTIONS: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
}

function StepCard({ step, index, totalSteps, mockRun, onUpdate, onDelete, onMoveUp, onMoveDown }: StepCardProps) {
  const { resolvedTheme } = useTheme()
  const editorTheme = resolvedTheme === "light" ? "light" : "vs-dark"
  // Tabs State
  const [activeTab, setActiveTab] = useState<"headers" | "body" | "scripts" | "tests" | "settings">("headers")

  // Copilot AI Suggestions States
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([])
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)

  // Copilot AI Extractor Suggestions States
  const [aiExtractorSuggestions, setAiExtractorSuggestions] = useState<any[]>([])
  const [isSuggestingExtractors, setIsSuggestingExtractors] = useState(false)
  const [extractorSuggestionError, setExtractorSuggestionError] = useState<string | null>(null)

  const suggestExtractorsWithAI = async () => {
    setExtractorSuggestionError(null)
    setAiExtractorSuggestions([])

    const stepResult = mockRun?.steps?.find((s) => s.stepName === step.name || s.id === step.id)
    const finalStepResult = stepResult || mockRun?.steps?.[index]

    if (!finalStepResult || !finalStepResult.responseSummary) {
      setExtractorSuggestionError("Please click 'Run Test' at the top to execute the monitor and get a response payload first.")
      return
    }

    setIsSuggestingExtractors(true)
    try {
      const response = await fetch("/api/copilot/extractors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: step.url ?? "",
          method: step.method ?? "GET",
          statusCode: finalStepResult.errorMessage ? 0 : 200,
          responseBody: finalStepResult.responseSummary,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate suggestions")
      }

      const data = await response.json()
      if (Array.isArray(data.suggestions)) {
        setAiExtractorSuggestions(data.suggestions)
      } else {
        throw new Error("AI extractor suggestions were not returned as a valid array.")
      }
    } catch (err) {
      setExtractorSuggestionError(err instanceof Error ? err.message : "Failed to suggest extractors.")
    } finally {
      setIsSuggestingExtractors(false)
    }
  }

  const addSuggestedExtractor = (suggestion: any) => {
    const newExt: PulseExtractor = {
      id: `extract-${crypto.randomUUID()}`,
      name: suggestion.name || "extracted_var",
      type: suggestion.type || "jsonPath",
      source: suggestion.source || "",
      sensitive: false,
      optional: false,
    }
    onUpdate({
      extractors: [...step.extractors, newExt],
    })
    setAiExtractorSuggestions((prev) => prev.filter((e) => e.name !== suggestion.name))
  }

  const suggestAssertionsWithAI = async () => {
    setSuggestionError(null)
    setAiSuggestions([])

    const stepResult = mockRun?.steps?.find((s) => s.stepName === step.name || s.id === step.id)
    const finalStepResult = stepResult || mockRun?.steps?.[index]

    if (!finalStepResult || !finalStepResult.responseSummary) {
      setSuggestionError("Please click 'Run Test' at the top to execute the monitor and get a response payload first.")
      return
    }

    setIsSuggesting(true)
    try {
      const response = await fetch("/api/copilot/assertions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: step.url ?? "",
          method: step.method ?? "GET",
          statusCode: finalStepResult.errorMessage ? 0 : 200,
          responseBody: finalStepResult.responseSummary,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate suggestions")
      }

      const data = await response.json()
      if (Array.isArray(data.suggestions)) {
        setAiSuggestions(data.suggestions)
      } else {
        throw new Error("AI suggestions were not returned as a valid array.")
      }
    } catch (err) {
      setSuggestionError(err instanceof Error ? err.message : "Failed to suggest assertions.")
    } finally {
      setIsSuggesting(false)
    }
  }

  const addSuggestedAssertion = (suggestion: any) => {
    const newAssert: PulseAssertion = {
      id: `assert-${crypto.randomUUID()}`,
      type: suggestion.type || "jsonPath",
      label: suggestion.label || `${suggestion.type} assertion`,
      target: suggestion.target || "",
      operator: suggestion.operator || "equals",
      expected: suggestion.expected !== undefined ? String(suggestion.expected) : "",
      sensitive: false,
    }
    onUpdate({
      assertions: [...step.assertions, newAssert],
    })
    setAiSuggestions((prev) => prev.filter((a) => a.label !== suggestion.label))
  }

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
    <div className="p-4 space-y-5">
      {/* Header Info */}
      <div className="flex items-center justify-between border-b border-border/40 pb-2.5 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step Editor</span>
          <span className="text-muted-foreground text-xs">·</span>
          <span className="font-mono text-xs font-semibold text-primary">{step.name}</span>
        </div>
        <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border/30">
          {step.type === "http" ? "HTTP Request" : "Pre-request Action"}
        </span>
      </div>

      {/* Step Settings (Name, Timeout, Retry) */}
      {step.type !== "http" && (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3 bg-muted/15 border border-border/20 p-3 rounded-lg items-end">
          <div>
            <span className={labelClass}>Step Name</span>
            <input className={inputClass} value={step.name} onChange={(event) => onUpdate({ name: event.target.value })} />
          </div>
          <div>
            <span className={labelClass}>Timeout (ms)</span>
            <input
              type="number"
              className={inputClass}
              min={100}
              value={step.timeoutMs}
              onChange={(event) => onUpdate({ timeoutMs: Number(event.target.value) })}
            />
          </div>
          <div>
            <span className={labelClass}>Retry Count</span>
            <input
              type="number"
              className={inputClass}
              min={0}
              value={step.retryCount}
              onChange={(event) => onUpdate({ retryCount: Number(event.target.value) })}
            />
          </div>
        </div>
      )}

      {/* HTTP Config */}
      {step.type === "http" && (
        <div className="space-y-4">
          {/* Request Bar */}
          <div className="space-y-1.5">
            <span className={labelClass}>Request URL</span>
            <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 overflow-hidden shadow-xs">
              <div className="w-[110px] shrink-0 border-r border-input bg-muted/30">
                <Select value={step.method ?? "GET"} onValueChange={(val) => onUpdate({ method: val ?? undefined })}>
                  <SelectTrigger className="w-full h-9 border-none bg-transparent rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 px-3 cursor-pointer font-bold text-xs select-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <input
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none border-none h-9 w-full min-w-0 font-mono text-xs"
                value={step.url ?? ""}
                placeholder="https://{{variables.baseUrl}}/health"
                onChange={(event) => onUpdate({ url: event.target.value })}
              />
            </div>
          </div>

          {/* Sub-Tabs Navigation */}
          <div className="flex gap-1 border-b border-border/40 pb-0 pt-2">
            {([
              { key: "headers", label: "Headers", count: Object.keys(step.config?.headers || {}).length },
              { key: "body", label: "Body", hasIndicator: !!step.config?.body },
              { key: "scripts", label: "Pre-request Script", hasIndicator: !!step.preRequestScript },
              { key: "tests", label: "Tests & Extractors", count: step.assertions.length + step.extractors.length },
              { key: "settings", label: "Settings" },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "px-3 py-2 text-xs font-semibold rounded-t-md transition-all -mb-px border-b-2 border-transparent flex items-center gap-1.5",
                  activeTab === tab.key
                    ? "bg-background text-foreground border-b-primary font-bold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{tab.label}</span>
                {"count" in tab && tab.count > 0 && (
                  <span className="bg-muted px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono font-medium text-muted-foreground border border-border/20">
                    {tab.count}
                  </span>
                )}
                {"hasIndicator" in tab && tab.hasIndicator && (
                  <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                )}
              </button>
            ))}
          </div>

          {/* Sub-Tab Contents */}
          {activeTab === "headers" && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                <span>Headers List</span>
                <span className="text-[10px] font-mono text-muted-foreground">({Object.keys(step.config?.headers || {}).length} total)</span>
              </div>
              <div className="space-y-2 border border-border/40 p-3 rounded-lg bg-muted/5">
                {localHeaders.length > 0 ? (
                  <div className="space-y-2">
                    {localHeaders.map((header, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          placeholder="Header Key (e.g. Content-Type)"
                          className={cn(inputClass, "font-mono text-xs flex-1 bg-background")}
                          value={header.key}
                          onChange={(e) => updateLocalHeader(idx, "key", e.target.value)}
                        />
                        <span className="text-muted-foreground text-xs">:</span>
                        <input
                          placeholder="Value"
                          className={cn(inputClass, "font-mono text-xs flex-[2] bg-background")}
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
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic text-center py-4">
                    No custom headers defined.
                  </div>
                )}
                <div className="pt-2 border-t border-border/40 mt-1 flex justify-start">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={addLocalHeader}
                    className="h-8 text-xs gap-1"
                  >
                    <Plus className="size-3.5" /> Add Header
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "body" && (
            <div className="space-y-2">
              <span className={labelClass}>Raw Request Body</span>
              <div className="min-h-[180px] w-full rounded-md border border-border/50 overflow-hidden bg-[#1e1e1e] dark:bg-[#1e1e1e] light:bg-[#fffffe] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <Editor
                  height="180px"
                  language="json"
                  theme={editorTheme}
                  value={step.config?.body ?? ""}
                  onChange={(val) => {
                    onUpdate({
                      config: {
                        ...step.config,
                        body: val ?? "",
                      },
                    })
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 12,
                    fontFamily: "var(--font-mono), monospace",
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 8, bottom: 8 },
                    tabSize: 2,
                    fixedOverflowWidgets: true,
                  }}
                />
              </div>
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
              <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center justify-between">
                    <span>Assertions</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={suggestAssertionsWithAI}
                      disabled={isSuggesting}
                      className="text-primary hover:text-primary/90 gap-1 h-7 text-[10.5px] px-2 rounded-md hover:bg-muted/80"
                    >
                      {isSuggesting ? (
                        <RotateCw className="size-3 animate-spin" />
                      ) : (
                        <Sparkles className="size-3 text-primary animate-pulse" />
                      )}
                      Suggest (AI)
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {step.assertions.length ? (
                      step.assertions.map((assertion) => (
                        <div key={assertion.id} className="flex justify-between items-center bg-muted/50 px-2.5 py-1.5 rounded-md text-xs border border-border/30">
                          <div className="truncate flex-1 mr-2">
                            <span className="font-semibold text-primary uppercase text-[10px]">{assertion.type}</span>
                            <span className="mx-1 text-muted-foreground/60">·</span>
                            <span className="font-mono text-muted-foreground">{assertion.target || "body"}</span>
                            <span className="mx-1 text-muted-foreground/60 text-[10px] font-semibold uppercase">{assertion.operator}</span>
                            <span className="font-mono bg-muted px-1 py-0.2 rounded border border-border/20 text-foreground">{assertion.expected}</span>
                            {assertion.sensitive && <span className="ml-1.5 text-emerald-600 font-semibold text-[9px] uppercase">(masked)</span>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              onClick={() => {
                                setAssertType(assertion.type)
                                setAssertTarget(assertion.target || "")
                                setAssertOperator(assertion.operator || "equals")
                                setAssertExpected(assertion.expected || "")
                                setAssertSensitive(!!assertion.sensitive)
                                handleDeleteAssertion(assertion.id)
                              }}
                              className="text-muted-foreground hover:text-foreground size-6 hover:bg-muted/80 rounded"
                              title="Edit Assertion"
                            >
                              <Edit3 className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              onClick={() => handleDeleteAssertion(assertion.id)}
                              className="text-rose-500 hover:text-rose-700 size-6 hover:bg-muted/80 rounded"
                              title="Delete Assertion"
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground text-xs italic">No assertions added yet.</div>
                    )}
                  </div>

                  {isSuggesting && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs text-primary flex items-center gap-2">
                      <RotateCw className="size-3.5 animate-spin text-primary" />
                      Copilot is analyzing response payload...
                    </div>
                  )}

                  {suggestionError && (
                    <div className="rounded-md border border-amber-250 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-950/40 dark:bg-amber-950/20 dark:text-amber-300 flex justify-between items-start gap-2">
                      <span className="flex-1">{suggestionError}</span>
                      <button type="button" onClick={() => setSuggestionError(null)} className="text-amber-800 hover:text-amber-900 shrink-0 font-bold text-sm">×</button>
                    </div>
                  )}

                  {aiSuggestions.length > 0 && (
                    <div className="bg-primary/5 rounded-lg border border-primary/10 p-3 space-y-2">
                      <div className="text-[10px] font-bold uppercase text-primary tracking-wider flex items-center justify-between">
                        <span>AI Suggestions</span>
                        <Button variant="ghost" size="icon" onClick={() => setAiSuggestions([])} className="size-5 text-primary hover:bg-primary/10 rounded">
                          <X className="size-3" />
                        </Button>
                      </div>
                      <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                        {aiSuggestions.map((suggestion, sIdx) => (
                          <div key={sIdx} className="flex justify-between items-center bg-background px-2.5 py-1.5 rounded-md text-xs border border-border/20">
                            <div className="truncate flex-1 mr-2 leading-relaxed text-left">
                              <span className="font-semibold text-primary uppercase text-[9px]">{suggestion.type}</span>
                              <span className="mx-1 text-muted-foreground/60">·</span>
                              <span className="font-mono text-muted-foreground">{suggestion.target}</span>
                              <span className="mx-1 text-muted-foreground/60 text-[9px] font-semibold uppercase">{suggestion.operator}</span>
                              <span className="font-mono bg-muted px-1 py-0.2 rounded text-foreground">{suggestion.expected}</span>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => addSuggestedAssertion(suggestion)}
                              className="h-6 px-2 text-[10px] text-emerald-600 border-emerald-600/30 hover:bg-emerald-500/10 shrink-0"
                            >
                              Add
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-border/30 mt-3 space-y-3">
                  <div className="grid gap-2 grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr_45px] items-end">
                    <div>
                      <span className={labelClass}>Assert Type</span>
                      <Select value={assertType} onValueChange={(val) => val && setAssertType(val)}>
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="statusCode">Status Code</SelectItem>
                          <SelectItem value="responseTime">Response Time</SelectItem>
                          <SelectItem value="jsonPath">JSONPath</SelectItem>
                          <SelectItem value="header">Header</SelectItem>
                          <SelectItem value="bodyContains">Body Contains</SelectItem>
                          <SelectItem value="regex">Regex Match</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <span className={labelClass}>Target</span>
                      <input placeholder="status, latency, $.id" className={cn(inputClass, "h-8 text-xs")} value={assertTarget} onChange={(e) => setAssertTarget(e.target.value)} />
                    </div>
                    <div>
                      <span className={labelClass}>Operator</span>
                      <Select value={assertOperator} onValueChange={(val) => val && setAssertOperator(val)}>
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equals">equals</SelectItem>
                          <SelectItem value="notEquals">notEquals</SelectItem>
                          <SelectItem value="contains">contains</SelectItem>
                          <SelectItem value="notContains">notContains</SelectItem>
                          <SelectItem value="exists">exists</SelectItem>
                          <SelectItem value="notExists">notExists</SelectItem>
                          <SelectItem value="greaterThan">greaterThan</SelectItem>
                          <SelectItem value="lessThan">lessThan</SelectItem>
                          <SelectItem value="matchesRegex">matchesRegex</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <span className={labelClass}>Expected</span>
                      <input placeholder="Expected val" className={cn(inputClass, "h-8 text-xs")} value={assertExpected} onChange={(e) => setAssertExpected(e.target.value)} />
                    </div>
                    <div className="flex flex-col items-center justify-center h-8">
                      <span className="text-[8px] text-muted-foreground font-semibold uppercase mb-0.5">Mask</span>
                      <input type="checkbox" checked={assertSensitive} onChange={(e) => setAssertSensitive(e.target.checked)} className="size-3.5 cursor-pointer" />
                    </div>
                  </div>
                  <Button variant="outline" size="sm" type="button" onClick={handleAddAssertion} className="w-full h-8 text-xs mt-1">
                    <PlusCircle className="size-3.5 mr-1" /> Add Assertion
                  </Button>
                </div>
              </div>

              {/* Extractors Section */}
              <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center justify-between">
                    <span>Extractors</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={suggestExtractorsWithAI}
                      disabled={isSuggestingExtractors}
                      className="text-primary hover:text-primary/90 gap-1 h-7 text-[10.5px] px-2 rounded-md hover:bg-muted/80"
                    >
                      {isSuggestingExtractors ? (
                        <RotateCw className="size-3 animate-spin" />
                      ) : (
                        <Sparkles className="size-3 text-primary animate-pulse" />
                      )}
                      Suggest (AI)
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {step.extractors.length ? (
                      step.extractors.map((extractor) => (
                        <div key={extractor.id} className="flex justify-between items-center bg-muted/50 px-2.5 py-1.5 rounded-md text-xs border border-border/30">
                          <div className="truncate flex-1 mr-2">
                            <span className="font-semibold text-primary">{extractor.name}</span>
                            <span className="mx-1 text-muted-foreground/60">·</span>
                            <span className="font-mono text-muted-foreground uppercase text-[9px]">{extractor.type}</span>
                            <span className="mx-1 text-muted-foreground/60">from</span>
                            <span className="font-mono text-muted-foreground bg-muted px-1 rounded">{extractor.source}</span>
                            {extractor.sensitive && <span className="ml-1.5 text-emerald-600 font-semibold text-[9px] uppercase">(masked)</span>}
                            {extractor.optional && <span className="ml-1 text-muted-foreground font-medium text-[9px]">(optional)</span>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              onClick={() => {
                                setExtType(extractor.type)
                                setExtName(extractor.name)
                                setExtSource(extractor.source)
                                setExtSensitive(!!extractor.sensitive)
                                setExtOptional(!!extractor.optional)
                                handleDeleteExtractor(extractor.id)
                              }}
                              className="text-muted-foreground hover:text-foreground size-6 hover:bg-muted/80 rounded"
                              title="Edit Extractor"
                            >
                              <Edit3 className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              onClick={() => handleDeleteExtractor(extractor.id)}
                              className="text-rose-500 hover:text-rose-700 size-6 hover:bg-muted/80 rounded"
                              title="Delete Extractor"
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground text-xs italic">No extractors added yet.</div>
                    )}
                  </div>

                  {isSuggestingExtractors && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs text-primary flex items-center gap-2">
                      <RotateCw className="size-3.5 animate-spin text-primary" />
                      Copilot is analyzing response payload...
                    </div>
                  )}

                  {extractorSuggestionError && (
                    <div className="rounded-md border border-amber-250 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-950/40 dark:bg-amber-950/20 dark:text-amber-300 flex justify-between items-start gap-2">
                      <span className="flex-1">{extractorSuggestionError}</span>
                      <button type="button" onClick={() => setExtractorSuggestionError(null)} className="text-amber-800 hover:text-amber-900 shrink-0 font-bold text-sm">×</button>
                    </div>
                  )}

                  {aiExtractorSuggestions.length > 0 && (
                    <div className="bg-primary/5 rounded-lg border border-primary/10 p-3 space-y-2">
                      <div className="text-[10px] font-bold uppercase text-primary tracking-wider flex items-center justify-between">
                        <span>AI Suggestions</span>
                        <Button variant="ghost" size="icon" onClick={() => setAiExtractorSuggestions([])} className="size-5 text-primary hover:bg-primary/10 rounded">
                          <X className="size-3" />
                        </Button>
                      </div>
                      <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                        {aiExtractorSuggestions.map((suggestion, sIdx) => (
                          <div key={sIdx} className="flex justify-between items-center bg-background px-2.5 py-1.5 rounded-md text-xs border border-border/20">
                            <div className="truncate flex-1 mr-2 leading-relaxed text-left">
                              <span className="font-semibold text-primary">{suggestion.name}</span>
                              <span className="mx-1 text-muted-foreground/60">·</span>
                              <span className="font-mono text-muted-foreground uppercase text-[9px]">{suggestion.type}</span>
                              <span className="mx-1 text-muted-foreground/60">from</span>
                              <span className="font-mono text-muted-foreground bg-muted px-1 rounded">{suggestion.source}</span>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => addSuggestedExtractor(suggestion)}
                              className="h-6 px-2 text-[10px] text-emerald-600 border-emerald-600/30 hover:bg-emerald-500/10 shrink-0"
                            >
                              Add
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-border/30 mt-3 space-y-3">
                  <div className="grid gap-2 grid-cols-1 sm:grid-cols-[1fr_1fr_2fr_40px_40px] items-end">
                    <div>
                      <span className={labelClass}>Variable Name</span>
                      <input placeholder="token" className={cn(inputClass, "h-8 text-xs")} value={extName} onChange={(e) => setExtName(e.target.value)} />
                    </div>
                    <div>
                      <span className={labelClass}>Type</span>
                      <Select value={extType} onValueChange={(val) => val && setExtType(val)}>
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="jsonPath">JSONPath</SelectItem>
                          <SelectItem value="header">Header</SelectItem>
                          <SelectItem value="cookie">Cookie</SelectItem>
                          <SelectItem value="regex">Regex</SelectItem>
                          <SelectItem value="statusCode">Status Code</SelectItem>
                          <SelectItem value="responseTime">Response Time</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <span className={labelClass}>Source</span>
                      <input placeholder="$.access_token, Authorization" className={cn(inputClass, "h-8 text-xs")} value={extSource} onChange={(e) => setExtSource(e.target.value)} />
                    </div>
                    <div className="flex flex-col items-center justify-center h-8">
                      <span className="text-[8px] text-muted-foreground font-semibold uppercase mb-0.5">Mask</span>
                      <input type="checkbox" checked={extSensitive} onChange={(e) => setExtSensitive(e.target.checked)} className="size-3.5 cursor-pointer" />
                    </div>
                    <div className="flex flex-col items-center justify-center h-8">
                      <span className="text-[8px] text-muted-foreground font-semibold uppercase mb-0.5">Opt</span>
                      <input type="checkbox" checked={extOptional} onChange={(e) => setExtOptional(e.target.checked)} className="size-3.5 cursor-pointer" />
                    </div>
                  </div>
                  <Button variant="outline" size="sm" type="button" onClick={handleAddExtractor} className="w-full h-8 text-xs mt-1">
                    <PlusCircle className="size-3.5 mr-1" /> Add Extractor
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Step Configuration</div>
              <div className="grid gap-3 grid-cols-1 md:grid-cols-3 bg-muted/15 border border-border/20 p-4 rounded-lg items-end">
                <div>
                  <span className={labelClass}>Step Name</span>
                  <input className={inputClass} value={step.name} onChange={(event) => onUpdate({ name: event.target.value })} />
                </div>
                <div>
                  <span className={labelClass}>Timeout (ms)</span>
                  <input
                    type="number"
                    className={inputClass}
                    min={100}
                    value={step.timeoutMs}
                    onChange={(event) => onUpdate({ timeoutMs: Number(event.target.value) })}
                  />
                </div>
                <div>
                  <span className={labelClass}>Retry Count</span>
                  <input
                    type="number"
                    className={inputClass}
                    min={0}
                    value={step.retryCount}
                    onChange={(event) => onUpdate({ retryCount: Number(event.target.value) })}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pre-Request Config */}
      {step.type === "preRequest" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3">
            <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Pre-request Actions</div>
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

            <div className="grid gap-2 grid-cols-2 md:grid-cols-[140px_1fr_1fr] pt-3 border-t border-border/30 mt-3 items-end">
              <div>
                <span className={labelClass}>Action Type</span>
                <Select value={actionType} onValueChange={(val) => val && setActionType(val)}>
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generateJWT">Generate JWT</SelectItem>
                    <SelectItem value="hmacSha256">HMAC SHA256</SelectItem>
                    <SelectItem value="generateUUID">Generate UUID</SelectItem>
                    <SelectItem value="generateTimestamp">Generate Timestamp</SelectItem>
                    <SelectItem value="base64Encode">Base64 Encode</SelectItem>
                    <SelectItem value="base64Decode">Base64 Decode</SelectItem>
                    <SelectItem value="urlEncode">URL Encode</SelectItem>
                    <SelectItem value="urlDecode">URL Decode</SelectItem>
                    <SelectItem value="sha256">SHA256 Hash</SelectItem>
                    <SelectItem value="setVariable">Set Variable</SelectItem>
                    <SelectItem value="readStepOutput">Read Previous Output</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <span className={labelClass}>Label</span>
                <input placeholder="Generate client assertion" className={cn(inputClass, "h-8 text-xs")} value={actionLabel} onChange={(e) => setActionLabel(e.target.value)} />
              </div>
              <div>
                <span className={labelClass}>Output Key</span>
                <input placeholder="jwt" className={cn(inputClass, "h-8 text-xs")} value={actionOutput} onChange={(e) => setActionOutput(e.target.value)} />
              </div>
            </div>
            <div className="mt-2">
              <span className={labelClass}>Config Parameters</span>
              <input
                placeholder="iss/sub={{secrets.clientId}}, aud={{variables.audience}}"
                className={cn(inputClass, "h-8 text-xs")}
                value={actionConfig}
                onChange={(e) => setActionConfig(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" type="button" onClick={handleAddAction} className="w-full h-8 text-xs mt-1">
              <PlusCircle className="size-3.5 mr-1" /> Add Action
            </Button>
          </div>
        </div>
      )}

      {/* Continue on failure check */}
      <div className="flex items-center justify-between pt-4 border-t border-border/20 mt-4 bg-muted/10 px-4 py-2.5 rounded-lg">
        <div className="space-y-0.5">
          <div className="text-xs font-semibold text-foreground">Continue on Failure</div>
          <p className="text-[10px] text-muted-foreground">If enabled, subsequent steps will execute even if this step fails.</p>
        </div>
        <input
          type="checkbox"
          id={`continue-${step.id}`}
          checked={step.continueOnFailure}
          onChange={(e) => onUpdate({ continueOnFailure: e.target.checked })}
          className="size-4 cursor-pointer rounded border-input text-primary focus:ring-primary"
        />
      </div>
    </div>
  )
}

export function BuilderWorkbench({ monitor, applications = [] }: BuilderWorkbenchProps) {
  const { resolvedTheme } = useTheme()
  const editorTheme = resolvedTheme === "light" ? "light" : "vs-dark"
  const [draft, setDraft] = useState(monitor)
  const [jsonText, setJsonText] = useState(() => JSON.stringify(configFromMonitor(monitor), null, 2))
  const [parseError, setParseError] = useState<string | null>(null)
  const [executionState, setExecutionState] = useState<ExecutionState>("idle")
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [mockRun, setMockRun] = useState<MonitorRun | null>(null)
  const [isConsoleOpen, setIsConsoleOpen] = useState(false)
  const [published, setPublished] = useState<Monitor>(monitor)
  const [publishedVersion, setPublishedVersion] = useState(monitor.publishedVersion ?? 1)
  const [hasUnpublishedDraft, setHasUnpublishedDraft] = useState(monitor.hasUnpublishedDraft ?? false)
  const [publishNote, setPublishNote] = useState("")
  const [builderTab, setBuilderTab] = useState<"steps" | "variables" | "settings" | "json" | "copilot" | "versions">("steps")
  const [selectedStepId, setSelectedStepId] = useState<string | null>(() => {
    return monitor.steps.length > 0 ? (monitor.steps[0]?.id ?? null) : null
  })

  // AI Builder and Optimizer States
  const [safetyWarnings, setSafetyWarnings] = useState<any[] | null>(null)
  const [safetyCheckLoading, setSafetyCheckLoading] = useState(false)
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false)
  const [isImportExportOpen, setIsImportExportOpen] = useState(false)
  const [isCurlModalOpen, setIsCurlModalOpen] = useState(false)
  const [curlInput, setCurlInput] = useState("")
  const [curlConverting, setCurlConverting] = useState(false)
  const [curlResult, setCurlResult] = useState<any | null>(null)
  const [optimizing, setOptimizing] = useState(false)

  useEffect(() => {
    if (!monitor.id) return

    async function loadDetail() {
      try {
        const response = await fetch(`/api/monitors/${monitor.id}`)
        if (!response.ok) return
        const payload = await response.json()
        const nextPublished = (payload.published ?? payload.monitor) as Monitor
        const nextDraft = (payload.draft ?? nextPublished) as Monitor
        setPublished(nextPublished)
        setDraft(nextDraft)
        setPublishedVersion(payload.publishedVersion ?? nextPublished.publishedVersion ?? 1)
        setHasUnpublishedDraft(payload.hasUnpublishedDraft ?? nextPublished.hasUnpublishedDraft ?? false)
        setJsonText(JSON.stringify(configFromMonitor(nextDraft), null, 2))
      } catch (error) {
        console.error("Failed to load monitor detail:", error)
      }
    }

    void loadDetail()
  }, [monitor.id])
  const [optimizationSuggestions, setOptimizationSuggestions] = useState<any[]>([])
  const [monitorPrompt, setMonitorPrompt] = useState("")
  const [promptGenerating, setPromptGenerating] = useState(false)
  const [promptResult, setPromptResult] = useState<any | null>(null)

  const selectedStep = useMemo(() => {
    return draft.steps.find((s) => s.id === selectedStepId) || draft.steps[0] || null
  }, [draft.steps, selectedStepId])

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
    const newId = `step-${crypto.randomUUID()}`
    const newStep: MonitorStep = {
      id: newId,
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
    setSelectedStepId(newId)
  }

  function addPreRequestStep() {
    const newId = `step-${crypto.randomUUID()}`
    const newStep: MonitorStep = {
      id: newId,
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
    setSelectedStepId(newId)
  }

  function deleteStep(stepId: string) {
    const nextSteps = draft.steps
      .filter((step) => step.id !== stepId)
      .map((step, idx) => ({ ...step, order: idx + 1 }))
    updateDraft({
      ...draft,
      steps: nextSteps,
    })
    if (selectedStepId === stepId) {
      setSelectedStepId(nextSteps.length > 0 ? (nextSteps[0]?.id ?? null) : null)
    }
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
      const nextSteps = result.draft.steps
      if (nextSteps.length > 0) {
        if (!nextSteps.some((s) => s.id === selectedStepId)) {
          setSelectedStepId(nextSteps[0]?.id ?? null)
        }
      } else {
        setSelectedStepId(null)
      }
    }
  }

  async function saveDraft(): Promise<string | null> {
    const errors = validateMonitor(draft)
    if (errors.length) return null

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

      const payload = await response.json()
      if (isNew) {
        const detail = payload.detail as { published: Monitor; draft?: Monitor; publishedVersion: number; hasUnpublishedDraft: boolean } | undefined
        const created = detail?.draft ?? detail?.published ?? payload.monitor
        if (created) {
          updateDraft(created)
          setPublished(detail?.published ?? created)
          setPublishedVersion(detail?.publishedVersion ?? 1)
          setHasUnpublishedDraft(detail?.hasUnpublishedDraft ?? false)
          window.history.replaceState(null, "", `/monitors/${created.id}/edit`)
          setSaveState("saved")
          setTimeout(() => setSaveState("idle"), 2000)
          return created.id
        }
      } else {
        const savedDraft = (payload.draft ?? payload.monitor) as Monitor
        updateDraft(savedDraft)
        setHasUnpublishedDraft(payload.hasUnpublishedDraft ?? true)
        if (payload.published) setPublished(payload.published as Monitor)
      }
      setSaveState("saved")
      setTimeout(() => setSaveState("idle"), 2000)
      return draft.id
    } catch {
      setSaveState("error")
      return null
    }
  }

  async function publishDraft() {
    const monitorId = draft.id || (await saveDraft())
    if (!monitorId) return

    setSaveState("saving")
    try {
      await fetch(`/api/monitors/${monitorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      })

      const response = await fetch(`/api/monitors/${monitorId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeNote: publishNote }),
      })
      if (!response.ok) throw new Error("Publish failed")

      const payload = await response.json()
      const nextPublished = payload.monitor as Monitor
      setPublished(nextPublished)
      updateDraft(nextPublished)
      setPublishedVersion(nextPublished.publishedVersion ?? publishedVersion + 1)
      setHasUnpublishedDraft(false)
      setPublishNote("")
      setSaveState("saved")
      setTimeout(() => setSaveState("idle"), 2000)
    } catch {
      setSaveState("error")
    }
  }

  async function discardDraftChanges() {
    if (!draft.id) return
    setSaveState("saving")
    try {
      const response = await fetch(`/api/monitors/${draft.id}/draft/discard`, { method: "POST" })
      if (!response.ok) throw new Error("Discard failed")
      const payload = await response.json()
      const nextDraft = (payload.draft ?? published) as Monitor
      updateDraft(nextDraft)
      setHasUnpublishedDraft(false)
      setSaveState("idle")
    } catch {
      setSaveState("error")
    }
  }

  async function runPublishedMonitor() {
    if (!draft.id) return
    setExecutionState("running")
    setExecutionError(null)
    setMockRun(null)
    setIsConsoleOpen(true)
    try {
      const response = await fetch(`/api/monitors/${draft.id}/run`, { method: "POST" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? "Published run failed")
      setMockRun(payload.run)
      setExecutionState("complete")
    } catch (err) {
      setExecutionError(err instanceof Error ? err.message : "Published run failed")
      setExecutionState("idle")
    }
  }

  async function handleSaveClick() {
    const errors = validateMonitor(draft)
    if (errors.length) return

    setSafetyCheckLoading(true)
    try {
      const res = await fetch("/api/copilot/secret-safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: draft.steps }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.result && !data.result.safe && data.result.warnings.length > 0) {
          setSafetyWarnings(data.result.warnings)
          setIsSafetyModalOpen(true)
          return
        }
      }
    } catch (e) {
      console.error("Failed to check secret safety:", e)
    } finally {
      setSafetyCheckLoading(false)
    }

    await saveDraft()
  }

  function importCurlStep() {
    if (!curlResult) return
    const newId = `step-${crypto.randomUUID()}`
    const newStep: MonitorStep = {
      id: newId,
      order: draft.steps.length + 1,
      name: curlResult.name || `Step ${draft.steps.length + 1}: HTTP Request`,
      type: "http",
      method: curlResult.method || "GET",
      url: curlResult.url || "https://",
      timeoutMs: 10000,
      retryCount: 0,
      continueOnFailure: false,
      assertions: (curlResult.assertions || []).map((a: any) => ({
        id: `assert-${crypto.randomUUID()}`,
        type: a.type || "statusCode",
        label: a.label || "Check status",
        target: a.target || "status",
        operator: a.operator || "equals",
        expected: String(a.expected || "200"),
      })),
      extractors: [],
      preRequestScript: "",
      config: {
        headers: curlResult.headers || {},
        body: curlResult.body || "",
      },
    }

    updateDraft({
      ...draft,
      steps: [...draft.steps, newStep],
    })
    setSelectedStepId(newId)
    setIsCurlModalOpen(false)
    setCurlInput("")
    setCurlResult(null)
  }

  async function testMonitorRealData() {
    const errors = validateMonitor(draft)
    if (errors.length) return

    setExecutionState("running")
    setExecutionError(null)
    setMockRun(null)
    setIsConsoleOpen(true)

    try {
      const endpoint = draft.id
        ? `/api/monitors/${draft.id}/run/draft`
        : `/api/monitors/test`
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      })

      const payload = (await response.json().catch(() => null)) as
        | { run: MonitorRun }
        | { error?: string; code?: string; detail?: string }
        | null

      if (!response.ok) {
        const message =
          payload && "detail" in payload && payload.detail
            ? payload.detail
            : payload && "error" in payload && payload.error
              ? payload.error
              : "Monitor test failed"
        throw new Error(message)
      }

      if (!payload || !("run" in payload)) {
        throw new Error("Monitor test returned an invalid response")
      }

      setMockRun(payload.run)
      setExecutionState("complete")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Monitor test failed"
      console.error("Failed to test monitor:", err)
      setExecutionError(message)
      setExecutionState("idle")
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
          <p className="text-muted-foreground text-xs mt-0.5">
            Edit draft config, publish to production, and run draft tests without affecting the scheduled monitor.
          </p>
          {draft.id ? (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded">
                Published v{publishedVersion}
              </span>
              {hasUnpublishedDraft ? (
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded">
                  Unpublished draft changes
                </span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground border border-border/40 px-2 py-0.5 rounded">
                  Draft matches published
                </span>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsImportExportOpen(true)}
            className="gap-1.5 h-9"
          >
            <Upload className="size-3.5" />
            Import / Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveClick}
            disabled={saveState === "saving" || validationErrors.length > 0}
            className="gap-1.5 h-9"
          >
            {saveState === "saving" ? <RotateCw className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {draft.id ? "Save draft" : "Create monitor"}
          </Button>
          {draft.id ? (
            <>
              <input
                value={publishNote}
                onChange={(e) => setPublishNote(e.target.value)}
                placeholder="Publish note (optional)"
                className="h-9 w-36 rounded-md border border-input bg-transparent px-2 text-xs hidden xl:block"
              />
              <Button
                size="sm"
                onClick={() => void publishDraft()}
                disabled={saveState === "saving" || validationErrors.length > 0}
                className="gap-1.5 h-9 font-semibold"
              >
                <Rocket className="size-3.5" />
                Publish
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void discardDraftChanges()}
                disabled={!hasUnpublishedDraft || saveState === "saving"}
                className="h-9 text-xs"
              >
                Discard draft
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={testMonitorRealData}
            disabled={executionState === "running" || validationErrors.length > 0}
            className="gap-1.5 h-9"
          >
            {executionState === "running" ? <RotateCw className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Run draft
          </Button>
          {draft.id ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void runPublishedMonitor()}
              disabled={executionState === "running"}
              className="gap-1.5 h-9"
            >
              <Play className="size-3.5" />
              Run published
            </Button>
          ) : null}
        </div>
      </div>

      {/* Main Workspace (Full Width) */}
      <div className="space-y-6">
        {/* Config tabs block */}
        <div className="space-y-4">
          {/* Tab navigation */}
          <div className="flex gap-1 border-b border-border/40 pb-0">
            {([
              { key: "steps", label: "Steps List", icon: Workflow },
              { key: "variables", label: "Variables & Secrets", icon: KeyRound },
              { key: "settings", label: "Monitor Settings", icon: SlidersHorizontal },
              { key: "json", label: "Raw JSON Config", icon: FileJson },
              { key: "copilot", label: "Pulse AI Copilot", icon: Sparkles },
              ...(draft.id ? [{ key: "versions" as const, label: "Versions", icon: History }] : []),
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
              <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr] border border-border/50 rounded-lg overflow-hidden bg-background min-h-[580px] shadow-xs">
                {/* Left: Steps Explorer Sidebar */}
                <div className="border-r border-border/40 bg-muted/5 flex flex-col justify-between select-none">
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="p-3 border-b border-border/40 bg-muted/10 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Steps Explorer</span>
                      <span className="text-[10px] font-mono font-medium bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {draft.steps.length} {draft.steps.length === 1 ? 'step' : 'steps'}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[500px]">
                      {draft.steps.map((step, idx) => {
                        const isActive = selectedStep?.id === step.id
                        const isPreRequest = step.type === "preRequest"
                        return (
                          <div
                            key={step.id}
                            onClick={() => setSelectedStepId(step.id)}
                            className={cn(
                              "group flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer transition-all border text-left",
                              isActive
                                ? "bg-primary/5 text-primary border-primary/25 font-semibold"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="font-mono text-[10px] text-muted-foreground/60 w-3.5 shrink-0 text-right">
                                {step.order}
                              </span>
                              {isPreRequest ? (
                                <span className="text-[9px] font-mono font-semibold uppercase px-1 py-0.5 rounded bg-zinc-500/10 text-zinc-500 border border-zinc-500/20 shrink-0">
                                  PreReq
                                </span>
                              ) : (
                                <span className={cn("text-[9px] font-mono font-semibold uppercase px-1 py-0.5 rounded border shrink-0", methodColors[step.method ?? "GET"] || "bg-muted text-muted-foreground border-border")}>
                                  {step.method ?? "GET"}
                                </span>
                              )}
                              <span className="text-xs truncate font-medium flex-1">
                                {step.name}
                              </span>
                            </div>
                            
                            {/* Hover Controls for reordering/deleting */}
                            <div className="hidden group-hover:flex items-center gap-0.5 pl-1.5 bg-transparent shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  moveStep(idx, "up")
                                }}
                                disabled={idx === 0}
                                className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5 rounded"
                              >
                                <ArrowUp className="size-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  moveStep(idx, "down")
                                }}
                                disabled={idx === draft.steps.length - 1}
                                className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5 rounded"
                              >
                                <ArrowDown className="size-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteStep(step.id)
                                }}
                                className="text-rose-500 hover:text-rose-700 p-0.5 rounded ml-0.5"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                      {!draft.steps.length && (
                        <div className="text-center py-8 text-xs text-muted-foreground italic px-2">
                          No steps added yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Left Sidebar Footer quick step adder buttons */}
                  <div className="p-2 border-t border-border/40 bg-muted/10 space-y-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={addHttpStep}
                      className="w-full text-[10px] h-7 justify-start gap-1 font-semibold"
                    >
                      <Plus className="size-3" /> Add HTTP Request
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={addPreRequestStep}
                      className="w-full text-[10px] h-7 justify-start gap-1 font-semibold"
                    >
                      <Plus className="size-3" /> Add Pre-Request Script
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setIsCurlModalOpen(true)}
                      className="w-full text-[10px] h-7 justify-start gap-1 font-semibold text-primary hover:bg-primary/5 cursor-pointer"
                    >
                      <Sparkles className="size-3 text-primary animate-pulse" /> Import HTTP from cURL
                    </Button>
                  </div>
                </div>

                {/* Right: Selected Step Editor Workspace */}
                <div className="flex-1 min-w-0 bg-background flex flex-col justify-between">
                  {selectedStep ? (
                    <StepCard
                      key={selectedStep.id}
                      step={selectedStep}
                      index={draft.steps.findIndex(s => s.id === selectedStep.id)}
                      totalSteps={draft.steps.length}
                      mockRun={mockRun}
                      onUpdate={(patch) => updateStep(selectedStep.id, patch)}
                      onDelete={() => deleteStep(selectedStep.id)}
                      onMoveUp={() => moveStep(draft.steps.findIndex(s => s.id === selectedStep.id), "up")}
                      onMoveDown={() => moveStep(draft.steps.findIndex(s => s.id === selectedStep.id), "down")}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 px-6 text-center h-full flex-1 min-h-[400px]">
                      <div className="rounded-full bg-muted/50 p-4 mb-3 border border-border/30">
                        <Workflow className="size-8 text-muted-foreground/60 animate-pulse" />
                      </div>
                      <h3 className="font-semibold text-sm">No steps added to this monitor</h3>
                      <p className="text-xs text-muted-foreground max-w-[280px] mt-1.5 mb-5">
                        Add request steps to run in sequence. You can configure endpoints, headers, assertions, and extract variables.
                      </p>
                      <div className="flex flex-col gap-2 w-full max-w-[320px]">
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={addHttpStep} className="flex-1 h-9 cursor-pointer">
                            <PlusCircle className="size-4 mr-1.5" /> Add HTTP Step
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={addPreRequestStep} className="flex-1 h-9 cursor-pointer">
                            <PlusCircle className="size-4 mr-1.5" /> Add Pre-Request
                          </Button>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsCurlModalOpen(true)} className="w-full h-9 gap-1.5 font-semibold text-primary cursor-pointer">
                          <Sparkles className="size-4 text-primary animate-pulse" /> Import HTTP Step from cURL command
                        </Button>
                      </div>
                    </div>
                  )}
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
                    <span className={labelClass}>Application</span>
                    <Select
                      value={draft.applicationId ? draft.applicationId : "none"}
                      onValueChange={(value) => updateDraft({ ...draft, applicationId: !value || value === "none" ? "" : value })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select application" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {applications.map((application) => (
                          <SelectItem key={application.id} value={application.id}>
                            {application.name} · CAR {application.carId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
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
                <div className="min-h-[450px] w-full rounded-md border border-border/50 overflow-hidden bg-[#1e1e1e] dark:bg-[#1e1e1e] light:bg-[#fffffe] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <Editor
                    height="450px"
                    language="json"
                    theme={editorTheme}
                    value={jsonText}
                    onChange={(val) => {
                      setJsonText(val ?? "")
                      setParseError(null)
                    }}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 12,
                      fontFamily: "var(--font-mono), monospace",
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 12, bottom: 12 },
                    }}
                  />
                </div>
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

          {builderTab === "versions" && draft.id && (
            <MonitorVersionsPanel
              monitorId={draft.id}
              published={published}
              draft={draft}
              onRollbackApplied={(monitor) => {
                setPublished(monitor)
                updateDraft(monitor)
                setPublishedVersion(monitor.publishedVersion ?? publishedVersion)
                setHasUnpublishedDraft(monitor.hasUnpublishedDraft ?? false)
                setJsonText(JSON.stringify(configFromMonitor(monitor), null, 2))
              }}
            />
          )}

          {builderTab === "copilot" && (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Left Column: AI Monitor Optimizer / Improvement suggestions */}
              <Card className="p-4 space-y-4 border border-border/80 bg-card">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <Sparkles className="size-4 text-primary animate-pulse" />
                  <h3 className="font-bold text-sm text-foreground">Pulse AI Monitor Optimizer</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get recommendations from Copilot to optimize your check coverage, performance timeouts, retries, and overall alert security.
                </p>
                <div className="space-y-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      setOptimizing(true)
                      setOptimizationSuggestions([])
                      try {
                        const res = await fetch("/api/copilot/monitor-improvement", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ monitor: draft }),
                        })
                        if (res.ok) {
                          const data = await res.json()
                          setOptimizationSuggestions(data.result.suggestions || [])
                        }
                      } catch (e) {
                        console.error(e)
                      } finally {
                        setOptimizing(false)
                      }
                    }}
                    className="w-full text-xs font-semibold gap-1 cursor-pointer"
                    disabled={optimizing}
                  >
                    {optimizing ? <RotateCw className="size-3 animate-spin" /> : <Sparkles className="size-3 text-primary animate-pulse" />}
                    Analyze Monitor Configuration
                  </Button>

                  {optimizing && (
                    <div className="flex flex-col items-center justify-center py-6 text-xs text-muted-foreground gap-2 animate-pulse">
                      <Loader2 className="size-5 animate-spin text-primary" />
                      Auditing steps, assertions, timeouts, and secrets...
                    </div>
                  )}

                  {!optimizing && optimizationSuggestions.length === 0 && (
                    <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-md bg-muted/10">
                      No analysis run yet. Click above to run AI optimizer check.
                    </div>
                  )}

                  {!optimizing && optimizationSuggestions.length > 0 && (
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {optimizationSuggestions.map((suggestion, idx) => (
                        <div key={idx} className="rounded border bg-muted/20 p-3 space-y-1.5 text-xs">
                          <div className="flex items-center gap-1.5 font-semibold text-foreground">
                            <span className={cn(
                              "text-[9px] uppercase px-1.5 py-0.5 rounded font-bold border",
                              suggestion.category === "security"
                                ? "bg-rose-500/5 text-rose-500 border-rose-500/20"
                                : suggestion.category === "assertion"
                                  ? "bg-emerald-500/5 text-emerald-500 border-emerald-500/20"
                                  : "bg-blue-500/5 text-blue-500 border-blue-500/20"
                            )}>
                              {suggestion.category}
                            </span>
                            <span>{suggestion.title}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {suggestion.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {/* Right Column: AI Prompt Monitor Builder */}
              <Card className="p-4 space-y-4 border border-border/80 bg-card">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <Code2 className="size-4 text-primary animate-pulse" />
                  <h3 className="font-bold text-sm text-foreground">Natural Language Monitor Builder</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Describe what APIs you want to test and how often, and Pulse Copilot will write a complete configuration draft.
                </p>
                <div className="space-y-3 text-xs">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Monitor Prompt / Description</label>
                    <textarea
                      value={monitorPrompt}
                      onChange={(e) => setMonitorPrompt(e.target.value)}
                      placeholder="e.g. Call https://api.mycompany.com/auth first with client credentials, extract the access_token variable from the response JSON body, then call https://api.mycompany.com/v1/profile using that token in the Authorization header. Run this check every 5 minutes."
                      className="w-full min-h-[90px] border border-border rounded p-2 text-xs bg-background focus:ring-1 focus:ring-primary focus:outline-none resize-none leading-relaxed"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!monitorPrompt.trim() || promptGenerating) return
                      setPromptGenerating(true)
                      try {
                        const res = await fetch("/api/copilot/generate-monitor", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ prompt: monitorPrompt }),
                        })
                        if (res.ok) {
                          const data = await res.json()
                          setPromptResult(data.result)
                        }
                      } catch (e) {
                        console.error(e)
                      } finally {
                        setPromptGenerating(false)
                      }
                    }}
                    className="w-full text-xs font-semibold gap-1 cursor-pointer bg-primary text-primary-foreground"
                    disabled={promptGenerating || !monitorPrompt.trim()}
                  >
                    {promptGenerating ? <RotateCw className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    Generate Draft Config
                  </Button>

                  {promptGenerating && (
                    <div className="flex flex-col items-center justify-center py-6 text-xs text-muted-foreground gap-2 animate-pulse">
                      <Loader2 className="size-5 animate-spin text-primary" />
                      Analyzing requirements and composing monitor layout...
                    </div>
                  )}

                  {promptResult && (
                    <div className="space-y-3 animate-in fade-in duration-200">
                      <div className="rounded border bg-muted/30 p-2.5 space-y-2">
                        <div className="flex justify-between items-center border-b border-border/40 pb-1.5">
                          <span className="font-semibold text-foreground">{promptResult.name || "Draft Monitor"}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{promptResult.cron}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{promptResult.description}</p>
                        <div className="space-y-1">
                          <span className="font-bold text-[9px] uppercase tracking-wider text-muted-foreground">Steps to Create:</span>
                          <div className="space-y-1">
                            {promptResult.steps?.map((step: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between text-[11px] bg-background/50 border rounded px-2 py-1 text-muted-foreground font-medium">
                                <span className="truncate">{step.name}</span>
                                <span className="font-mono font-bold text-[9px] text-primary">{step.method}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => {
                          // Apply the generated draft to current state
                          const nextSteps = (promptResult.steps || []).map((s: any, idx: number) => ({
                            id: `step-${crypto.randomUUID()}`,
                            order: idx + 1,
                            name: s.name || `Step ${idx + 1}: HTTP Request`,
                            type: "http",
                            method: s.method || "GET",
                            url: s.url || "https://",
                            timeoutMs: s.timeoutMs || 10000,
                            retryCount: s.retryCount || 0,
                            continueOnFailure: s.continueOnFailure || false,
                            assertions: (s.assertions || []).map((a: any) => ({
                              id: `assert-${crypto.randomUUID()}`,
                              type: a.type || "statusCode",
                              label: a.label || "Check status",
                              target: a.target || "status",
                              operator: a.operator || "equals",
                              expected: String(a.expected || "200"),
                            })),
                            extractors: (s.extractors || []).map((e: any) => ({
                              id: `extract-${crypto.randomUUID()}`,
                              variableName: e.variableName,
                              type: e.type || "jsonPath",
                              source: e.source || "responseBody",
                              target: e.target,
                            })),
                            preRequestScript: "",
                            config: { headers: {}, body: "" },
                          }))

                          updateDraft({
                            ...draft,
                            name: promptResult.name || draft.name,
                            description: promptResult.description || draft.description,
                            cron: promptResult.cron || draft.cron,
                            timeoutMs: promptResult.timeoutMs || draft.timeoutMs,
                            retryCount: promptResult.retryCount || draft.retryCount,
                            failureThreshold: promptResult.failureThreshold || draft.failureThreshold,
                            steps: nextSteps,
                          })

                          if (nextSteps.length > 0) {
                            setSelectedStepId(nextSteps[0].id)
                          }

                          // Redirect back to steps tab
                          setBuilderTab("steps")
                          setPromptResult(null)
                          setMonitorPrompt("")
                        }}
                        className="w-full text-xs font-semibold gap-1 cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Apply Draft Config to Builder
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </div>
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

        {/* Test Execution Console Dialog */}
        <Dialog open={isConsoleOpen} onOpenChange={setIsConsoleOpen}>
          <DialogContent className="min-w-[80vw] w-full max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
            {/* Modal Header */}
            <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <TerminalSquare className="size-5 text-primary" />
                  <div>
                    <DialogTitle className="text-sm font-bold tracking-tight">Test Execution Console</DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                      Live dry-run of the current monitor draft — nothing is saved to history.
                    </DialogDescription>
                  </div>
                  {mockRun && (
                    <div className="flex items-center gap-2 ml-2">
                      <span className={cn(
                        "text-[11px] font-bold px-2.5 py-1 rounded-full border",
                        mockRun.status === "success"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
                          : "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400"
                      )}>
                        {mockRun.status === "success" ? "✓ All Passed" : "✗ Failed"}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border/30">
                        {mockRun.durationMs}ms total
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </DialogHeader>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              {executionState === "running" && (
                <div className="text-muted-foreground flex items-center gap-3 text-sm py-16 justify-center font-medium bg-muted/5 rounded-xl border border-border/20">
                  <RotateCw className="size-5 animate-spin text-primary" />
                  Executing monitor draft steps live...
                </div>
              )}

              {executionError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300 flex items-start gap-2">
                  <XCircle className="size-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Test failed: </span>
                    {executionError}
                    {executionError.includes("PULSE_API_BASE_URL") ? null : (
                      <p className="mt-2 text-xs text-rose-600/90 dark:text-rose-400/90">
                        Ensure `PULSE_API_BASE_URL` is set in `apps/web/.env.local` and the Go API is running.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {mockRun && (
                <div className="space-y-6">
                  {mockRun.failureReason && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300 flex items-start gap-2">
                      <XCircle className="size-4 shrink-0 mt-0.5" />
                      <div><span className="font-semibold">Run Failed: </span>{mockRun.failureReason}</div>
                    </div>
                  )}

                  {mockRun.steps.map((step, idx) => {
                    const method = step.requestSummary?.split(" ")[0]
                    const url = step.requestSummary?.includes(" ")
                      ? step.requestSummary.substring(step.requestSummary.indexOf(" ") + 1)
                      : step.requestSummary
                    const isHttp = step.type === "http"

                    // Try to pretty-print the response body
                    let prettyBody = step.responseBody || step.responseSummary || ""
                    try {
                      if (prettyBody && prettyBody.trim().startsWith("{") || prettyBody?.trim().startsWith("[")) {
                        prettyBody = JSON.stringify(JSON.parse(prettyBody), null, 2)
                      }
                    } catch {}

                    let prettyRequestBody = step.requestBody || ""
                    try {
                      if (prettyRequestBody && prettyRequestBody.trim().startsWith("{")) {
                        prettyRequestBody = JSON.stringify(JSON.parse(prettyRequestBody), null, 2)
                      }
                    } catch {}

                    return (
                      <div key={step.id} className="rounded-xl bg-card border border-border/40 shadow-sm overflow-hidden">
                        {/* Step Header */}
                        <div className={cn(
                          "flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-border/30",
                          step.status === "success" ? "bg-emerald-500/5" : "bg-rose-500/5"
                        )}>
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-[10px] font-semibold text-muted-foreground bg-muted/80 px-2 py-0.5 rounded border border-border/20 shrink-0">
                              Step {idx + 1}
                            </span>
                            {isHttp && method ? (
                              <span className={cn(
                                "text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border shrink-0",
                                methodColors[method] || "bg-muted text-muted-foreground border-border"
                              )}>
                                {method}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-zinc-500/10 text-zinc-500 border border-zinc-500/20 shrink-0">
                                PRE-REQ
                              </span>
                            )}
                            <span className="font-semibold text-sm text-foreground truncate">{step.stepName}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {step.statusCode !== undefined && step.statusCode > 0 && (
                              <span className={cn(
                                "font-mono text-xs font-bold px-2 py-0.5 rounded border",
                                step.statusCode >= 200 && step.statusCode < 300
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  : step.statusCode >= 400
                                    ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                    : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                              )}>
                                HTTP {step.statusCode}
                              </span>
                            )}
                            <div className="flex items-center gap-1 text-muted-foreground text-[11px] font-mono">
                              <Clock className="size-3 text-muted-foreground/60" />
                              <span>{step.latencyMs}ms</span>
                            </div>
                            <StatusPill status={step.status} />
                          </div>
                        </div>

                        {/* Step Body */}
                        <div className="p-5 space-y-5">
                          {/* URL */}
                          {isHttp && url && (
                            <div className="flex items-center gap-2 bg-muted/30 px-3 py-2 rounded-lg border border-border/20">
                              <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider shrink-0">URL</span>
                              <span className="font-mono text-xs text-foreground select-all break-all">{url}</span>
                            </div>
                          )}

                          {/* Error */}
                          {step.errorMessage && (
                            <div className="rounded-lg border border-rose-200 bg-rose-50/50 px-4 py-3 text-sm text-rose-700 dark:border-rose-950 dark:bg-rose-950/20 dark:text-rose-300 flex gap-2 items-start">
                              <XCircle className="size-4 shrink-0 mt-0.5" />
                              <div><span className="font-bold">Error: </span>{step.errorMessage}</div>
                            </div>
                          )}


                          {/* Main Content Grid — 2 cols only when there is request data to show */}
                          {(() => {
                            const hasRequestDetails = isHttp && (
                              (step.requestHeaders && Object.keys(step.requestHeaders).length > 0) ||
                              !!prettyRequestBody
                            )
                            return (
                              <div className={cn("gap-5", hasRequestDetails ? "grid grid-cols-1 lg:grid-cols-2" : "flex flex-col")}>
                                {/* LEFT: Request Details — only when there's something to show */}
                                {hasRequestDetails && (
                                  <div className="space-y-4">
                                    {/* Request Headers */}
                                    {step.requestHeaders && Object.keys(step.requestHeaders).length > 0 && (
                                      <div className="space-y-1.5">
                                        <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                                          <Code2 className="size-3" />
                                          Request Headers
                                        </div>
                                        <div className="rounded-lg border border-border/30 overflow-hidden">
                                          {Object.entries(step.requestHeaders).map(([key, value], i) => (
                                            <div key={key} className={cn("grid grid-cols-[180px_1fr] text-[11px]", i % 2 === 0 ? "bg-muted/20" : "bg-transparent")}>
                                              <div className="font-mono font-semibold text-muted-foreground px-3 py-1.5 border-r border-border/20 truncate">{key}</div>
                                              <div className="font-mono text-foreground/80 px-3 py-1.5 break-all">{value}</div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Request Body */}
                                    {prettyRequestBody && (
                                      <div className="space-y-1.5">
                                        <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                                          <FileJson className="size-3" />
                                          Request Body
                                        </div>
                                        <pre className="text-[11px] font-mono bg-zinc-950 text-zinc-200 p-3 rounded-lg border border-zinc-800 max-h-52 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed select-all">
                                          {prettyRequestBody}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                )}


                            {/* RIGHT: Response Details */}
                            <div className="space-y-4">
                              {/* Response Body */}
                              {(step.responseBody || step.responseSummary) && (
                                <div className="space-y-1.5">
                                  <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                                    <FileJson className="size-3" />
                                    Response Body
                                  </div>
                                  <pre className="text-[11px] font-mono bg-zinc-950 text-zinc-200 p-3 rounded-lg border border-zinc-800 max-h-64 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed select-all">
                                    {prettyBody}
                                  </pre>
                                </div>
                              )}

                              {/* Response Headers */}
                              {step.responseHeaders && Object.keys(step.responseHeaders).length > 0 && (
                                <div className="space-y-1.5">
                                  <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                                    <Code2 className="size-3" />
                                    Response Headers
                                  </div>
                                  <div className="rounded-lg border border-border/30 overflow-hidden max-h-52 overflow-y-auto">
                                    {Object.entries(step.responseHeaders).map(([key, value], i) => (
                                      <div key={key} className={cn("grid grid-cols-[200px_1fr] text-[11px]", i % 2 === 0 ? "bg-muted/20" : "bg-transparent")}>
                                        <div className="font-mono font-semibold text-muted-foreground px-3 py-1.5 border-r border-border/20 truncate">{key}</div>
                                        <div className="font-mono text-foreground/80 px-3 py-1.5 break-all">{value}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            </div>
                            )
                          })()}

                          {/* Full-Width Bottom: Assertions, Extracted Vars, Console */}
                          <div className="space-y-4">
                            {/* Assertions */}
                            {step.assertions && step.assertions.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                                  <ShieldCheck className="size-3" />
                                  Assertions ({step.assertions.length})
                                </div>
                                <div className="rounded-lg border border-border/30 overflow-hidden">
                                  {step.assertions.map((assertion, aIdx) => {
                                    const failed = checkAssertionFailed(assertion)
                                    return (
                                      <div key={assertion.id} className={cn(
                                        "grid grid-cols-[1fr_auto_auto] text-[11px] border-b last:border-b-0 border-border/20 px-3 py-2 gap-3 items-center",
                                        aIdx % 2 === 0 ? "bg-muted/10" : "bg-transparent",
                                        failed ? "border-l-2 border-l-rose-500" : "border-l-2 border-l-emerald-500"
                                      )}>
                                        <div className="flex items-center gap-2 min-w-0 font-mono">
                                          <span className="text-primary font-bold uppercase text-[9px] shrink-0">{assertion.type}</span>
                                          <span className="text-muted-foreground truncate">{assertion.target || "body"}</span>
                                          <span className="text-[9px] font-semibold text-muted-foreground/70 uppercase shrink-0">{assertion.operator}</span>
                                          <span className="bg-muted px-1 rounded text-foreground/80 shrink-0">{assertion.expected || "(empty)"}</span>
                                          {assertion.actual !== undefined && (
                                            <>
                                              <span className="text-muted-foreground/40 shrink-0">→ got:</span>
                                              <span className={cn("shrink-0 px-1 rounded", failed ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600")}>{assertion.actual}</span>
                                            </>
                                          )}
                                        </div>
                                        <span className={cn("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", failed ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600")}>
                                          {failed ? "Failed" : "Passed"}
                                        </span>
                                        {failed ? <XCircle className="size-4 text-rose-500 shrink-0" /> : <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Extracted Variables */}
                            {step.extractedVars && Object.keys(step.extractedVars).length > 0 && (
                              <div className="space-y-2">
                                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                                  <KeyRound className="size-3" />
                                  Extracted Variables ({Object.keys(step.extractedVars).length})
                                </div>
                                <div className="rounded-lg border border-border/30 overflow-hidden">
                                  {Object.entries(step.extractedVars).map(([varName, varValue], i) => (
                                    <div key={varName} className={cn("grid grid-cols-[200px_1fr] text-[11px] border-b last:border-b-0 border-border/20", i % 2 === 0 ? "bg-muted/10" : "bg-transparent")}>
                                      <div className="font-mono font-semibold text-primary px-3 py-1.5 border-r border-border/20 truncate">
                                        {"{{variables."}{varName}{"}}"}
                                      </div>
                                      <div className={cn("font-mono px-3 py-1.5 break-all", varValue === "********" ? "text-muted-foreground italic" : "text-foreground/80")}>
                                        {varValue || "(empty)"}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Console Output */}
                            {step.consoleOutput && step.consoleOutput.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                                  <Terminal className="size-3" />
                                  Console Output ({step.consoleOutput.length} lines)
                                </div>
                                <div className="bg-zinc-950 rounded-lg px-4 py-3 text-[11px] font-mono text-zinc-300 space-y-1 max-h-48 overflow-auto border border-zinc-800">
                                  {step.consoleOutput.map((line, i) => (
                                    <div key={i} className="flex gap-2.5">
                                      <span className="text-zinc-600 select-none shrink-0">{`>`}</span>
                                      <span className="break-all">{line}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Secret Safety Alert Dialog */}
        <AlertDialog open={isSafetyModalOpen} onOpenChange={setIsSafetyModalOpen}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base font-bold flex items-center gap-2 text-amber-600 dark:text-amber-500">
                <AlertTriangle className="size-5" />
                Security Check: Hardcoded Secrets
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs">
                Pulse Copilot detected potential raw secrets or API keys in your monitor steps. Storing secrets in plain text is not recommended.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 py-2 max-h-48 overflow-y-auto text-xs">
              {safetyWarnings?.map((warning, idx) => (
                <div key={idx} className="rounded border bg-muted/40 p-2 space-y-1">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-foreground">{warning.stepName}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">{warning.location} ({warning.key})</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{warning.recommendation}</p>
                </div>
              ))}
            </div>
            <AlertDialogFooter className="border-t border-border/20 pt-3">
              <AlertDialogCancel className="h-9 text-xs cursor-pointer" onClick={() => setIsSafetyModalOpen(false)}>
                Cancel & Edit
              </AlertDialogCancel>
              <AlertDialogAction
                className="h-9 text-xs bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                onClick={async () => {
                  setIsSafetyModalOpen(false)
                  await saveDraft()
                }}
              >
                Save Anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <MonitorImportExportDialog
          open={isImportExportOpen}
          onOpenChange={setIsImportExportOpen}
          mode="builder"
          applications={applications}
          monitors={[draft]}
          applicationId={draft.applicationId}
          onApplyMonitor={(monitor) => {
            updateDraft({
              ...draft,
              ...monitor,
              id: draft.id,
              steps: monitor.steps.map((step, index) => ({
                ...step,
                order: index + 1,
              })),
            })
            if (monitor.steps[0]) setSelectedStepId(monitor.steps[0].id)
            setBuilderTab("steps")
          }}
          onApplySteps={(steps, replace) => {
            const merged = replace
              ? steps.map((step, index) => ({ ...step, order: index + 1 }))
              : [
                  ...draft.steps,
                  ...steps.map((step, index) => ({
                    ...step,
                    order: draft.steps.length + index + 1,
                  })),
                ]
            updateDraft({ ...draft, steps: merged })
            if (merged[0]) setSelectedStepId(merged[merged.length - 1]?.id ?? merged[0].id)
            setBuilderTab("steps")
          }}
        />

        {/* cURL Import Dialog */}
        <Dialog open={isCurlModalOpen} onOpenChange={setIsCurlModalOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Sparkles className="size-4 text-primary animate-pulse" />
                Import HTTP Step from cURL
              </DialogTitle>
              <DialogDescription className="text-xs">
                Paste a standard shell cURL command (e.g. headers, POST body, query strings) and Pulse Copilot will parse it into step settings.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">cURL Command</label>
                <textarea
                  value={curlInput}
                  onChange={(e) => setCurlInput(e.target.value)}
                  placeholder='curl -X POST "https://api.example.com/v1/users" -H "Content-Type: application/json" -d "{\"name\": \"Alice\"}"'
                  className="w-full h-32 border border-border rounded p-2 text-xs font-mono bg-background focus:ring-1 focus:ring-primary focus:outline-none resize-none leading-relaxed"
                />
              </div>

              {curlConverting && (
                <div className="flex flex-col items-center justify-center py-4 text-muted-foreground text-xs gap-2">
                  <Loader2 className="size-5 animate-spin text-primary" />
                  <span>Copilot is parsing syntax, headers, and credentials...</span>
                </div>
              )}

              {curlResult && (
                <div className="space-y-3 rounded bg-muted/40 p-3 border border-border/40 max-h-40 overflow-y-auto font-mono text-[10px]">
                  <div className="flex justify-between font-bold border-b border-border/40 pb-1.5 mb-1.5">
                    <span className="text-foreground">{curlResult.name}</span>
                    <span className="text-primary">{curlResult.method}</span>
                  </div>
                  <div className="text-muted-foreground truncate">URL: {curlResult.url}</div>
                  {curlResult.warnings && curlResult.warnings.length > 0 && (
                    <div className="mt-2 p-2 rounded bg-rose-500/5 text-rose-500 border border-rose-500/10 font-sans leading-normal">
                      <span className="font-bold flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="size-3 text-rose-500" />
                        Security Warnings:
                      </span>
                      <ul className="list-disc pl-4 space-y-1">
                        {curlResult.warnings.map((w: string, i: number) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="border-t border-border/20 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsCurlModalOpen(false)
                  setCurlInput("")
                  setCurlResult(null)
                }}
                className="h-9 text-xs cursor-pointer"
                disabled={curlConverting}
              >
                Cancel
              </Button>
              {!curlResult ? (
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!curlInput.trim() || curlConverting) return
                    setCurlConverting(true)
                    setCurlResult(null)
                    try {
                      const res = await fetch("/api/copilot/curl-convert", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ curlCommand: curlInput }),
                      })
                      if (res.ok) {
                        const data = await res.json()
                        setCurlResult(data.result)
                      }
                    } catch (e) {
                      console.error(e)
                    } finally {
                      setCurlConverting(false)
                    }
                  }}
                  className="h-9 text-xs bg-primary text-primary-foreground cursor-pointer gap-1.5"
                  disabled={curlConverting || !curlInput.trim()}
                >
                  <Sparkles className="size-3.5" /> Convert to Step
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={importCurlStep}
                  className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  Import Step Configuration
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  )
}
