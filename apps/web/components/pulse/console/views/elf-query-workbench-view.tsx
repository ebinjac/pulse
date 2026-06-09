"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Play, RotateCw, Save, Search, ShieldCheck } from "lucide-react"
import { Button, Tabs } from "@heroui/react"
import { notifyPulseToast } from "@/components/pulse/pulse-toast-queue"
import { elfCopilotClient } from "@/lib/elf-copilot-client"
import { pulseClient } from "@/lib/pulse-client"
import { compileRulesPreview, newRuleFromField } from "@/lib/pulse-elf-rules"
import type {
  Application,
  ApplicationService,
  ElfCopilotQueryRepair,
  ElfCopilotResultExplanation,
  ElfCopilotSummary,
  ElfFieldDescriptor,
  ElfFieldSchema,
  ElfQuery,
  ElfQueryInput,
  ElfQueryProbeInput,
  ElfQueryProbeResult,
  ElfQueryValidateCheckResult,
  ElfSuggestedCheck,
} from "@/lib/pulse-types"
import { PageShell } from "@/components/pulse/console-shared"
import { inferredToDescriptors } from "./elf-field-catalog"
import {
  checkConfigFromDraft,
  draftFromQuery,
  draftFromSuggestion,
  hasCheckCondition,
  type DraftCheck,
} from "./elf-check-draft-builder"
import { ElfWorkbenchCheckTab } from "./elf-workbench-check-tab"
import { ElfWorkbenchExploreTab } from "./elf-workbench-explore-tab"
import { ElfWorkbenchMetrics } from "./elf-workbench-metrics"

function defaultTimeRange() {
  const lte = new Date()
  const gte = new Date(lte.getTime() - 5 * 60_000)
  return { gte: gte.toISOString(), lte: lte.toISOString(), field: "@timestamp" }
}

type WorkbenchTab = "explore" | "check"

export function ElfQueryWorkbenchView({
  query,
  applications,
  elfProxyIndexPattern,
  onSaveQuery,
  onProbeQuery,
}: {
  query: ElfQuery
  applications: Application[]
  elfProxyIndexPattern?: string
  onSaveQuery: (queryId: string | null, input: ElfQueryInput) => Promise<ElfQuery | null>
  onProbeQuery: (queryId: string, input: ElfQueryProbeInput) => Promise<{ ok: boolean; probe?: ElfQueryProbeResult; query?: ElfQuery }>
}) {
  const [effectiveQuery, setEffectiveQuery] = useState(query)
  useEffect(() => setEffectiveQuery(query), [query])

  const application = useMemo(
    () => applications.find((app) => app.id === effectiveQuery.applicationId),
    [applications, effectiveQuery.applicationId],
  )
  const appId = effectiveQuery.applicationId || application?.id

  const [services, setServices] = useState<ApplicationService[]>([])
  const [serviceId, setServiceId] = useState(effectiveQuery.serviceId || "")
  const [fieldSchema, setFieldSchema] = useState<ElfFieldSchema>(effectiveQuery.fieldSchema || { fields: [] })
  const [probe, setProbe] = useState<ElfQueryProbeResult | null>(null)
  const [timeRange, setTimeRange] = useState(() => ({
    gte: effectiveQuery.probeConfig?.defaultGte || defaultTimeRange().gte,
    lte: effectiveQuery.probeConfig?.defaultLte || defaultTimeRange().lte,
    field: effectiveQuery.probeConfig?.timeField || effectiveQuery.fieldSchema?.timeField || "@timestamp",
  }))
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("explore")
  const [draft, setDraft] = useState<DraftCheck>(() => draftFromQuery(effectiveQuery))
  const [validateResult, setValidateResult] = useState<ElfQueryValidateCheckResult | null>(null)
  const [probing, setProbing] = useState(false)
  const [validating, setValidating] = useState(false)
  const [savingContext, setSavingContext] = useState(false)
  const [savingCheck, setSavingCheck] = useState(false)
  const [copilotBusy, setCopilotBusy] = useState<string | null>(null)
  const [aiSummary, setAiSummary] = useState<ElfCopilotSummary | null>(null)
  const [aiSuggestions, setAiSuggestions] = useState<ElfSuggestedCheck[]>([])
  const [naturalLanguagePrompt, setNaturalLanguagePrompt] = useState("")
  const [repairResult, setRepairResult] = useState<ElfCopilotQueryRepair | null>(null)
  const [resultExplanation, setResultExplanation] = useState<ElfCopilotResultExplanation | null>(null)

  useEffect(() => {
    if (!appId) {
      setServices([])
      return
    }
    void pulseClient.listApplicationServices(appId).then(setServices)
  }, [appId])

  useEffect(() => {
    if (effectiveQuery.fieldSchema?.fields?.length) {
      setFieldSchema(effectiveQuery.fieldSchema)
    }
  }, [effectiveQuery.fieldSchema])

  const selectedService = services.find((service) => service.id === serviceId)
  const discoveredSchema = useMemo(() => {
    if (probe?.fieldSchema?.fields?.length) return probe.fieldSchema
    if (probe?.inferredFields?.length) {
      return { fields: inferredToDescriptors(probe.inferredFields), discoveredAt: new Date().toISOString() }
    }
    return undefined
  }, [probe])

  const fields = useMemo(() => {
    const map = new Map<string, ElfFieldDescriptor>()
    for (const field of discoveredSchema?.fields || []) map.set(field.path, field)
    for (const field of fieldSchema.fields || []) map.set(field.path, { ...map.get(field.path), ...field })
    return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path))
  }, [fieldSchema.fields, discoveredSchema])

  const resolvedIndex =
    effectiveQuery.indexPathTemplate ||
    selectedService?.indexPathTemplate ||
    application?.indexPathTemplate ||
    elfProxyIndexPattern ||
    "default"

  const previewBody = useMemo(() => {
    if (!hasCheckCondition(draft)) return null
    return compileRulesPreview(
      draft.matchMode === "total_hits" ? [] : draft.rules,
      draft.logic,
      timeRange.field,
      timeRange.gte,
      timeRange.lte,
    )
  }, [draft, timeRange.field, timeRange.gte, timeRange.lte])

  const suggestions = useMemo(
    () => [
      ...(probe?.suggestedChecks || []).map((suggestion) => ({ ...suggestion, source: suggestion.source || "deterministic" })),
      ...aiSuggestions,
    ],
    [probe?.suggestedChecks, aiSuggestions],
  )

  function copilotInput(extra?: Record<string, unknown>) {
    return {
      query: {
        id: effectiveQuery.id,
        name: effectiveQuery.name,
        description: effectiveQuery.description,
        elfAppId: effectiveQuery.elfAppId || application?.elfAppId,
        indexPathTemplate: effectiveQuery.indexPathTemplate || resolvedIndex,
        searchBody: effectiveQuery.searchBody,
        checkKind: effectiveQuery.checkKind,
        checkConfig: effectiveQuery.checkConfig,
        passCriteria: effectiveQuery.passCriteria,
        gateMode: effectiveQuery.gateMode,
      },
      application: application
        ? { id: application.id, name: application.name, carId: application.carId, environment: application.environment }
        : null,
      service: selectedService
        ? {
            id: selectedService.id,
            name: selectedService.name,
            environment: selectedService.environment,
            indexPathTemplate: selectedService.indexPathTemplate,
          }
        : null,
      timeRange,
      resolvedIndex,
      probe,
      fieldSchema: { ...fieldSchema, fields, timeField: timeRange.field },
      detectedFields: fields,
      draft: {
        checkKind: draft.checkKind,
        checkConfig: checkConfigFromDraft(draft),
        passCriteria: draft.passCriteria,
        gateMode: draft.gateMode,
      },
      validationResult: validateResult,
      ...extra,
    }
  }

  async function runCopilot<T>(label: string, action: () => Promise<T>) {
    setCopilotBusy(label)
    try {
      return await action()
    } catch (err) {
      notify("danger", errorMessage(err, "Copilot request failed."))
      return null
    } finally {
      setCopilotBusy(null)
    }
  }

  async function runProbe() {
    setProbing(true)
    try {
      const result = await onProbeQuery(effectiveQuery.id, {
        applicationId: effectiveQuery.applicationId || application?.id,
        serviceId: serviceId || undefined,
        elfAppId: effectiveQuery.elfAppId || application?.elfAppId,
        timeRange: { gte: timeRange.gte, lte: timeRange.lte, field: timeRange.field },
        saveProbeSummary: true,
      })
      if (result.probe) {
        setProbe(result.probe)
        if (result.probe.fieldSchema?.fields?.length) {
          setFieldSchema(result.probe.fieldSchema)
        } else if (result.probe.inferredFields?.length) {
          setFieldSchema({ fields: inferredToDescriptors(result.probe.inferredFields) })
        }
        if (result.probe.injectedTimeRange?.field) {
          setTimeRange((current) => ({ ...current, field: result.probe?.injectedTimeRange?.field || current.field }))
        }
        notify(
          result.probe.errorMessage ? "warning" : "success",
          result.probe.errorMessage || `Probe completed with ${result.probe.hitCount ?? 0} hits.`,
        )
      }
      if (result.query) setEffectiveQuery(result.query)
    } catch (err) {
      notify("danger", errorMessage(err, "Probe failed."))
    } finally {
      setProbing(false)
    }
  }

  async function saveContext() {
    setSavingContext(true)
    try {
      const saved = await onSaveQuery(effectiveQuery.id, {
        name: effectiveQuery.name,
        description: effectiveQuery.description,
        elfAppId: effectiveQuery.elfAppId,
        indexPathTemplate: effectiveQuery.indexPathTemplate,
        gateMode: draft.gateMode,
        passCriteria: effectiveQuery.passCriteria || { type: "max_hits", threshold: 0 },
        applicationId: effectiveQuery.applicationId,
        serviceId: serviceId || undefined,
        probeConfig: {
          timeField: timeRange.field,
          defaultGte: timeRange.gte,
          defaultLte: timeRange.lte,
        },
        fieldSchema: { ...fieldSchema, fields, timeField: timeRange.field },
        checkKind: effectiveQuery.checkKind,
        checkConfig: effectiveQuery.checkConfig,
        generatedSearchBody: objectOrUndefined(effectiveQuery.generatedSearchBody),
        tags: effectiveQuery.tags,
        isActive: effectiveQuery.isActive,
      })
      if (saved) setEffectiveQuery(saved)
      notify("success", "Context saved. Probe window and discovered fields are now persisted.")
    } catch (err) {
      notify("danger", errorMessage(err, "Failed to save context."))
    } finally {
      setSavingContext(false)
    }
  }

  async function explainProbeWithAI() {
    const data = await runCopilot("explain-probe", () => elfCopilotClient.explainProbe(copilotInput()))
    if (!data) return
    setAiSummary(data.result)
    notify("success", "Copilot summarized the current probe.")
  }

  async function generateChecksWithAI() {
    const data = await runCopilot("generate-checks", () => elfCopilotClient.generateChecks(copilotInput()))
    if (!data) return
    setAiSuggestions(
      (data.suggestions || []).map((suggestion, index) => ({
        ...suggestion,
        id: suggestion.id || `ai-check-${index + 1}`,
        source: "ai",
        matchCount: suggestion.matchCount ?? 0,
      })),
    )
    notify("success", `Copilot generated ${data.suggestions?.length || 0} check suggestions.`)
  }

  async function createNaturalLanguageCheck() {
    const prompt = naturalLanguagePrompt.trim()
    if (!prompt) {
      notify("warning", "Describe what you want the ELF check to catch.")
      return
    }
    const data = await runCopilot("natural-language-check", () =>
      elfCopilotClient.naturalLanguageCheck(copilotInput({ userPrompt: prompt })),
    )
    if (!data?.suggestion) return
    const nextDraft = draftFromSuggestion({ ...data.suggestion, source: "ai" })
    setDraft(nextDraft)
    setValidateResult(null)
    setActiveTab("check")
    notify("success", "Copilot created a check from your request. Testing it now.")
    await validateCheck(nextDraft)
  }

  async function repairQueryWithAI() {
    const data = await runCopilot("repair-query", () =>
      elfCopilotClient.repairQuery(copilotInput({ errorMessage: probe?.errorMessage || "Probe did not discover usable fields." })),
    )
    if (!data) return
    setRepairResult(data.result)
    notify("success", "Copilot proposed a query repair. Review it before saving anything.")
  }

  async function explainResultWithAI() {
    if (!validateResult) {
      notify("warning", "Test the check before asking Copilot to explain the result.")
      return
    }
    const data = await runCopilot("explain-result", () => elfCopilotClient.explainResult(copilotInput({ validationResult: validateResult })))
    if (!data) return
    setResultExplanation(data.result)
    notify("success", "Copilot explained the check result.")
  }

  async function validateCheck(draftOverride?: DraftCheck) {
    const targetDraft = draftOverride || draft
    if (!hasCheckCondition(targetDraft)) {
      notify("warning", "Add a field rule or choose an OpenSearch total hits condition before testing.")
      return
    }
    setValidating(true)
    try {
      const result = await pulseClient.validateElfQueryCheck(effectiveQuery.id, {
        applicationId: effectiveQuery.applicationId || application?.id,
        serviceId: serviceId || undefined,
        elfAppId: effectiveQuery.elfAppId || application?.elfAppId,
        timeRange,
        checkKind: targetDraft.checkKind,
        checkConfig: checkConfigFromDraft(targetDraft),
        passCriteria: targetDraft.passCriteria,
        fieldSchema: { ...fieldSchema, fields, timeField: timeRange.field },
        fieldMapping: effectiveQuery.fieldMapping,
      })
      setValidateResult(result)
      if (result.probe) setProbe(result.probe)
      notify(
        result.gateResult === "pass" ? "success" : result.gateResult === "warning" ? "warning" : "danger",
        result.reason || `Check ${result.criteriaResult || "completed"} with ${result.probe?.hitCount ?? 0} matching hits.`,
      )
    } catch (err) {
      notify("danger", errorMessage(err, "Failed to validate check."))
    } finally {
      setValidating(false)
    }
  }

  async function saveCheck() {
    if (!hasCheckCondition(draft)) {
      notify("warning", "Add a field rule or choose an OpenSearch total hits condition before saving.")
      return
    }
    setSavingCheck(true)
    try {
      const saved = await onSaveQuery(effectiveQuery.id, {
        name: effectiveQuery.name,
        description: effectiveQuery.description,
        elfAppId: effectiveQuery.elfAppId,
        indexPathTemplate: effectiveQuery.indexPathTemplate,
        gateMode: draft.gateMode,
        passCriteria: draft.passCriteria,
        applicationId: effectiveQuery.applicationId,
        serviceId: serviceId || undefined,
        probeConfig: {
          timeField: timeRange.field,
          defaultGte: timeRange.gte,
          defaultLte: timeRange.lte,
        },
        fieldMapping: effectiveQuery.fieldMapping,
        fieldSchema: { ...fieldSchema, fields, timeField: timeRange.field },
        checkKind: draft.checkKind,
        checkConfig: checkConfigFromDraft(draft),
        tags: effectiveQuery.tags,
        isActive: effectiveQuery.isActive,
      })
      if (saved) setEffectiveQuery(saved)
      notify("success", "Check saved. This ELF query can now be attached to deployment validation.")
    } catch (err) {
      notify("danger", errorMessage(err, "Failed to save check."))
    } finally {
      setSavingCheck(false)
    }
  }

  function applySuggestion(suggestion: ElfSuggestedCheck) {
    setDraft(draftFromSuggestion(suggestion))
    setValidateResult(null)
  }

  function addRule(field?: ElfFieldDescriptor, value?: unknown) {
    const descriptor = field || fields[0]
    if (!descriptor) return
    setDraft((current) => ({
      ...current,
      rules: [...current.rules, newRuleFromField(descriptor, value != null ? String(value) : undefined)],
    }))
  }

  function handleAddRuleFromField(path: string, value?: string) {
    const field = fields.find((item) => item.path === path)
    if (field) addRule(field, value)
    setActiveTab("check")
  }

  return (
    <PageShell
      eyebrow="Log inquiry"
      title={effectiveQuery.name}
      description={effectiveQuery.description || "Probe OpenSearch, understand dynamic logs, and build deployment checks."}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/elf-queries">
            <Button variant="secondary" className="h-9 gap-2">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </Link>
          <Button className="h-9 gap-2" onPress={() => void runProbe()} isDisabled={probing}>
            {probing ? <RotateCw className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run probe
          </Button>
          <Button
            variant="secondary"
            className="h-9 gap-2"
            onPress={() => void saveCheck()}
            isDisabled={savingCheck || !hasCheckCondition(draft)}
          >
            {savingCheck ? <RotateCw className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save check
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <ElfWorkbenchMetrics
          query={effectiveQuery}
          probe={probe}
          resolvedIndex={resolvedIndex}
          draft={draft}
          validateResult={validateResult}
        />

        <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(String(key) as WorkbenchTab)} variant="secondary">
          <Tabs.ListContainer>
            <Tabs.List aria-label="ELF workbench sections">
              <Tabs.Tab id="explore" className="gap-2">
                <Search className="size-4 shrink-0" />
                <span className="text-xs font-semibold">Explore logs</span>
                <Tabs.Indicator className="bg-primary" />
              </Tabs.Tab>
              <Tabs.Tab id="check" className="gap-2">
                <ShieldCheck className="size-4 shrink-0" />
                <span className="text-xs font-semibold">Deployment check</span>
                <Tabs.Indicator className="bg-primary" />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="explore" className="pt-4">
            <ElfWorkbenchExploreTab
              query={effectiveQuery}
              application={application}
              services={services}
              serviceId={serviceId}
              onServiceChange={setServiceId}
              resolvedIndex={resolvedIndex}
              timeRange={timeRange}
              onTimeRangeChange={(next) => {
                setTimeRange(next)
                setFieldSchema((current) => ({ ...current, timeField: next.field }))
              }}
              probe={probe}
              savingContext={savingContext}
              onSaveContext={() => void saveContext()}
              onAddRuleFromField={handleAddRuleFromField}
              aiSummary={aiSummary}
              repairResult={repairResult}
              onExplainProbe={() => void explainProbeWithAI()}
              onRepairQuery={() => void repairQueryWithAI()}
              copilotBusy={copilotBusy}
            />
          </Tabs.Panel>

          <Tabs.Panel id="check" className="pt-4">
            <ElfWorkbenchCheckTab
              probe={probe}
              fields={fields}
              draft={draft}
              onDraftChange={(next) => {
                setDraft(next)
                setValidateResult(null)
              }}
              onAddRule={() => addRule()}
              previewBody={previewBody}
              suggestions={suggestions}
              onUseSuggestion={applySuggestion}
              onGenerateAISuggestions={() => void generateChecksWithAI()}
              aiSuggestionsBusy={copilotBusy === "generate-checks"}
              naturalLanguagePrompt={naturalLanguagePrompt}
              onNaturalLanguageChange={setNaturalLanguagePrompt}
              onNaturalLanguageGenerate={() => void createNaturalLanguageCheck()}
              naturalLanguageBusy={copilotBusy === "natural-language-check" || validating}
              validateResult={validateResult}
              validating={validating}
              onValidate={() => void validateCheck()}
              savingCheck={savingCheck}
              onSaveCheck={() => void saveCheck()}
              resultExplanation={resultExplanation}
              onExplainResult={() => void explainResultWithAI()}
              explainResultBusy={copilotBusy === "explain-result"}
            />
          </Tabs.Panel>
        </Tabs>
      </div>
    </PageShell>
  )
}

function objectOrUndefined(value: ElfQuery["generatedSearchBody"]): Record<string, unknown> | undefined {
  if (!value) return undefined
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === "object" && parsed && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

function notify(status: "success" | "danger" | "warning", message: string) {
  notifyPulseToast(status, message)
}
