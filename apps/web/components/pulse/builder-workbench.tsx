"use client"

import { useEffect, useMemo, useRef, useState, type ComponentProps, type ComponentType } from "react"
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
  Cookie,
  FileKey,
  Globe,
  Settings,
  Braces,
  ListFilter,
  Hash,
} from "lucide-react"

import { MonitorImportExportDialog } from "./monitor-import-export-dialog"
import { MonitorVersionsPanel } from "./monitor-versions-panel"
import { ScriptEditor } from "./script-editor"
import { SyntheticStepEditor } from "./synthetic-step-editor"
import { buildTemplateSuggestions, type TemplateSuggestion } from "./template-intelligence"
import Editor from "@monaco-editor/react"
import { useTheme } from "next-themes"
import type { Application, CertificateProfile, Monitor, MonitorRun, MonitorStatus, MonitorStep, PulseAssertion, PulseExtractor, PreRequestAction } from "@/lib/pulse-types"
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Chip,
  Description,
  EmptyState,
  Input,
  Label,
  ListBox,
  Modal,
  AlertDialog,
  Select,
  Tabs,
  TextArea,
  TextField,
} from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"

interface BuilderWorkbenchProps {
  monitor: Monitor
  applications?: Application[]
  certificateProfiles?: CertificateProfile[]
}

type ExecutionState = "idle" | "running" | "complete"
type SaveState = "idle" | "saving" | "saved" | "error"

function BuilderInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input variant="secondary" fullWidth className={cn("min-h-9", className)} {...props} />
}

function BuilderTextArea({ className, ...props }: ComponentProps<typeof TextArea>) {
  return <TextArea variant="secondary" fullWidth className={cn(className)} {...props} />
}

const builderControlClass = "h-9 text-xs"

function BuilderField({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <TextField className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}>
      <Label className="text-xs font-medium text-muted">{label}</Label>
      {children}
    </TextField>
  )
}

function BuilderSelect({
  label,
  ariaLabel,
  selectedKey,
  onSelectionChange,
  className,
  children,
}: {
  label?: string
  ariaLabel: string
  selectedKey: string
  onSelectionChange: (key: string) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <Select
      aria-label={ariaLabel}
      className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}
      variant="secondary"
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        if (key != null) onSelectionChange(String(key))
      }}
    >
      {label ? <Label className="text-xs font-medium text-muted">{label}</Label> : null}
      <Select.Trigger className={cn("w-full", builderControlClass)}>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>{children}</Select.Popover>
    </Select>
  )
}

function BuilderCheckboxField({
  label,
  ariaLabel,
  isSelected,
  onChange,
  className,
}: {
  label: string
  ariaLabel: string
  isSelected: boolean
  onChange: (checked: boolean) => void
  className?: string
}) {
  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}>
      <Label className="text-xs font-medium text-muted">{label}</Label>
      <div className={cn("flex items-center", builderControlClass)}>
        <Checkbox isSelected={isSelected} onChange={onChange} aria-label={ariaLabel}>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
        </Checkbox>
      </div>
    </div>
  )
}

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
    if (["dns", "tcp", "tls"].includes(step.type)) {
      const host = String(step.config?.host || step.url || "").trim()
      if (!host) errors.push(`Step ${index + 1} needs a host.`)
    }
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

function normalizeStepOrder(steps: MonitorStep[]) {
  return steps.map((step, index) => ({
    ...step,
    order: index + 1,
  }))
}

function queryParamsFromUrl(url: string | undefined) {
  const raw = url ?? ""
  const queryStart = raw.indexOf("?")
  if (queryStart === -1) return []
  const hashStart = raw.indexOf("#", queryStart)
  const query = raw.slice(queryStart + 1, hashStart === -1 ? raw.length : hashStart)
  if (!query) return []

  return query
    .split("&")
    .filter(Boolean)
    .map((part) => {
      const [rawKey = "", ...rest] = part.split("=")
      return {
        key: decodeParamPart(rawKey),
        value: decodeParamPart(rest.join("=")),
      }
    })
}

function urlWithQueryParams(url: string | undefined, params: Array<{ key: string; value: string }>) {
  const raw = url ?? ""
  const hashStart = raw.indexOf("#")
  const hash = hashStart === -1 ? "" : raw.slice(hashStart)
  const withoutHash = hashStart === -1 ? raw : raw.slice(0, hashStart)
  const queryStart = withoutHash.indexOf("?")
  const base = queryStart === -1 ? withoutHash : withoutHash.slice(0, queryStart)
  const query = params
    .filter((param) => param.key.trim())
    .map((param) => `${encodeParamPart(param.key.trim())}=${encodeParamPart(param.value)}`)
    .join("&")
  return `${base}${query ? `?${query}` : ""}${hash}`
}

function decodeParamPart(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "))
  } catch {
    return value
  }
}

function encodeParamPart(value: string) {
  return encodeURIComponent(value)
    .replace(/%7B/g, "{")
    .replace(/%7D/g, "}")
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
    <Card>
      <Card.Header className="gap-1.5 pb-4">
        <Card.Title className="flex items-center gap-2 text-base font-semibold">
          <Icon className="size-4 text-accent" />
          {title}
        </Card.Title>
      </Card.Header>
      <Card.Content className="gap-4">{children}</Card.Content>
    </Card>
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
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{parseError}</Alert.Description>
        </Alert.Content>
      </Alert>
    )
  }

  if (errors.length) {
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{errors.join(" ")}</Alert.Description>
        </Alert.Content>
      </Alert>
    )
  }

  return (
    <Alert status="success">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>Config is valid for local execution.</Alert.Description>
      </Alert.Content>
    </Alert>
  )
}

interface StepCardProps {
  step: MonitorStep
  index: number
  totalSteps: number
  mockRun: MonitorRun | null
  suggestions: TemplateSuggestion[]
  certificateProfiles: CertificateProfile[]
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

const methodChipFallback = "bg-muted/10 text-muted-foreground border-border/40"

function defaultHttpConfig(): NonNullable<MonitorStep["config"]> {
  return {
    headers: {},
    body: "",
    auth: { type: "noAuth" as const },
    cookies: { enabled: true, mode: "jar" as const, manual: [] },
    mtls: { mode: "global" as const, enabled: false, insecureSkipVerify: false },
    proxy: { enabled: false },
  }
}

function TemplateInput({
  value,
  onChange,
  suggestions,
  className,
  containerClassName,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  suggestions: TemplateSuggestion[]
  className?: string
  containerClassName?: string
  placeholder?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [activeRange, setActiveRange] = useState<{ start: number; end: number; query: string } | null>(null)

  const visibleSuggestions = useMemo(() => {
    if (!activeRange) return []
    const query = normalizeTemplateQuery(activeRange.query)
    return suggestions
      .filter((suggestion) => suggestionMatchesQuery(suggestion, query))
      .slice(0, 8)
  }, [activeRange, suggestions])

  function updateTemplateContext(nextValue: string, caret: number | null) {
    if (caret === null) {
      setActiveRange(null)
      return
    }
    const beforeCaret = nextValue.slice(0, caret)
    const start = beforeCaret.lastIndexOf("{{")
    if (start === -1) {
      setActiveRange(null)
      return
    }
    const closedAfterStart = beforeCaret.indexOf("}}", start)
    if (closedAfterStart !== -1) {
      setActiveRange(null)
      return
    }
    setActiveRange({ start, end: caret, query: nextValue.slice(start + 2, caret) })
  }

  function insertSuggestion(suggestion: TemplateSuggestion) {
    if (!activeRange) return
    const nextValue = `${value.slice(0, activeRange.start)}${suggestion.token}${value.slice(activeRange.end)}`
    onChange(nextValue)
    setActiveRange(null)
    window.requestAnimationFrame(() => {
      const nextCursor = activeRange.start + suggestion.token.length
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  return (
    <div className={cn("relative min-w-0 flex-1", containerClassName)}>
      <Input
        ref={inputRef}
        variant="secondary"
        fullWidth
        placeholder={placeholder}
        className={cn("min-h-9 font-mono text-xs", className)}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          updateTemplateContext(event.target.value, event.target.selectionStart)
        }}
        onClick={(event) => updateTemplateContext(event.currentTarget.value, event.currentTarget.selectionStart)}
        onKeyUp={(event) => updateTemplateContext(event.currentTarget.value, event.currentTarget.selectionStart)}
        onBlur={() => window.setTimeout(() => setActiveRange(null), 120)}
      />
      {visibleSuggestions.length > 0 ? (
        <Card className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-64 overflow-auto shadow-lg">
          <Card.Content className="gap-0.5 p-1">
            <ListBox
              aria-label="Template suggestions"
              onAction={(key) => {
                const suggestion = visibleSuggestions.find((item) => `${item.kind}-${item.key}` === key)
                if (suggestion) insertSuggestion(suggestion)
              }}
            >
              {visibleSuggestions.map((suggestion) => (
                <ListBox.Item
                  key={`${suggestion.kind}-${suggestion.key}`}
                  id={`${suggestion.kind}-${suggestion.key}`}
                  textValue={suggestion.token}
                  className="rounded-md px-2 py-1.5 text-xs"
                >
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-mono font-semibold text-foreground">{suggestion.token}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{suggestion.detail}</span>
                    </span>
                    <Chip size="sm" variant="soft" className="shrink-0 text-[9px] uppercase">
                      <Chip.Label>{suggestion.kind}</Chip.Label>
                    </Chip>
                  </div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Card.Content>
        </Card>
      ) : null}
    </div>
  )
}

function BuilderTemplateField({
  label,
  className,
  containerClassName,
  inputClassName,
  ...templateProps
}: {
  label: string
  className?: string
  containerClassName?: string
  inputClassName?: string
} & Omit<ComponentProps<typeof TemplateInput>, "className" | "containerClassName">) {
  return (
    <BuilderField label={label} className={className}>
      <TemplateInput
        containerClassName={containerClassName}
        className={cn("font-mono text-xs", inputClassName)}
        {...templateProps}
      />
    </BuilderField>
  )
}

function TemplateBodyEditor({
  value,
  onChange,
  theme,
  suggestions,
}: {
  value: string
  onChange: (value: string) => void
  theme: string
  suggestions: TemplateSuggestion[]
}) {
  const suggestionsRef = useRef(suggestions)
  const providerRef = useRef<{ dispose: () => void } | null>(null)
  suggestionsRef.current = suggestions

  useEffect(() => {
    return () => providerRef.current?.dispose()
  }, [])

  return (
    <Editor
      height="180px"
      language="json"
      theme={theme}
      value={value}
      onChange={(val) => onChange(val ?? "")}
      onMount={(_editor, monaco) => {
        providerRef.current?.dispose()
        providerRef.current = monaco.languages.registerCompletionItemProvider("json", {
          triggerCharacters: ["{"],
          provideCompletionItems: (model: any, position: any) => templateCompletionItems(monaco, model, position, suggestionsRef.current),
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
  )
}

function templateCompletionItems(monaco: any, model: any, position: any, suggestions: TemplateSuggestion[]) {
  const lineUntilCursor = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  })
  const templateMatch = lineUntilCursor.match(/\{\{[^}]*$/)
  if (!templateMatch) return { suggestions: [] }
  const range = new monaco.Range(position.lineNumber, position.column - templateMatch[0].length, position.lineNumber, position.column)

  return {
    suggestions: suggestions
      .filter((suggestion) => suggestionMatchesQuery(suggestion, normalizeTemplateQuery(templateMatch[0].slice(2))))
      .map((suggestion) => ({
      label: suggestion.label,
      kind: suggestion.kind === "secret" ? monaco.languages.CompletionItemKind.Value : monaco.languages.CompletionItemKind.Variable,
      detail: suggestion.detail,
      documentation: suggestion.scriptAccessor,
      insertText: suggestion.token,
      range,
    })),
  }
}

function normalizeTemplateQuery(query: string) {
  return query
    .replace(/^\{\{/, "")
    .replace(/^variables\./, "")
    .replace(/^secrets\./, "")
    .replace(/[}\s]/g, "")
    .toLowerCase()
}

function suggestionMatchesQuery(suggestion: TemplateSuggestion, query: string) {
  if (!query) return true
  return (
    suggestion.key.toLowerCase().includes(query) ||
    suggestion.label.toLowerCase().includes(query) ||
    suggestion.token.toLowerCase().includes(query)
  )
}

function StepCard({ step, index, totalSteps, mockRun, suggestions, certificateProfiles, onUpdate, onDelete, onMoveUp, onMoveDown }: StepCardProps) {
  const { resolvedTheme } = useTheme()
  const editorTheme = resolvedTheme === "light" ? "light" : "vs-dark"
  // Tabs State
  const [activeTab, setActiveTab] = useState<"params" | "auth" | "headers" | "body" | "cookies" | "certificates" | "proxy" | "scripts" | "tests" | "settings">("params")

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
    setLocalHeaders(nextHeaders)
  }, [step.id])

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

  // Query Params Local Form State
  const [localParams, setLocalParams] = useState<{ key: string; value: string }[]>(() => queryParamsFromUrl(step.url))

  useEffect(() => {
    const nextParams = queryParamsFromUrl(step.url)
    setLocalParams(nextParams)
  }, [step.id])

  const updateLocalParam = (idx: number, field: "key" | "value", val: string) => {
    const next = [...localParams]
    const item = next[idx]
    if (!item) return
    item[field] = val
    setLocalParams(next)
    onUpdate({ url: urlWithQueryParams(step.url, next) })
  }

  const addLocalParam = () => {
    setLocalParams([...localParams, { key: "", value: "" }])
  }

  const removeLocalParam = (idx: number) => {
    const next = localParams.filter((_, i) => i !== idx)
    setLocalParams(next)
    onUpdate({ url: urlWithQueryParams(step.url, next) })
  }

  const authConfig = step.config?.auth ?? { type: "noAuth" as const }
  const cookieConfig = step.config?.cookies ?? { enabled: true, mode: "jar" as const, manual: [] }
  const manualCookies = cookieConfig.manual ?? []
  const mtlsConfig = step.config?.mtls ?? { mode: "global" as const, enabled: false, insecureSkipVerify: false }
  const proxyConfig = step.config?.proxy ?? { enabled: false }

  const updateAuthConfig = (patch: Record<string, any>) => {
    onUpdate({
      config: {
        ...step.config,
        auth: {
          ...authConfig,
          ...patch,
        },
      },
    })
  }

  const updateCookieConfig = (patch: Record<string, any>) => {
    onUpdate({
      config: {
        ...step.config,
        cookies: {
          ...cookieConfig,
          ...patch,
        },
      },
    })
  }

  const updateManualCookie = (idx: number, field: "name" | "value" | "domain" | "path", value: string) => {
    const next = [...manualCookies]
    const item = next[idx]
    if (!item) return
    next[idx] = { ...item, [field]: value }
    updateCookieConfig({ manual: next })
  }

  const addManualCookie = () => {
    updateCookieConfig({ manual: [...manualCookies, { name: "", value: "", domain: "", path: "/" }] })
  }

  const removeManualCookie = (idx: number) => {
    updateCookieConfig({ manual: manualCookies.filter((_, i) => i !== idx) })
  }

  const updateMTLSConfig = (patch: Record<string, any>) => {
    onUpdate({
      config: {
        ...step.config,
        mtls: {
          ...mtlsConfig,
          ...patch,
        },
      },
    })
  }

  const updateProxyConfig = (patch: Record<string, any>) => {
    onUpdate({
      config: {
        ...step.config,
        proxy: {
          ...proxyConfig,
          ...patch,
        },
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
          <span className="text-xs font-semibold text-muted-foreground">Step Editor</span>
          <span className="text-muted-foreground text-xs">·</span>
          <span className="font-mono text-xs font-semibold text-primary">{step.name}</span>
        </div>
        <Chip size="sm" variant="soft" className="font-mono text-[10px]">
          <Chip.Label>
            {step.type === "http"
              ? "HTTP Request"
              : step.type === "preRequest"
                ? "Pre-request Action"
                : step.type === "dns"
                  ? "DNS resolve"
                  : step.type === "tcp"
                    ? "TCP connect"
                    : step.type === "tls"
                      ? "TLS certificate"
                      : step.type === "delay"
                        ? "Delay"
                        : step.type}
          </Chip.Label>
        </Chip>
      </div>

      {/* Step Settings (Name, Timeout, Retry) */}
      {step.type !== "http" && (
        <Card variant="secondary" className="p-3">
          <Card.Content className="grid grid-cols-1 items-end gap-3 p-0 md:grid-cols-3">
            <BuilderField label="Step name">
              <BuilderInput value={step.name} onChange={(event) => onUpdate({ name: event.target.value })} />
            </BuilderField>
            <BuilderField label="Timeout (ms)">
              <BuilderInput
                type="number"
                min={100}
                value={String(step.timeoutMs)}
                onChange={(event) => onUpdate({ timeoutMs: Number(event.target.value) })}
              />
            </BuilderField>
            <BuilderField label="Retry count">
              <BuilderInput
                type="number"
                min={0}
                value={String(step.retryCount)}
                onChange={(event) => onUpdate({ retryCount: Number(event.target.value) })}
              />
            </BuilderField>
          </Card.Content>
        </Card>
      )}

      {/* HTTP Config */}
      {step.type === "http" && (
        <div className="space-y-4">
          <BuilderField label="Request URL">
            <div className="flex items-stretch overflow-hidden">
              <BuilderSelect
                ariaLabel="Request method"
                selectedKey={step.method ?? "GET"}
                onSelectionChange={(method) => onUpdate({ method })}
                className="w-[112px] shrink-0 [&_.select__trigger]:rounded-r-none"
              >
                <ListBox>
                  {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => (
                    <ListBox.Item key={method} id={method} textValue={method}>
                      {method}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </BuilderSelect>
              <TemplateInput
                containerClassName="min-w-0 flex-1"
                className="rounded-l-none"
                value={step.url ?? ""}
                placeholder="https://{{variables.baseUrl}}/health"
                onChange={(value) => onUpdate({ url: value })}
                suggestions={suggestions}
              />
            </div>
          </BuilderField>

          <Tabs
            selectedKey={activeTab}
            onSelectionChange={(key) => {
              if (key != null) setActiveTab(String(key) as typeof activeTab)
            }}
            variant="secondary"
            className="w-full gap-4"
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="Step editor sections" className="w-full overflow-x-auto">
                {(
                  [
                    { key: "params", label: "Params", icon: ListFilter, count: localParams.filter((param) => param.key.trim()).length },
                    { key: "auth", label: "Authorization", icon: KeyRound, hasIndicator: (step.config?.auth?.type ?? "noAuth") !== "noAuth" },
                    { key: "headers", label: "Headers", icon: Hash, count: Object.keys(step.config?.headers || {}).length },
                    { key: "body", label: "Body", icon: Braces, hasIndicator: !!step.config?.body },
                    { key: "scripts", label: "Pre-request", icon: Terminal, hasIndicator: !!step.preRequestScript },
                    { key: "tests", label: "Tests & Extractors", icon: CheckCircle2, count: step.assertions.length + step.extractors.length },
                    { key: "settings", label: "Settings", icon: Settings },
                    { key: "cookies", label: "Cookies", icon: Cookie, count: manualCookies.filter((cookie) => cookie.name.trim()).length, hasIndicator: cookieConfig.enabled === false },
                    { key: "certificates", label: "Certificates", icon: FileKey, hasIndicator: (mtlsConfig.mode ?? "global") !== "global" || !!mtlsConfig.enabled },
                    { key: "proxy", label: "Proxy", icon: Globe, hasIndicator: !!proxyConfig.enabled },
                  ] as Array<{
                    key: "params" | "auth" | "headers" | "body" | "cookies" | "certificates" | "proxy" | "scripts" | "tests" | "settings"
                    label: string
                    icon: ComponentType<{ className?: string }>
                    count?: number
                    hasIndicator?: boolean
                  }>
                ).map((tab) => {
                  const Icon = tab.icon
                  return (
                    <Tabs.Tab key={tab.key} id={tab.key} className="gap-1.5 whitespace-nowrap text-xs">
                      <Icon className="size-3.5" />
                      {tab.label}
                      {typeof tab.count === "number" && tab.count > 0 ? (
                        <Chip size="sm" variant="soft" className="font-mono text-[10px]">
                          <Chip.Label>{tab.count}</Chip.Label>
                        </Chip>
                      ) : null}
                      {tab.hasIndicator ? (
                        <span className="size-1.5 rounded-full bg-warning animate-pulse" />
                      ) : null}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  )
                })}
              </Tabs.List>
            </Tabs.ListContainer>

          <Tabs.Panel id="params" className="pt-0">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Query Params</span>
                <span className="font-mono text-[10px]">({localParams.filter((param) => param.key.trim()).length} active)</span>
              </div>
              <div className="space-y-2 rounded-lg border border-border/40 bg-muted/5 p-3">
                {localParams.length > 0 ? (
                  <div className="space-y-2">
                    {localParams.map((param, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <TemplateInput
                          placeholder="Param key"
                          value={param.key}
                          onChange={(value) => updateLocalParam(idx, "key", value)}
                          suggestions={suggestions}
                        />
                        <span className="text-muted-foreground text-xs">=</span>
                        <TemplateInput
                          placeholder="Value"
                          containerClassName="flex-[2]"
                          value={param.value}
                          onChange={(value) => updateLocalParam(idx, "value", value)}
                          suggestions={suggestions}
                        />
                        <Button
                          variant="ghost"
                          isIconOnly
                          type="button"
                          onPress={() => removeLocalParam(idx)}
                          className="size-8 shrink-0 text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs italic text-muted-foreground">
                    No query params. Add one here or type a query string in the URL.
                  </div>
                )}
                <div className="mt-1 flex justify-start border-t border-border/40 pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onPress={addLocalParam}
                    className="h-8 gap-1 text-xs"
                  >
                    <Plus className="size-3.5" /> Add Param
                  </Button>
                </div>
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="auth" className="pt-0">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                <BuilderSelect
                  label="Auth type"
                  ariaLabel="Auth type"
                  selectedKey={authConfig.type ?? "noAuth"}
                  onSelectionChange={(type) => updateAuthConfig({ type })}
                >
                  <ListBox>
                    <ListBox.Item id="noAuth" textValue="No Auth">
                      No Auth
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="apiKey" textValue="API Key">
                      API Key
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="bearer" textValue="Bearer Token">
                      Bearer Token
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="basic" textValue="Basic Auth">
                      Basic Auth
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="jwtBearer" textValue="JWT Bearer">
                      JWT Bearer
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </BuilderSelect>
                <Card variant="secondary" className="p-3">
                  <Description className="text-xs">
                    Authorization is applied after custom headers, so the selected auth type controls the final auth header or query parameter.
                  </Description>
                </Card>
              </div>

              {(authConfig.type ?? "noAuth") === "apiKey" && (
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_160px]">
                  <BuilderTemplateField
                    label="Key"
                    value={authConfig.key ?? ""}
                    onChange={(value) => updateAuthConfig({ key: value })}
                    suggestions={suggestions}
                    placeholder="X-API-Key"
                  />
                  <BuilderTemplateField
                    label="Value"
                    value={authConfig.value ?? ""}
                    onChange={(value) => updateAuthConfig({ value })}
                    suggestions={suggestions}
                    placeholder="{{secrets.apiKey}}"
                  />
                  <BuilderSelect
                    label="Add to"
                    ariaLabel="Add API key to"
                    selectedKey={authConfig.addTo ?? "header"}
                    onSelectionChange={(addTo) => updateAuthConfig({ addTo })}
                  >
                    <ListBox>
                      <ListBox.Item id="header" textValue="Header">
                        Header
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="query" textValue="Query Param">
                        Query Param
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    </ListBox>
                  </BuilderSelect>
                </div>
              )}

              {(authConfig.type ?? "noAuth") === "bearer" && (
                <BuilderTemplateField
                  label="Token"
                  value={authConfig.token ?? ""}
                  onChange={(value) => updateAuthConfig({ token: value })}
                  suggestions={suggestions}
                  placeholder="{{variables.auth_token}}"
                />
              )}

              {(authConfig.type ?? "noAuth") === "basic" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <BuilderTemplateField
                    label="Username"
                    value={authConfig.username ?? ""}
                    onChange={(value) => updateAuthConfig({ username: value })}
                    suggestions={suggestions}
                    placeholder="{{variables.username}}"
                  />
                  <BuilderTemplateField
                    label="Password"
                    value={authConfig.password ?? ""}
                    onChange={(value) => updateAuthConfig({ password: value })}
                    suggestions={suggestions}
                    placeholder="{{secrets.password}}"
                  />
                </div>
              )}

              {(authConfig.type ?? "noAuth") === "jwtBearer" && (
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-[160px_1fr_180px] items-end">
                    <BuilderSelect
                      label="Algorithm"
                      ariaLabel="JWT algorithm"
                      selectedKey={authConfig.algorithm ?? "HS256"}
                      onSelectionChange={(algorithm) => updateAuthConfig({ algorithm })}
                    >
                      <ListBox>
                        <ListBox.Item id="HS256" textValue="HS256">
                          HS256
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="HS384" textValue="HS384">
                          HS384
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="HS512" textValue="HS512">
                          HS512
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      </ListBox>
                    </BuilderSelect>
                    <BuilderTemplateField
                      label="Secret"
                      value={authConfig.secret ?? ""}
                      onChange={(value) => updateAuthConfig({ secret: value })}
                      suggestions={suggestions}
                      placeholder="{{secrets.jwtSecret}}"
                    />
                    <Checkbox
                      isSelected={!!authConfig.secretBase64Encoded}
                      onChange={(checked) => updateAuthConfig({ secretBase64Encoded: !!checked })}
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <Label className="text-xs">Secret is Base64 encoded</Label>
                    </Checkbox>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <BuilderField label="Payload JSON">
                      <BuilderTextArea
                        value={authConfig.payload ?? "{\n  \"sub\": \"{{variables.clientId}}\"\n}"}
                        onChange={(event) => updateAuthConfig({ payload: event.target.value })}
                        className="min-h-28 font-mono text-xs"
                      />
                    </BuilderField>
                    <BuilderField label="JWT headers JSON">
                      <BuilderTextArea
                        value={authConfig.headers ?? ""}
                        onChange={(event) => updateAuthConfig({ headers: event.target.value })}
                        placeholder={'{\n  "kid": "key-id"\n}'}
                        className="min-h-28 font-mono text-xs"
                      />
                    </BuilderField>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr]">
                    <BuilderSelect
                      label="Add to"
                      ariaLabel="Add JWT to"
                      selectedKey={authConfig.addTo ?? "header"}
                      onSelectionChange={(addTo) => updateAuthConfig({ addTo })}
                    >
                      <ListBox>
                        <ListBox.Item id="header" textValue="Header">
                          Header
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="query" textValue="Query Param">
                          Query Param
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      </ListBox>
                    </BuilderSelect>
                    <BuilderField label="Header prefix">
                      <BuilderInput
                        value={authConfig.headerPrefix ?? "Bearer"}
                        onChange={(event) => updateAuthConfig({ headerPrefix: event.target.value })}
                        className="font-mono text-xs"
                      />
                    </BuilderField>
                    <BuilderField label={authConfig.addTo === "query" ? "Query key" : "Header name"}>
                      <BuilderInput
                        value={
                          authConfig.addTo === "query"
                            ? authConfig.queryKey ?? "jwt"
                            : authConfig.headerName ?? "Authorization"
                        }
                        onChange={(event) =>
                          authConfig.addTo === "query"
                            ? updateAuthConfig({ queryKey: event.target.value })
                            : updateAuthConfig({ headerName: event.target.value })
                        }
                        className="font-mono text-xs"
                      />
                    </BuilderField>
                  </div>
                </div>
              )}
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="headers" className="pt-0">
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
                        <BuilderInput
                          placeholder="Header key (e.g. Content-Type)"
                          className="min-w-0 flex-1 font-mono text-xs"
                          value={header.key}
                          onChange={(event) => updateLocalHeader(idx, "key", event.target.value)}
                        />
                        <span className="text-muted-foreground text-xs">:</span>
                        <TemplateInput
                          placeholder="Value"
                          containerClassName="flex-[2]"
                          value={header.value}
                          onChange={(value) => updateLocalHeader(idx, "value", value)}
                          suggestions={suggestions}
                        />
                        <Button
                          variant="ghost"
                          isIconOnly
                          type="button"
                          onPress={() => removeLocalHeader(idx)}
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
                    variant="secondary"
                    size="sm"
                    type="button"
                    onPress={addLocalHeader}
                    className="h-8 text-xs gap-1"
                  >
                    <Plus className="size-3.5" /> Add Header
                  </Button>
                </div>
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="body" className="pt-0">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted">Raw request body</Label>
              <div className="min-h-[180px] w-full overflow-hidden rounded-md border border-border/50 bg-[#1e1e1e] dark:bg-[#1e1e1e]">
                <TemplateBodyEditor
                  value={step.config?.body ?? ""}
                  theme={editorTheme}
                  suggestions={suggestions}
                  onChange={(val) => {
                    onUpdate({
                      config: {
                        ...step.config,
                        body: val,
                      },
                    })
                  }}
                />
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="cookies" className="pt-0">
            <div className="space-y-3">
              <Card variant="secondary" className="p-3">
                <Card.Content className="flex items-start gap-3 p-0">
                  <Checkbox
                    isSelected={cookieConfig.enabled !== false}
                    onChange={(checked) => updateCookieConfig({ enabled: !!checked, mode: "jar" })}
                  >
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox>
                  <div>
                    <Label className="text-sm font-medium text-foreground">Use per-run cookie jar</Label>
                    <Description className="text-xs">
                      Cookies set by earlier HTTP steps are sent to later matching requests in the same run.
                    </Description>
                  </div>
                </Card.Content>
              </Card>

              <div className="space-y-2 rounded-lg border border-border/40 bg-muted/5 p-3">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span>Manual Cookies</span>
                  <span className="font-mono text-[10px]">({manualCookies.filter((cookie) => cookie.name.trim()).length} active)</span>
                </div>
                {manualCookies.length > 0 ? (
                  <div className="space-y-2">
                    {manualCookies.map((cookie, idx) => (
                      <div key={idx} className="grid gap-2 md:grid-cols-[1fr_1.4fr_1fr_100px_36px] items-center">
                        <TemplateInput
                          placeholder="Name"
                          value={cookie.name}
                          onChange={(value) => updateManualCookie(idx, "name", value)}
                          suggestions={suggestions}
                        />
                        <TemplateInput
                          placeholder="{{variables.sessionId}}"
                          value={cookie.value}
                          onChange={(value) => updateManualCookie(idx, "value", value)}
                          suggestions={suggestions}
                        />
                        <TemplateInput
                          placeholder="Domain optional"
                          value={cookie.domain ?? ""}
                          onChange={(value) => updateManualCookie(idx, "domain", value)}
                          suggestions={suggestions}
                        />
                        <TemplateInput
                          placeholder="/"
                          value={cookie.path ?? "/"}
                          onChange={(value) => updateManualCookie(idx, "path", value)}
                          suggestions={suggestions}
                        />
                        <Button
                          variant="ghost"
                          isIconOnly
                          type="button"
                          onPress={() => removeManualCookie(idx)}
                          className="size-8 text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs italic text-muted-foreground">No manual cookies configured.</div>
                )}
                <div className="border-t border-border/40 pt-2">
                  <Button type="button" variant="secondary" size="sm" onPress={addManualCookie} className="h-8 gap-1 text-xs">
                    <Plus className="size-3.5" /> Add Cookie
                  </Button>
                </div>
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="certificates" className="pt-0">
            <div className="space-y-3">
              <Card variant="secondary" className="p-3">
                <Card.Content className="flex items-start gap-3 p-0">
                  <Checkbox
                    isSelected={(mtlsConfig.mode ?? "global") === "global"}
                    onChange={(checked) => updateMTLSConfig({ mode: checked ? "global" : "none", enabled: false })}
                  >
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox>
                  <div>
                    <Label className="text-sm font-medium text-foreground">Use global matching certificate</Label>
                    <Description className="text-xs">
                      Pulse will apply the active certificate profile matching this request host and port.
                    </Description>
                  </div>
                </Card.Content>
              </Card>
              <BuilderSelect
                label="Certificate mode"
                ariaLabel="Certificate mode"
                selectedKey={mtlsConfig.mode ?? "global"}
                onSelectionChange={(mode) => updateMTLSConfig({ mode, enabled: mode === "custom" })}
              >
                <ListBox>
                  <ListBox.Item id="global" textValue="Use global host match">
                    Use global host match
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="none" textValue="No client certificate">
                    No client certificate
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="profile" textValue="Use specific profile">
                    Use specific profile
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="custom" textValue="Custom aliases">
                    Custom aliases
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </ListBox>
              </BuilderSelect>
              {(mtlsConfig.mode ?? "global") === "profile" && (
                <BuilderSelect
                  label="Certificate profile"
                  ariaLabel="Certificate profile"
                  selectedKey={mtlsConfig.profileId || "none"}
                  onSelectionChange={(profileId) =>
                    updateMTLSConfig({ profileId: profileId === "none" ? "" : profileId })
                  }
                >
                  <ListBox>
                    <ListBox.Item id="none" textValue="Select profile">
                      Select profile
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    {certificateProfiles.map((profile) => (
                      <ListBox.Item
                        key={profile.id}
                        id={profile.id}
                        textValue={`${profile.name} · ${profile.host}:${profile.port}`}
                      >
                        {profile.name} · {profile.host}:{profile.port}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </BuilderSelect>
              )}
              {(mtlsConfig.mode ?? "global") === "custom" && (
                <div className="grid gap-3 md:grid-cols-3">
                  <BuilderTemplateField
                    label="Client cert secret alias"
                    value={mtlsConfig.certSecretAlias ?? ""}
                    onChange={(value) => updateMTLSConfig({ certSecretAlias: value, enabled: true })}
                    suggestions={suggestions}
                    placeholder="clientCertPem"
                  />
                  <BuilderTemplateField
                    label="Client key secret alias"
                    value={mtlsConfig.keySecretAlias ?? ""}
                    onChange={(value) => updateMTLSConfig({ keySecretAlias: value, enabled: true })}
                    suggestions={suggestions}
                    placeholder="clientKeyPem"
                  />
                  <BuilderTemplateField
                    label="Custom CA secret alias"
                    value={mtlsConfig.caCertSecretAlias ?? ""}
                    onChange={(value) => updateMTLSConfig({ caCertSecretAlias: value, enabled: true })}
                    suggestions={suggestions}
                    placeholder="privateCaPem"
                  />
                </div>
              )}
              <Checkbox
                isSelected={!!mtlsConfig.insecureSkipVerify}
                onChange={(checked) => updateMTLSConfig({ insecureSkipVerify: !!checked })}
              >
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Label className="text-xs">Skip server certificate verification for this request</Label>
              </Checkbox>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="proxy" className="pt-0">
            <div className="space-y-3">
              <Card variant="secondary" className="p-3">
                <Card.Content className="flex items-start gap-3 p-0">
                  <Checkbox
                    isSelected={!!proxyConfig.enabled}
                    onChange={(checked) => updateProxyConfig({ enabled: !!checked })}
                  >
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                  </Checkbox>
                  <div>
                    <Label className="text-sm font-medium text-foreground">Use a proxy for this request</Label>
                    <Description className="text-xs">
                      Useful for private networks, controlled egress paths, or endpoint-specific routing.
                    </Description>
                  </div>
                </Card.Content>
              </Card>
              <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr]">
                <BuilderTemplateField
                  label="Proxy URL"
                  value={proxyConfig.url ?? ""}
                  onChange={(value) => updateProxyConfig({ url: value })}
                  suggestions={suggestions}
                  placeholder="http://proxy.internal:8080"
                />
                <BuilderTemplateField
                  label="Username"
                  value={proxyConfig.username ?? ""}
                  onChange={(value) => updateProxyConfig({ username: value })}
                  suggestions={suggestions}
                  placeholder="{{variables.proxyUser}}"
                />
                <BuilderTemplateField
                  label="Password"
                  value={proxyConfig.password ?? ""}
                  onChange={(value) => updateProxyConfig({ password: value })}
                  suggestions={suggestions}
                  placeholder="{{secrets.proxyPassword}}"
                />
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="scripts" className="pt-0">
            <ScriptEditor
              value={step.preRequestScript ?? ""}
              onChange={(script) => onUpdate({ preRequestScript: script })}
              stepName={step.name}
              suggestions={suggestions}
            />
          </Tabs.Panel>

          <Tabs.Panel id="tests" className="pt-0">
            <div className="space-y-4">
              {/* Assertions Section */}
              <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center justify-between">
                    <span>Assertions</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onPress={suggestAssertionsWithAI}
                      isDisabled={isSuggesting}
                      className="text-primary gap-1 h-7 text-[10.5px] px-2 rounded-md "
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
                        <div key={assertion.id} className="flex justify-between items-center bg-muted/5 px-2.5 py-1.5 rounded-md text-xs border border-border/30">
                          <div className="truncate flex-1 mr-2">
                            <span className="font-semibold text-primary uppercase text-[10px]">{assertion.type}</span>
                            <span className="mx-1 text-muted-foreground/60">·</span>
                            <span className="font-mono text-muted-foreground">{assertion.target || "body"}</span>
                            <span className="mx-1 text-muted-foreground/60 text-[10px] font-semibold uppercase">{assertion.operator}</span>
                            <span className="font-mono bg-accent px-1 py-0.2 rounded border border-border/20 text-white">{assertion.expected}</span>
                            {assertion.sensitive && <span className="ml-1.5 text-emerald-600 font-semibold text-[9px] uppercase">(masked)</span>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              isIconOnly
                              type="button"
                              onPress={() => {
                                setAssertType(assertion.type)
                                setAssertTarget(assertion.target || "")
                                setAssertOperator(assertion.operator || "equals")
                                setAssertExpected(assertion.expected || "")
                                setAssertSensitive(!!assertion.sensitive)
                                handleDeleteAssertion(assertion.id)
                              }}
                              className="text-muted-foreground hover:text-foreground size-6 hover:bg-muted/80 rounded"
                            >
                              <Edit3 className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              isIconOnly
                              type="button"
                              onPress={() => handleDeleteAssertion(assertion.id)}
                              className="text-rose-500 hover:text-rose-700 size-6 hover:bg-muted/80 rounded"
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
                        <Button variant="ghost" isIconOnly onPress={() => setAiSuggestions([])} className="size-5 text-primary hover:bg-primary/10 rounded">
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
                              variant="secondary"
                              size="sm"
                              onPress={() => addSuggestedAssertion(suggestion)}
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

                <div className="space-y-3 border-t border-border/30 pt-3 mt-3">
                  <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_3.5rem]">
                    <BuilderSelect
                      label="Assert type"
                      ariaLabel="Assert type"
                      selectedKey={assertType}
                      onSelectionChange={setAssertType}
                    >
                      <ListBox>
                            <ListBox.Item id="statusCode" textValue="Status Code">
                              Status Code
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="responseTime" textValue="Response Time">
                              Response Time
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="jsonPath" textValue="JSONPath">
                              JSONPath
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="header" textValue="Header">
                              Header
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="bodyContains" textValue="Body Contains">
                              Body Contains
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="regex" textValue="Regex Match">
                              Regex Match
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="certExpiryDays" textValue="TLS cert expiry (days)">
                              TLS cert expiry (days)
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="dnsRecords" textValue="DNS records">
                              DNS records
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          </ListBox>
                    </BuilderSelect>
                    <BuilderField label="Target">
                      <BuilderInput
                        placeholder="status, latency, $.id"
                        className={builderControlClass}
                        value={assertTarget}
                        onChange={(event) => setAssertTarget(event.target.value)}
                      />
                    </BuilderField>
                    <BuilderSelect
                      label="Operator"
                      ariaLabel="Assertion operator"
                      selectedKey={assertOperator}
                      onSelectionChange={setAssertOperator}
                    >
                      <ListBox>
                            <ListBox.Item id="equals" textValue="equals">
                              equals
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="notEquals" textValue="notEquals">
                              notEquals
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="contains" textValue="contains">
                              contains
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="notContains" textValue="notContains">
                              notContains
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="exists" textValue="exists">
                              exists
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="notExists" textValue="notExists">
                              notExists
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="greaterThan" textValue="greaterThan">
                              greaterThan
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="lessThan" textValue="lessThan">
                              lessThan
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="matchesRegex" textValue="matchesRegex">
                              matchesRegex
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          </ListBox>
                    </BuilderSelect>
                    <BuilderField label="Expected">
                      <BuilderInput
                        placeholder="Expected val"
                        className={builderControlClass}
                        value={assertExpected}
                        onChange={(event) => setAssertExpected(event.target.value)}
                      />
                    </BuilderField>
                    <BuilderCheckboxField
                      label="Mask"
                      ariaLabel="Mask assertion value"
                      isSelected={assertSensitive}
                      onChange={(checked) => setAssertSensitive(!!checked)}
                    />
                  </div>
                  <Button variant="secondary" size="sm" type="button" onPress={handleAddAssertion} className="h-8 w-full text-xs">
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
                      variant="secondary"
                      size="sm"
                      onPress={suggestExtractorsWithAI}
                      isDisabled={isSuggestingExtractors}
                      className="text-primary gap-1 h-7 text-[10.5px] px-2 rounded-md"
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
                        <div key={extractor.id} className="flex justify-between items-center bg-muted/5 px-2.5 py-1.5 rounded-md text-xs border border-border/30">
                          <div className="truncate flex-1 mr-2">
                            <span className="font-semibold text-primary">{extractor.name}</span>
                            <span className="mx-1 text-muted-foreground/60">·</span>
                            <span className="font-mono text-muted-foreground uppercase text-[9px]">{extractor.type}</span>
                            <span className="mx-1 text-muted-foreground/60">from</span>
                            <span className="font-mono text-white bg-accent px-1 rounded">{extractor.source}</span>
                            {extractor.sensitive && <span className="ml-1.5 text-emerald-600 font-semibold text-[9px] uppercase">(masked)</span>}
                            {extractor.optional && <span className="ml-1 text-muted-foreground font-medium text-[9px]">(optional)</span>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              isIconOnly
                              type="button"
                              onPress={() => {
                                setExtType(extractor.type)
                                setExtName(extractor.name)
                                setExtSource(extractor.source)
                                setExtSensitive(!!extractor.sensitive)
                                setExtOptional(!!extractor.optional)
                                handleDeleteExtractor(extractor.id)
                              }}
                              className="text-muted-foreground hover:text-foreground size-6 hover:bg-muted/80 rounded"
                            >
                              <Edit3 className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              isIconOnly
                              type="button"
                              onPress={() => handleDeleteExtractor(extractor.id)}
                              className="text-rose-500 hover:text-rose-700 size-6 hover:bg-muted/80 rounded"
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
                        <Button variant="ghost" isIconOnly onPress={() => setAiExtractorSuggestions([])} className="size-5 text-primary hover:bg-primary/10 rounded">
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
                              variant="secondary"
                              size="sm"
                              onPress={() => addSuggestedExtractor(suggestion)}
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

                <div className="space-y-3 border-t border-border/30 pt-3 mt-3">
                  <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_3.5rem_3.5rem]">
                    <BuilderField label="Variable name">
                      <BuilderInput
                        placeholder="token"
                        className={builderControlClass}
                        value={extName}
                        onChange={(event) => setExtName(event.target.value)}
                      />
                    </BuilderField>
                    <BuilderSelect
                      label="Type"
                      ariaLabel="Extractor type"
                      selectedKey={extType}
                      onSelectionChange={setExtType}
                    >
                      <ListBox>
                        <ListBox.Item id="jsonPath" textValue="JSONPath">
                          JSONPath
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="header" textValue="Header">
                          Header
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="cookie" textValue="Cookie">
                          Cookie
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="regex" textValue="Regex">
                          Regex
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="statusCode" textValue="Status Code">
                          Status Code
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="responseTime" textValue="Response Time">
                          Response Time
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      </ListBox>
                    </BuilderSelect>
                    <BuilderField label="Source">
                      <BuilderInput
                        placeholder="$.access_token, Authorization"
                        className={builderControlClass}
                        value={extSource}
                        onChange={(event) => setExtSource(event.target.value)}
                      />
                    </BuilderField>
                    <BuilderCheckboxField
                      label="Mask"
                      ariaLabel="Mask extractor value"
                      isSelected={extSensitive}
                      onChange={(checked) => setExtSensitive(!!checked)}
                    />
                    <BuilderCheckboxField
                      label="Opt"
                      ariaLabel="Optional extractor"
                      isSelected={extOptional}
                      onChange={(checked) => setExtOptional(!!checked)}
                    />
                  </div>
                  <Button variant="secondary" size="sm" type="button" onPress={handleAddExtractor} className="h-8 w-full text-xs">
                    <PlusCircle className="size-3.5 mr-1" /> Add Extractor
                  </Button>
                </div>
              </div>
            </div>
          </Tabs.Panel>

          <Tabs.Panel id="settings" className="pt-0">
            <div className="space-y-4">
              <Description className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Step configuration
              </Description>
              <Card variant="secondary" className="p-4">
                <Card.Content className="grid grid-cols-1 items-end gap-3 p-0 md:grid-cols-3">
                  <BuilderField label="Step name">
                    <BuilderInput value={step.name} onChange={(event) => onUpdate({ name: event.target.value })} />
                  </BuilderField>
                  <BuilderField label="Timeout (ms)">
                    <BuilderInput
                      type="number"
                      min={100}
                      value={String(step.timeoutMs)}
                      onChange={(event) => onUpdate({ timeoutMs: Number(event.target.value) })}
                    />
                  </BuilderField>
                  <BuilderField label="Retry count">
                    <BuilderInput
                      type="number"
                      min={0}
                      value={String(step.retryCount)}
                      onChange={(event) => onUpdate({ retryCount: Number(event.target.value) })}
                    />
                  </BuilderField>
                </Card.Content>
              </Card>
            </div>
          </Tabs.Panel>
          </Tabs>
        </div>
      )}

      {["dns", "tcp", "tls", "delay"].includes(step.type) && (
        <div className="space-y-4">
          <SyntheticStepEditor step={step} onUpdate={onUpdate} />
          {step.type !== "delay" ? (
            <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3">
              <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Assertions</div>
              <p className="text-xs text-muted-foreground">
                Use the Tests tab on HTTP steps for full assertion tooling, or add assertions in the JSON editor for synthetic steps.
              </p>
            </div>
          ) : null}
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
                    <Button variant="ghost" isIconOnly type="button" onPress={() => handleDeleteAction(action.id)} className="text-rose-500 hover:text-rose-700 size-6 shrink-0 ml-2">
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground text-xs italic">No actions defined yet.</div>
              )}
            </div>

            <div className="grid grid-cols-2 items-end gap-2 border-t border-border/30 pt-3 mt-3 md:grid-cols-[140px_1fr_1fr]">
              <BuilderSelect
                label="Action type"
                ariaLabel="Action type"
                selectedKey={actionType}
                onSelectionChange={setActionType}
                className="h-8"
              >
                <ListBox>
                      <ListBox.Item id="generateJWT" textValue="Generate JWT">
                        Generate JWT
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="hmacSha256" textValue="HMAC SHA256">
                        HMAC SHA256
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="generateUUID" textValue="Generate UUID">
                        Generate UUID
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="generateTimestamp" textValue="Generate Timestamp">
                        Generate Timestamp
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="base64Encode" textValue="Base64 Encode">
                        Base64 Encode
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="base64Decode" textValue="Base64 Decode">
                        Base64 Decode
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="urlEncode" textValue="URL Encode">
                        URL Encode
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="urlDecode" textValue="URL Decode">
                        URL Decode
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="sha256" textValue="SHA256 Hash">
                        SHA256 Hash
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="setVariable" textValue="Set Variable">
                        Set Variable
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="readStepOutput" textValue="Read Previous Output">
                        Read Previous Output
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    </ListBox>
              </BuilderSelect>
              <BuilderField label="Label">
                <BuilderInput
                  placeholder="Generate client assertion"
                  className="h-8 text-xs"
                  value={actionLabel}
                  onChange={(event) => setActionLabel(event.target.value)}
                />
              </BuilderField>
              <BuilderField label="Output key">
                <BuilderInput
                  placeholder="jwt"
                  className="h-8 text-xs"
                  value={actionOutput}
                  onChange={(event) => setActionOutput(event.target.value)}
                />
              </BuilderField>
            </div>
            <BuilderTemplateField
              label="Config parameters"
              placeholder="iss/sub={{secrets.clientId}}, aud={{variables.audience}}"
              value={actionConfig}
              onChange={setActionConfig}
              suggestions={suggestions}
              className="mt-2"
            />
            <Button variant="secondary" size="sm" type="button" onPress={handleAddAction} className="w-full h-8 text-xs mt-1">
              <PlusCircle className="size-3.5 mr-1" /> Add Action
            </Button>
          </div>
        </div>
      )}

      <Card variant="secondary" className="mt-4 border-t border-border/20 p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            isSelected={step.continueOnFailure}
            onChange={(checked) => onUpdate({ continueOnFailure: !!checked })}
            aria-label="Continue on failure"
            className="mt-0.5 shrink-0"
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
          </Checkbox>
          <div className="min-w-0 space-y-0.5 flex flex-col">
            <Label className="text-xs font-semibold text-foreground">Continue on failure</Label>
            <Description className="text-[10px] leading-relaxed">
              If enabled, subsequent steps will execute even if this step fails.
            </Description>
          </div>
        </div>
      </Card>
    </div>
  )
}

export function BuilderWorkbench({ monitor, applications = [], certificateProfiles = [] }: BuilderWorkbenchProps) {
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

  const templateSuggestions = useMemo(() => buildTemplateSuggestions(draft, mockRun), [draft, mockRun])

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
      config: defaultHttpConfig(),
    }
    updateDraft({
      ...draft,
      steps: [...draft.steps, newStep],
    })
    setSelectedStepId(newId)
  }

  function addPreRequestStep() {
    const existing = draft.steps.find((step) => step.type === "preRequest")
    if (existing) {
      const reordered = normalizeStepOrder([
        existing,
        ...draft.steps.filter((step) => step.id !== existing.id),
      ])
      updateDraft({
        ...draft,
        steps: reordered,
      })
      setSelectedStepId(existing.id)
      return
    }

    const newId = `step-${crypto.randomUUID()}`
    const newStep: MonitorStep = {
      id: newId,
      order: 1,
      name: "Step 1: Pre-Request Script",
      type: "preRequest",
      timeoutMs: 5000,
      retryCount: 0,
      continueOnFailure: false,
      actions: [],
      assertions: [],
      extractors: [],
      preRequestScript: "",
      config: {},
    }
    updateDraft({
      ...draft,
      steps: normalizeStepOrder([newStep, ...draft.steps]),
    })
    setSelectedStepId(newId)
  }

  function addDnsStep() {
    const newId = `step-${crypto.randomUUID()}`
    const newStep: MonitorStep = {
      id: newId,
      order: draft.steps.length + 1,
      name: `Step ${draft.steps.length + 1}: DNS resolve`,
      type: "dns",
      timeoutMs: 5000,
      retryCount: 0,
      continueOnFailure: false,
      assertions: [],
      extractors: [],
      config: { host: "example.com", recordType: "A", expected: "" },
    }
    updateDraft({ ...draft, steps: [...draft.steps, newStep] })
    setSelectedStepId(newId)
  }

  function addTcpStep() {
    const newId = `step-${crypto.randomUUID()}`
    const newStep: MonitorStep = {
      id: newId,
      order: draft.steps.length + 1,
      name: `Step ${draft.steps.length + 1}: TCP connect`,
      type: "tcp",
      timeoutMs: 5000,
      retryCount: 0,
      continueOnFailure: false,
      assertions: [],
      extractors: [],
      config: { host: "example.com", port: "443" },
    }
    updateDraft({ ...draft, steps: [...draft.steps, newStep] })
    setSelectedStepId(newId)
  }

  function addTlsStep() {
    const newId = `step-${crypto.randomUUID()}`
    const newStep: MonitorStep = {
      id: newId,
      order: draft.steps.length + 1,
      name: `Step ${draft.steps.length + 1}: TLS certificate`,
      type: "tls",
      timeoutMs: 8000,
      retryCount: 0,
      continueOnFailure: false,
      assertions: [{
        id: `assert-${crypto.randomUUID()}`,
        type: "certExpiryDays",
        label: "Certificate expires in more than 30 days",
        target: "certExpiryDays",
        operator: "greaterThan",
        expected: "30",
      }],
      extractors: [],
      config: { host: "example.com", port: "443" },
    }
    updateDraft({ ...draft, steps: [...draft.steps, newStep] })
    setSelectedStepId(newId)
  }

  function addDelayStep() {
    const newId = `step-${crypto.randomUUID()}`
    const newStep: MonitorStep = {
      id: newId,
      order: draft.steps.length + 1,
      name: `Step ${draft.steps.length + 1}: Delay`,
      type: "delay",
      timeoutMs: 1000,
      retryCount: 0,
      continueOnFailure: false,
      assertions: [],
      extractors: [],
      config: { delayMs: "1000" },
    }
    updateDraft({ ...draft, steps: [...draft.steps, newStep] })
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
        ...defaultHttpConfig(),
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
      <Card >
        <Card.Content className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-lg font-bold tracking-tight text-foreground">
              {draft.id ? "Edit monitor" : "Create monitor"}
            </h2>
            <Chip size="sm" variant="soft" className="font-mono">
              <Chip.Label>{draft.name || "Unnamed monitor"}</Chip.Label>
            </Chip>
          </div>
          <Description className="text-xs">
            Edit draft config, publish to production, and run draft tests without affecting the scheduled monitor.
          </Description>
          {draft.id ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Chip size="sm" variant="soft" className="bg-success/10 text-success">
                <Chip.Label className="text-[10px] font-semibold uppercase tracking-wider">
                  Published v{publishedVersion}
                </Chip.Label>
              </Chip>
              {hasUnpublishedDraft ? (
                <Chip size="sm" variant="soft" className="bg-warning/10 text-warning">
                  <Chip.Label className="text-[10px] font-semibold uppercase tracking-wider">
                    Unpublished draft changes
                  </Chip.Label>
                </Chip>
              ) : (
                <Chip size="sm" variant="soft">
                  <Chip.Label className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Draft matches published
                  </Chip.Label>
                </Chip>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onPress={() => setIsImportExportOpen(true)}
            className="h-9 gap-1.5"
          >
            <Upload className="size-3.5" />
            Import / Export
          </Button>
          <Button
            size="sm"
            
            onPress={handleSaveClick}
            isDisabled={saveState === "saving" || validationErrors.length > 0}
            className="h-9 gap-1.5"
          >
            {saveState === "saving" ? <RotateCw className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {draft.id ? "Save draft" : "Create monitor"}
          </Button>
          {draft.id ? (
            <>
              <Input
                variant="secondary"
                value={publishNote}
                onChange={(e) => setPublishNote(e.target.value)}
                placeholder="Publish note (optional)"
                className="hidden h-9 w-36 text-xs xl:block"
              />
              <Button
                size="sm"
                onPress={() => void publishDraft()}
                isDisabled={saveState === "saving" || validationErrors.length > 0}
                className="gap-1.5 h-9 font-semibold"
              >
                <Rocket className="size-3.5" />
                Publish
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => void discardDraftChanges()}
                isDisabled={!hasUnpublishedDraft || saveState === "saving"}
                className="h-9 text-xs"
              >
                Discard draft
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            onPress={testMonitorRealData}
            isDisabled={executionState === "running" || validationErrors.length > 0}
            className="h-9 gap-1.5"
          >
            {executionState === "running" ? <RotateCw className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Run draft
          </Button>
          {draft.id ? (
            <Button
              size="sm"
              variant="secondary"
              onPress={() => void runPublishedMonitor()}
              isDisabled={executionState === "running"}
              className="h-9 gap-1.5"
            >
              <Play className="size-3.5" />
              Run published
            </Button>
          ) : null}
        </div>
        </Card.Content>
      </Card>

      {/* Main Workspace (Full Width) */}
      <div className="space-y-6">
        <Tabs
          selectedKey={builderTab}
          onSelectionChange={(key) => {
            if (key != null) setBuilderTab(String(key) as typeof builderTab)
          }}
          variant="secondary"
          className="w-full gap-5"
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="Monitor builder sections" className="w-full overflow-x-auto">
              {([
                { key: "steps", label: "Steps list", icon: Workflow },
                { key: "variables", label: "Variables & secrets", icon: KeyRound },
                { key: "settings", label: "Monitor settings", icon: SlidersHorizontal },
                { key: "json", label: "Raw JSON config", icon: FileJson },
                { key: "copilot", label: "Pulse AI copilot", icon: Sparkles },
                ...(draft.id ? [{ key: "versions" as const, label: "Versions", icon: History }] : []),
              ] as const).map((tab) => {
                const Icon = tab.icon
                return (
                  <Tabs.Tab key={tab.key} id={tab.key} className="gap-1.5 whitespace-nowrap">
                    <Icon className="size-3.5" />
                    {tab.label}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                )
              })}
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="steps" className="pt-0">
            <Section title="Step builder" icon={Workflow}>
              <Card className="grid min-h-[580px] grid-cols-1 overflow-hidden lg:grid-cols-[250px_1fr]">
                {/* Left: Steps Explorer Sidebar */}
                <div className="flex min-h-0 flex-col border border-border/40 select-none">
                  <Card.Header className="flex-row items-center justify-between gap-2 border-b px-3 py-2.5">
                    <Description className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Steps Explorer
                    </Description>
                    <Chip size="sm" variant="soft" className="font-mono text-[10px]">
                      <Chip.Label>
                        {draft.steps.length} {draft.steps.length === 1 ? "step" : "steps"}
                      </Chip.Label>
                    </Chip>
                  </Card.Header>

                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="max-h-[500px] flex-1 overflow-y-auto p-2">
                      {!draft.steps.length ? (
                        <EmptyState className="border border-dashed border-border/40 bg-muted/5 py-8 text-center">
                          <Workflow className="mx-auto mb-2 size-5 text-muted-foreground" aria-hidden />
                          <Description className="text-xs italic">No steps added yet.</Description>
                        </EmptyState>
                      ) : (
                        <ListBox
                          aria-label="Monitor steps"
                          selectionMode="single"
                          selectedKeys={selectedStepId ? [selectedStepId] : []}
                          onSelectionChange={(keys) => {
                            const key = keys === "all" ? null : Array.from(keys)[0]
                            if (key) setSelectedStepId(String(key))
                          }}
                          className="gap-1 p-0"
                        >
                          {draft.steps.map((step, idx) => {
                            const isActive = selectedStep?.id === step.id
                            const isPreRequest = step.type === "preRequest"
                            return (
                              <ListBox.Item
                                key={step.id}
                                id={step.id}
                                textValue={step.name}
                                className={cn(
                                  "group flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 transition-colors",
                                  isActive
                                    ? "border-primary/25 bg-primary/5 font-semibold text-primary"
                                    : "border-transparent text-muted-foreground data-[hovered=true]:bg-muted/10 data-[hovered=true]:text-foreground"
                                )}
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <span className="w-3.5 shrink-0 text-right font-mono text-[10px] text-muted-foreground/60">
                                    {step.order}
                                  </span>
                                  {isPreRequest ? (
                                    <Chip size="sm" variant="soft" className="shrink-0 font-mono text-[9px] uppercase">
                                      <Chip.Label>PreReq</Chip.Label>
                                    </Chip>
                                  ) : (
                                    <Chip
                                      size="sm"
                                      variant="soft"
                                      className={cn(
                                        "shrink-0 border font-mono text-[9px] uppercase",
                                        methodColors[step.method ?? "GET"] || methodChipFallback
                                      )}
                                    >
                                      <Chip.Label>{step.method ?? "GET"}</Chip.Label>
                                    </Chip>
                                  )}
                                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{step.name}</span>
                                </div>
                                <div
                                  className="hidden shrink-0 items-center gap-0.5 pl-1.5 group-hover:flex"
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    isIconOnly
                                    size="sm"
                                    isDisabled={idx === 0}
                                    onPress={() => moveStep(idx, "up")}
                                    aria-label="Move step up"
                                    className="size-6 min-w-6"
                                  >
                                    <ArrowUp className="size-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    isIconOnly
                                    size="sm"
                                    isDisabled={idx === draft.steps.length - 1}
                                    onPress={() => moveStep(idx, "down")}
                                    aria-label="Move step down"
                                    className="size-6 min-w-6"
                                  >
                                    <ArrowDown className="size-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    isIconOnly
                                    size="sm"
                                    onPress={() => deleteStep(step.id)}
                                    aria-label="Delete step"
                                    className="size-6 min-w-6 text-danger"
                                  >
                                    <Trash2 className="size-3" />
                                  </Button>
                                </div>
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            )
                          })}
                        </ListBox>
                      )}
                    </div>

                    <Card.Footer className="flex flex-col gap-1 border-t border-border/40 bg-muted/5 p-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onPress={addHttpStep}
                        className="h-7 w-full justify-start gap-1 text-[10px] font-semibold"
                      >
                        <Plus className="size-3" /> Add HTTP Request
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onPress={addPreRequestStep}
                        className="h-7 w-full justify-start gap-1 text-[10px] font-semibold"
                      >
                        <Plus className="size-3" /> Add Pre-Request Script
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onPress={addDnsStep}
                        className="h-7 w-full justify-start gap-1 text-[10px] font-semibold"
                      >
                        <Plus className="size-3" /> Add DNS check
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onPress={addTcpStep}
                        className="h-7 w-full justify-start gap-1 text-[10px] font-semibold"
                      >
                        <Plus className="size-3" /> Add TCP check
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onPress={addTlsStep}
                        className="h-7 w-full justify-start gap-1 text-[10px] font-semibold"
                      >
                        <Plus className="size-3" /> Add TLS cert check
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onPress={addDelayStep}
                        className="h-7 w-full justify-start gap-1 text-[10px] font-semibold"
                      >
                        <Plus className="size-3" /> Add delay
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onPress={() => setIsCurlModalOpen(true)}
                        className="h-7 w-full justify-start gap-1 text-[10px] font-semibold text-primary"
                      >
                        <Sparkles className="size-3 text-primary animate-pulse" /> Import HTTP from cURL
                      </Button>
                    </Card.Footer>
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
                      suggestions={templateSuggestions}
                      certificateProfiles={certificateProfiles}
                      onUpdate={(patch) => updateStep(selectedStep.id, patch)}
                      onDelete={() => deleteStep(selectedStep.id)}
                      onMoveUp={() => moveStep(draft.steps.findIndex(s => s.id === selectedStep.id), "up")}
                      onMoveDown={() => moveStep(draft.steps.findIndex(s => s.id === selectedStep.id), "down")}
                    />
                  ) : (
                    <EmptyState className="flex h-full min-h-[400px] flex-1 flex-col items-center justify-center px-6 py-20 text-center">
                      <Workflow className="mb-3 size-8 text-muted animate-pulse" aria-hidden />
                      <p className="text-sm font-semibold text-foreground">No steps added to this monitor</p>
                      <Description className="mt-1.5 mb-5 max-w-[280px]">
                        Add request steps to run in sequence. You can configure endpoints, headers, assertions, and extract variables.
                      </Description>
                      <div className="flex flex-col gap-2 w-full max-w-[320px]">
                        <div className="flex gap-2">
                          <Button type="button" variant="secondary" size="sm" onPress={addHttpStep} className="h-9 flex-1">
                            <PlusCircle className="size-4" /> Add HTTP Step
                          </Button>
                          <Button type="button" variant="secondary" size="sm" onPress={addPreRequestStep} className="h-9 flex-1">
                            <PlusCircle className="size-4" /> Add Pre-Request
                          </Button>
                        </div>
                        <Button type="button" variant="secondary" size="sm" onPress={() => setIsCurlModalOpen(true)} className="h-9 w-full gap-1.5 font-semibold text-accent">
                          <Sparkles className="size-4 animate-pulse text-accent" /> Import HTTP step from cURL command
                        </Button>
                      </div>
                    </EmptyState>
                  )}
                </div>
              </Card>
            </Section>
          </Tabs.Panel>

          <Tabs.Panel id="variables" className="pt-0">
            <Section title="Variables and secrets" icon={KeyRound}>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <Description className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Variables
                  </Description>
                  {Object.entries(draft.variables || {}).map(([key, value]) => (
                    <div key={key} className="flex gap-2 items-end">
                      <BuilderField label="Key" className="w-[140px] shrink-0">
                        <BuilderInput
                          placeholder="Key"
                          className="font-mono text-xs"
                          value={key}
                          disabled
                        />
                      </BuilderField>
                      <BuilderField label="Value" className="min-w-0 flex-1">
                        <BuilderInput
                          placeholder="Value"
                          value={value}
                          className="font-mono text-xs"
                          onChange={(event) => updateVariable(key, event.target.value)}
                        />
                      </BuilderField>
                      <Button
                        variant="ghost"
                        isIconOnly
                        type="button"
                        onPress={() => removeVariable(key)}
                        className="text-danger shrink-0"
                        aria-label={`Remove variable ${key}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2 items-end border-t border-border/40 pt-3">
                    <BuilderField label="New key" className="w-[140px] shrink-0">
                      <BuilderInput
                        placeholder="New key"
                        className="font-mono text-xs"
                        value={newVarKey}
                        onChange={(event) => setNewVarKey(event.target.value)}
                      />
                    </BuilderField>
                    <BuilderField label="New value" className="min-w-0 flex-1">
                      <BuilderInput
                        placeholder="New value"
                        value={newVarValue}
                        className="font-mono text-xs"
                        onChange={(event) => setNewVarValue(event.target.value)}
                      />
                    </BuilderField>
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onPress={() => {
                        if (!newVarKey.trim()) return
                        addVariable(newVarKey, newVarValue)
                        setNewVarKey("")
                        setNewVarValue("")
                      }}
                      className="h-9 shrink-0"
                    >
                      <PlusCircle className="size-4" /> Add
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <Description className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Secret aliases
                  </Description>
                  {(draft.secretAliases || []).map((alias) => (
                    <Card key={alias} variant="secondary" className="p-2">
                      <Card.Content className="flex items-center justify-between gap-2 p-0">
                        <span className="flex items-center gap-2 font-mono text-xs">
                          <ShieldCheck className="size-4 shrink-0 text-success" />
                          {`{{secrets.${alias}}}`}
                        </span>
                        <Button
                          variant="ghost"
                          isIconOnly
                          type="button"
                          onPress={() => removeSecretAlias(alias)}
                          className="text-danger shrink-0"
                          aria-label={`Remove secret alias ${alias}`}
                        >
                          <X className="size-4" />
                        </Button>
                      </Card.Content>
                    </Card>
                  ))}
                  <div className="flex gap-2 items-end border-t border-border/40 pt-3">
                    <BuilderField label="New secret alias" className="min-w-0 flex-1">
                      <BuilderInput
                        placeholder="New secret alias"
                        className="font-mono text-xs"
                        value={newSecretAlias}
                        onChange={(event) => setNewSecretAlias(event.target.value)}
                      />
                    </BuilderField>
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onPress={() => {
                        if (!newSecretAlias.trim()) return
                        addSecretAlias(newSecretAlias)
                        setNewSecretAlias("")
                      }}
                      className="h-9 shrink-0"
                    >
                      <PlusCircle className="size-4" /> Bind
                    </Button>
                  </div>
                </div>
              </div>
            </Section>
          </Tabs.Panel>

          <Tabs.Panel id="settings" className="flex flex-col gap-4 pt-0">
              <Section title="Basic details" icon={SlidersHorizontal}>
                <div className="grid gap-4 md:grid-cols-2">
                  <Select
                    aria-label="Application"
                    className="w-full"
                    variant="secondary"
                    selectedKey={draft.applicationId || "none"}
                    onSelectionChange={(key) =>
                      updateDraft({
                        ...draft,
                        applicationId: !key || key === "none" ? "" : String(key),
                      })
                    }
                  >
                    <Label className="text-xs font-medium text-muted">Application</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id="none" textValue="Unassigned">
                          Unassigned
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        {applications.map((application) => (
                          <ListBox.Item
                            key={application.id}
                            id={application.id}
                            textValue={`${application.name} · CAR ${application.carId}`}
                          >
                            {application.name} · CAR {application.carId}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  <BuilderField label="Monitor name">
                    <BuilderInput
                      value={draft.name}
                      onChange={(event) => updateDraft({ ...draft, name: event.target.value })}
                    />
                  </BuilderField>
                  <BuilderField label="Schedule cron">
                    <BuilderInput
                      value={draft.cron}
                      onChange={(event) =>
                        updateDraft({ ...draft, cron: event.target.value, scheduleLabel: "Custom cron" })
                      }
                    />
                  </BuilderField>
                  <BuilderField label="Timeout (ms)">
                    <BuilderInput
                      type="number"
                      min={1000}
                      value={String(draft.timeoutMs)}
                      onChange={(event) => updateDraft({ ...draft, timeoutMs: Number(event.target.value) })}
                    />
                  </BuilderField>
                  <BuilderField label="Response body limit KB">
                    <BuilderInput
                      type="number"
                      min={1}
                      value={String(draft.responseBodyLimitKb)}
                      onChange={(event) =>
                        updateDraft({ ...draft, responseBodyLimitKb: Number(event.target.value) })
                      }
                    />
                  </BuilderField>
                </div>
              </Section>

              {/* Alert & failure policy */}
              <Section title="Alert & failure policy" icon={ShieldCheck}>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      isSelected={draft.alertPolicy?.enabled ?? false}
                      onChange={(checked) =>
                        updateDraft({
                          ...draft,
                          alertPolicy: {
                            ...(draft.alertPolicy || {
                              threshold: 3,
                              responseTimeMs: 2000,
                              email: true,
                              slackWebhook: false,
                              cooldownMinutes: 30,
                            }),
                            enabled: !!checked,
                          },
                        })
                      }
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox>
                    <Description className="text-sm font-medium text-foreground">
                      Enable automated alerting for this monitor
                    </Description>
                  </div>

                  {(draft.alertPolicy?.enabled ?? false) && (
                    <Card  className="md:col-span-2">
                      <Card.Content className="grid gap-4 md:grid-cols-2">
                        <BuilderField label="Consecutive failure threshold">
                          <BuilderInput
                            type="number"
                            min={1}
                            value={String(draft.alertPolicy.threshold)}
                            onChange={(event) =>
                              updateDraft({
                                ...draft,
                                alertPolicy: { ...draft.alertPolicy, threshold: Number(event.target.value) },
                              })
                            }
                          />
                        </BuilderField>
                        <BuilderField label="Response time alert limit (ms)">
                          <BuilderInput
                            type="number"
                            min={100}
                            value={String(draft.alertPolicy.responseTimeMs)}
                            onChange={(event) =>
                              updateDraft({
                                ...draft,
                                alertPolicy: { ...draft.alertPolicy, responseTimeMs: Number(event.target.value) },
                              })
                            }
                          />
                        </BuilderField>
                        <BuilderField label="Alert cooldown (minutes)">
                          <BuilderInput
                            type="number"
                            min={1}
                            value={String(draft.alertPolicy.cooldownMinutes)}
                            onChange={(event) =>
                              updateDraft({
                                ...draft,
                                alertPolicy: { ...draft.alertPolicy, cooldownMinutes: Number(event.target.value) },
                              })
                            }
                          />
                        </BuilderField>
                        <div className="flex flex-col gap-2 justify-center">
                          <Label className="text-xs font-medium text-muted">Notification channels</Label>
                          <div className="flex flex-wrap gap-4">
                            <Checkbox
                              isSelected={draft.alertPolicy.email}
                              onChange={(checked) =>
                                updateDraft({
                                  ...draft,
                                  alertPolicy: { ...draft.alertPolicy, email: !!checked },
                                })
                              }
                            >
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                              <Label className="text-xs">Email notifications</Label>
                            </Checkbox>
                            <Checkbox
                              isSelected={draft.alertPolicy.slackWebhook}
                              onChange={(checked) =>
                                updateDraft({
                                  ...draft,
                                  alertPolicy: { ...draft.alertPolicy, slackWebhook: !!checked },
                                })
                              }
                            >
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                              <Label className="text-xs">Slack webhook</Label>
                            </Checkbox>
                          </div>
                        </div>
                        <Select
                          aria-label="Severity override"
                          className="md:col-span-2 w-full"
                          variant="secondary"
                          selectedKey={draft.alertPolicy.severity || "inherit"}
                          onSelectionChange={(key) =>
                            updateDraft({
                              ...draft,
                              alertPolicy: { ...draft.alertPolicy, severity: key ? String(key) : "inherit" },
                            })
                          }
                        >
                          <Label className="text-xs font-medium text-muted">Severity override</Label>
                          <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                          </Select.Trigger>
                          <Select.Popover>
                            <ListBox>
                              <ListBox.Item id="inherit" textValue="Inherit from application / run">
                                Inherit from application / run
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                              <ListBox.Item id="critical" textValue="Critical">
                                Critical
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                              <ListBox.Item id="warning" textValue="Warning">
                                Warning
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            </ListBox>
                          </Select.Popover>
                        </Select>
                        <div className="flex items-start gap-3 md:col-span-2">
                          <Checkbox
                            isSelected={draft.alertPolicy.inheritFromApplication ?? true}
                            onChange={(checked) =>
                              updateDraft({
                                ...draft,
                                alertPolicy: { ...draft.alertPolicy, inheritFromApplication: !!checked },
                              })
                            }
                          >
                            <Checkbox.Control>
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                          </Checkbox>
                          <Description className="text-xs">
                            Inherit application default channels and routing
                          </Description>
                        </div>
                        <BuilderField label="Email recipients (override)">
                          <BuilderInput
                            placeholder="oncall@team.com, pager@team.com"
                            value={(draft.alertPolicy.emailTo || []).join(", ")}
                            onChange={(event) =>
                              updateDraft({
                                ...draft,
                                alertPolicy: {
                                  ...draft.alertPolicy,
                                  emailTo: event.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                },
                              })
                            }
                          />
                        </BuilderField>
                        <BuilderField label="On-call targets">
                          <BuilderInput
                            placeholder="@oncall-primary, @oncall-secondary"
                            value={(draft.alertPolicy.onCallTargets || []).join(", ")}
                            onChange={(event) =>
                              updateDraft({
                                ...draft,
                                alertPolicy: {
                                  ...draft.alertPolicy,
                                  onCallTargets: event.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                },
                              })
                            }
                          />
                        </BuilderField>
                        <BuilderField label="Slack webhook secret alias" className="md:col-span-2">
                          <BuilderInput
                            placeholder="slackWebhook or custom alias"
                            value={draft.alertPolicy.slackWebhookSecret || ""}
                            onChange={(event) =>
                              updateDraft({
                                ...draft,
                                alertPolicy: { ...draft.alertPolicy, slackWebhookSecret: event.target.value },
                              })
                            }
                          />
                        </BuilderField>
                      </Card.Content>
                    </Card>
                  )}
                </div>
              </Section>
          </Tabs.Panel>

          <Tabs.Panel id="json" className="pt-0">
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
                  <Button size="sm" variant="secondary" onPress={handleApplyJson} className="gap-1.5">
                    <Save className="size-4" />
                    Apply JSON changes
                  </Button>
                </div>
                {parseError ? (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{parseError}</Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
              </div>
            </Section>
          </Tabs.Panel>

          {draft.id ? (
          <Tabs.Panel id="versions" className="pt-0">
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
          </Tabs.Panel>
          ) : null}

          <Tabs.Panel id="copilot" className="pt-0">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <Card.Header className="gap-2 border-b border-border/40 pb-4">
                  <Card.Title className="flex items-center gap-2 text-sm font-bold">
                    <Sparkles className="size-4 text-primary animate-pulse" />
                    Pulse AI Monitor Optimizer
                  </Card.Title>
                  <Description className="text-xs">
                    Get recommendations from Copilot to optimize your check coverage, performance timeouts, retries, and overall alert security.
                  </Description>
                </Card.Header>
                <Card.Content className="space-y-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={async () => {
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
                    isDisabled={optimizing}
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

                  {!optimizing && optimizationSuggestions.length === 0 ? (
                    <EmptyState className="border border-dashed py-8 text-center">
                      <Description className="text-xs">
                        No analysis run yet. Click above to run AI optimizer check.
                      </Description>
                    </EmptyState>
                  ) : null}

                  {!optimizing && optimizationSuggestions.length > 0 ? (
                    <div className="max-h-[350px] space-y-3 overflow-y-auto pr-1">
                      {optimizationSuggestions.map((suggestion, idx) => (
                        <Card key={idx} variant="secondary">
                          <Card.Content className="space-y-1.5 p-3 text-xs">
                            <div className="flex items-center gap-1.5 font-semibold text-foreground">
                              <Chip
                                size="sm"
                                variant="soft"
                                className={cn(
                                  "text-[9px] uppercase",
                                  suggestion.category === "security"
                                    ? "text-danger"
                                    : suggestion.category === "assertion"
                                      ? "text-success"
                                      : "text-primary"
                                )}
                              >
                                <Chip.Label>{suggestion.category}</Chip.Label>
                              </Chip>
                              <span>{suggestion.title}</span>
                            </div>
                            <Description className="text-[11px] leading-relaxed">
                              {suggestion.description}
                            </Description>
                          </Card.Content>
                        </Card>
                      ))}
                    </div>
                  ) : null}
                </Card.Content>
              </Card>

              <Card>
                <Card.Header className="gap-2 border-b border-border/40 pb-4">
                  <Card.Title className="flex items-center gap-2 text-sm font-bold">
                    <Code2 className="size-4 text-primary animate-pulse" />
                    Natural Language Monitor Builder
                  </Card.Title>
                  <Description className="text-xs">
                    Describe what APIs you want to test and how often, and Pulse Copilot will write a complete configuration draft.
                  </Description>
                </Card.Header>
                <Card.Content className="space-y-3 text-xs">
                  <BuilderField label="Monitor prompt / description">
                    <BuilderTextArea
                      value={monitorPrompt}
                      onChange={(event) => setMonitorPrompt(event.target.value)}
                      placeholder="e.g. Call https://api.mycompany.com/auth first with client credentials, extract the access_token variable from the response JSON body, then call https://api.mycompany.com/v1/profile using that token in the Authorization header. Run this check every 5 minutes."
                      className="min-h-[90px] resize-none text-xs leading-relaxed"
                    />
                  </BuilderField>

                  <Button
                    size="sm"
                    onPress={async () => {
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
                    isDisabled={promptGenerating || !monitorPrompt.trim()}
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
                        onPress={() => {
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
                            config: defaultHttpConfig(),
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
                </Card.Content>
              </Card>
            </div>
          </Tabs.Panel>
        </Tabs>

          {validationErrors.length > 0 && builderTab !== "json" ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Please fix the following validation errors to save or test</Alert.Title>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </Alert.Content>
            </Alert>
          ) : null}

          {saveState === "saved" ? (
            <Alert status="success">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>Monitor draft has been saved successfully!</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
          {saveState === "error" ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>Failed to save monitor draft.</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
        </div>

        {/* Test Execution Console Dialog */}
        <Modal.Backdrop isOpen={isConsoleOpen} onOpenChange={setIsConsoleOpen}>
          <Modal.Container>
            <Modal.Dialog className="min-w-[80vw] w-full max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-background text-foreground">
              <Modal.CloseTrigger />
              {/* Modal Header */}
              <Modal.Header className="px-6 py-4 border-b border-border/40 shrink-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <TerminalSquare className="size-5 text-primary" />
                    <div className="text-left">
                      <Modal.Heading className="text-sm font-bold tracking-tight">Test Execution Console</Modal.Heading>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Live dry-run of the current monitor draft — nothing is saved to history.
                      </p>
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
              </Modal.Header>

              {/* Modal Body */}
              <Modal.Body className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
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
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>

        {/* Secret Safety Alert Dialog */}
        <AlertDialog.Backdrop isOpen={isSafetyModalOpen} onOpenChange={setIsSafetyModalOpen}>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-md bg-background text-foreground">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="accent" />
                <AlertDialog.Heading className="text-base font-bold flex items-center gap-2 text-amber-600 dark:text-amber-500">
                  <AlertTriangle className="size-5 mr-1" />
                  Security Check: Hardcoded Secrets
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className="text-xs text-muted-foreground mb-4">
                  Pulse Copilot detected potential raw secrets or API keys in your monitor steps. Storing secrets in plain text is not recommended.
                </p>
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
              </AlertDialog.Body>
              <AlertDialog.Footer className="border-t border-border/20 pt-3">
                <Button slot="close" variant="secondary" className="h-9 text-xs cursor-pointer" onPress={() => setIsSafetyModalOpen(false)}>
                  Cancel & Edit
                </Button>
                <Button
                  slot="close"
                  className="h-9 text-xs bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                  onPress={async () => {
                    setIsSafetyModalOpen(false)
                    await saveDraft()
                  }}
                >
                  Save Anyway
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>

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

        <Modal.Backdrop isOpen={isCurlModalOpen} onOpenChange={setIsCurlModalOpen}>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-xl bg-background text-foreground">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Icon className="bg-default text-foreground">
                  <Sparkles className="size-4 text-primary animate-pulse" />
                </Modal.Icon>
                <Modal.Heading className="text-base font-bold flex items-center gap-2">
                  Import HTTP Step from cURL
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="space-y-4 py-2 text-xs">
                <p className="text-xs text-muted-foreground">
                  Paste a standard shell cURL command (e.g. headers, POST body, query strings) and Pulse Copilot will parse it into step settings.
                </p>
                <TextField className="w-full" name="curlInput">
                  <Label className="text-xs font-semibold">cURL command</Label>
                  <TextArea
                    variant="secondary"
                    fullWidth
                    className="min-h-32 font-mono text-xs leading-relaxed"
                    value={curlInput}
                    onChange={(e) => setCurlInput(e.target.value)}
                    placeholder='curl -X POST "https://api.example.com/v1/users" -H "Content-Type: application/json" -d "{\"name\": \"Alice\"}"'
                  />
                </TextField>

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
              </Modal.Body>
              <Modal.Footer className="border-t border-border/20 pt-3">
                <Button
                  slot="close"
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    setIsCurlModalOpen(false)
                    setCurlInput("")
                    setCurlResult(null)
                  }}
                  className="h-9 text-xs cursor-pointer"
                  isDisabled={curlConverting}
                >
                  Cancel
                </Button>
                {!curlResult ? (
                  <Button
                    size="sm"
                    onPress={async () => {
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
                    isDisabled={curlConverting || !curlInput.trim()}
                  >
                    <Sparkles className="size-3.5" /> Convert to Step
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    slot="close"
                    onPress={importCurlStep}
                    className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  >
                    Import Step Configuration
                  </Button>
                )}
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
    </div>
  )
}
