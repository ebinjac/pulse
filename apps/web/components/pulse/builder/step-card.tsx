"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import {
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  CheckCircle2,
  Code2,
  Cookie,
  Copy,
  Edit3,
  FileKey,
  Globe,
  Hash,
  KeyRound,
  ListFilter,
  Loader2,
  Plus,
  PlusCircle,
  RotateCw,
  Settings,
  Sparkles,
  Terminal,
  TerminalSquare,
  Trash2,
  X,
  XCircle,
} from "lucide-react"
import Editor from "@monaco-editor/react"
import { useTheme } from "next-themes"
import type { CertificateProfile, MonitorRun, MonitorStep, PreRequestAction, PulseAssertion, PulseExtractor } from "@/lib/pulse-types"
import type { TemplateSuggestion } from "../template-intelligence"
import { SyntheticStepEditor } from "../synthetic-step-editor"
import { ScriptEditor } from "../script-editor"
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Chip,
  Description,
  EmptyState,
  Label,
  ListBox,
  Tabs,
} from "@workspace/ui/components/ui"
import { cn } from "@workspace/ui/lib/utils"
import { suggestAssertions, suggestExtractors } from "./builder-copilot"
import {
  BuilderCheckboxField,
  BuilderField,
  BuilderInput,
  BuilderSelect,
  BuilderTextArea,
  builderControlClass,
  methodChipFallback,
  methodColors,
} from "./builder-controls"
import { defaultHttpConfig, queryParamsFromUrl, urlWithQueryParams, checkAssertionFailed } from "./draft-state"
import { BuilderTemplateField, TemplateBodyEditor, TemplateInput } from "./template-input"

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

export function StepCard({ step, index, totalSteps, mockRun, suggestions, certificateProfiles, onUpdate, onDelete, onMoveUp, onMoveDown }: StepCardProps) {
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
      const suggestions = await suggestExtractors({
        url: step.url ?? "",
        method: step.method ?? "GET",
        statusCode: finalStepResult.errorMessage ? 0 : 200,
        responseBody: finalStepResult.responseSummary,
      })
      setAiExtractorSuggestions(suggestions)
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
      const suggestions = await suggestAssertions({
        url: step.url ?? "",
        method: step.method ?? "GET",
        statusCode: finalStepResult.errorMessage ? 0 : 200,
        responseBody: finalStepResult.responseSummary,
      })
      setAiSuggestions(suggestions)
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

  const syntheticActualKeys =
    step.type === "dns"
      ? ["records", "cname", "responseTime"]
      : step.type === "tcp"
        ? ["port", "responseTime"]
        : step.type === "tls"
          ? ["certExpiryDays", "certExpiresAt", "tlsVersion", "responseTime"]
          : ["responseTime"]

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
                  <div className=" flex flex-col">
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
                  <div className=" flex flex-col">
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
            <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Synthetic assertions</div>
                <div className="flex flex-wrap gap-1.5">
                  {syntheticActualKeys.map((key) => (
                    <Chip key={key} size="sm" variant="soft" className="font-mono text-[10px]">
                      <Chip.Label>{key}</Chip.Label>
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {step.assertions.length ? (
                  step.assertions.map((assertion) => (
                    <div key={assertion.id} className="flex items-center justify-between gap-2 rounded-md border border-border/30 bg-muted/5 px-2.5 py-1.5 text-xs">
                      <div className="min-w-0 truncate">
                        <span className="font-semibold uppercase text-primary">{assertion.type}</span>
                        <span className="mx-1 text-muted-foreground/60">·</span>
                        <span className="font-mono text-muted-foreground">{assertion.target}</span>
                        <span className="mx-1 text-[10px] font-semibold uppercase text-muted-foreground/70">{assertion.operator}</span>
                        <span className="rounded bg-accent px-1 font-mono text-white">{assertion.expected}</span>
                      </div>
                      <Button
                        variant="ghost"
                        isIconOnly
                        type="button"
                        onPress={() => handleDeleteAssertion(assertion.id)}
                        className="size-6 shrink-0 text-rose-500"
                        aria-label={`Delete assertion ${assertion.label}`}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-xs italic text-muted-foreground">No synthetic assertions added yet.</div>
                )}
              </div>
              <div className="grid grid-cols-1 items-start gap-3 border-t border-border/30 pt-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_3.5rem]">
                <BuilderSelect
                  label="Assert type"
                  ariaLabel="Synthetic assert type"
                  selectedKey={assertType}
                  onSelectionChange={setAssertType}
                >
                  <ListBox>
                    <ListBox.Item id="responseTime" textValue="Response Time">
                      Response Time
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="dnsRecords" textValue="DNS records">
                      DNS records
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="certExpiryDays" textValue="TLS cert expiry days">
                      TLS cert expiry days
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item id="header" textValue="Actual key">
                      Actual key
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </BuilderSelect>
                <BuilderSelect
                  label="Target"
                  ariaLabel="Synthetic assertion target"
                  selectedKey={assertTarget || syntheticActualKeys[0] || "responseTime"}
                  onSelectionChange={setAssertTarget}
                >
                  <ListBox>
                    {syntheticActualKeys.map((key) => (
                      <ListBox.Item key={key} id={key} textValue={key}>
                        {key}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </BuilderSelect>
                <BuilderSelect
                  label="Operator"
                  ariaLabel="Synthetic assertion operator"
                  selectedKey={assertOperator}
                  onSelectionChange={setAssertOperator}
                >
                  <ListBox>
                    {["equals", "contains", "greaterThan", "lessThan", "exists", "matchesRegex"].map((operator) => (
                      <ListBox.Item key={operator} id={operator} textValue={operator}>
                        {operator}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </BuilderSelect>
                <BuilderField label="Expected">
                  <BuilderInput
                    placeholder={step.type === "tls" ? "30" : "expected value"}
                    className={builderControlClass}
                    value={assertExpected}
                    onChange={(event) => setAssertExpected(event.target.value)}
                  />
                </BuilderField>
                <div className="flex h-full items-end">
                  <Button
                    variant="secondary"
                    isIconOnly
                    type="button"
                    onPress={handleAddAssertion}
                    className="size-9"
                    aria-label="Add synthetic assertion"
                  >
                    <PlusCircle className="size-4" />
                  </Button>
                </div>
              </div>
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
