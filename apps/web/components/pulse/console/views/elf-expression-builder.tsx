"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, RotateCw, Trash2 } from "lucide-react"
import {
  Button,
  Description,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from "@workspace/ui/components/ui"
import type {
  ElfCheckConfig,
  ElfCheckRule,
  ElfFieldDescriptor,
  ElfFieldSchema,
  ElfPassCriteria,
  ElfQueryProbeResult,
} from "@/lib/pulse-types"
import {
  checkKindLabel,
  compileRulesPreview,
  defaultOperator,
  newRuleFromField,
  operatorNeedsValue,
  operatorsForType,
} from "@/lib/pulse-elf-rules"
import { ElfCheckBuilder as LegacyTemplateBuilder, type CheckBuilderDraft } from "./elf-check-builder"

export type ExpressionBuilderDraft = {
  checkKind: string
  checkConfig: ElfCheckConfig
  passCriteria: ElfPassCriteria
}

export function ElfExpressionBuilder({
  probe,
  fieldSchema,
  timeField,
  gte,
  lte,
  pendingRule,
  initial,
  onSave,
  onPreview,
  onTestPreview,
  saving,
  testing,
}: {
  probe: ElfQueryProbeResult | null
  fieldSchema: ElfFieldSchema
  timeField: string
  gte: string
  lte: string
  pendingRule?: { rule: ElfCheckRule; key: number } | null
  initial?: Partial<ExpressionBuilderDraft>
  onSave: (draft: ExpressionBuilderDraft) => Promise<void>
  onPreview?: (body: Record<string, unknown>) => void
  onTestPreview?: (body: Record<string, unknown>) => Promise<void>
  saving?: boolean
  testing?: boolean
}) {
  const [rules, setRules] = useState<ElfCheckRule[]>(initial?.checkConfig?.rules || [])
  const [logic, setLogic] = useState<"all" | "any">((initial?.checkConfig?.logic as "all" | "any") || "all")
  const [passWhen, setPassWhen] = useState(initial?.checkConfig?.passWhen || "no_matching_hits")
  const [passThreshold, setPassThreshold] = useState(initial?.checkConfig?.passThreshold || 0)
  const [showLegacy, setShowLegacy] = useState(false)

  const fields = fieldSchema.fields || []
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.path, f])), [fields])
  const hasCondition =
    rules.length > 0 ||
    ["no_matching_hits", "has_matching_hits", "hit_count_lte", "hit_count_gte", "hit_count_gt", "hit_count_eq", "hit_count_lt"].includes(passWhen)

  useEffect(() => {
    if (pendingRule) {
      setRules((current) => [...current, pendingRule.rule])
    }
  }, [pendingRule?.key])

  const previewBody = useMemo(() => {
    if (!hasCondition) return null
    return compileRulesPreview(rules, logic, timeField, gte, lte)
  }, [hasCondition, rules, logic, timeField, gte, lte])

  useEffect(() => {
    if (previewBody && onPreview) onPreview(previewBody)
  }, [previewBody, onPreview])

  if (!probe || probe.errorMessage) {
    return (
      <div className="rounded-md border border-dashed bg-muted/5 p-4 text-sm text-muted-foreground">
        Run a probe first to see logs and build checks.
      </div>
    )
  }

  function addRule(field?: ElfFieldDescriptor) {
    const descriptor = field || fields[0]
    if (!descriptor) return
    setRules((current) => [...current, newRuleFromField(descriptor)])
  }

  function updateRule(id: string | undefined, index: number, patch: Partial<ElfCheckRule>) {
    setRules((current) =>
      current.map((rule, idx) => {
        const key = rule.id || String(idx)
        const target = id || String(index)
        return key === target ? { ...rule, ...patch } : rule
      }),
    )
  }

  function removeRule(index: number) {
    setRules((current) => current.filter((_, idx) => idx !== index))
  }

  async function saveExpression() {
    const checkConfig: ElfCheckConfig = {
      mode: "expression",
      logic,
      rules,
      passWhen,
      passThreshold,
    }
    let passCriteria: ElfPassCriteria = { type: "max_hits", threshold: 0 }
    if (passWhen === "has_matching_hits") passCriteria = { type: "min_hits", threshold: 1 }
    if (passWhen === "hit_count_lte") passCriteria = { type: "max_hits", threshold: passThreshold }
    if (passWhen === "hit_count_gte") passCriteria = { type: "min_hits", threshold: passThreshold || 1 }
    if (passWhen === "hit_count_gt") passCriteria = { type: "total_hits", operator: "gt", threshold: passThreshold }
    if (passWhen === "hit_count_eq") passCriteria = { type: "total_hits", operator: "eq", threshold: passThreshold }
    if (passWhen === "hit_count_lt") passCriteria = { type: "total_hits", operator: "lt", threshold: passThreshold }

    await onSave({ checkKind: "expression", checkConfig, passCriteria })
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Expression check builder</div>
        <Description className="text-xs">Build rules from discovered fields: contains, gte, equals, and more.</Description>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" className="h-8 gap-1" onPress={() => addRule()}>
          <Plus className="size-3.5" />
          Add rule
        </Button>
        <Select selectedKey={logic} onSelectionChange={(key) => setLogic(String(key) as "all" | "any")}>
          <Label className="sr-only">Match logic</Label>
          <Select.Trigger className="h-8 min-w-28">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="all" textValue="Match all rules">Match all<ListBox.ItemIndicator /></ListBox.Item>
              <ListBox.Item id="any" textValue="Match any rule">Match any<ListBox.ItemIndicator /></ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      <div className="space-y-3">
        {rules.length === 0 ? (
          <Description className="text-xs">No rules yet. Add a rule or click a field in the hits table.</Description>
        ) : null}
        {rules.map((rule, index) => {
          const descriptor = fieldMap.get(rule.field) || fields.find((f) => f.path === rule.field)
          const operators = operatorsForType(descriptor?.valueType)
          return (
            <div key={rule.id || index} className="space-y-2 rounded-md border bg-muted/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold">Rule {index + 1}</div>
                <Button size="sm" variant="secondary" className="h-7 w-7 min-w-7 p-0" onPress={() => removeRule(index)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <Select
                selectedKey={rule.field}
                onSelectionChange={(key) => {
                  const field = fieldMap.get(String(key))
                  updateRule(rule.id, index, {
                    field: String(key),
                    operator: defaultOperator(field?.valueType),
                    value: field?.sampleValues?.[0] || "",
                  })
                }}
              >
                <Label>Field</Label>
                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {fields.map((field) => (
                      <ListBox.Item key={field.path} id={field.path} textValue={field.path}>
                        {field.path}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <Select
                selectedKey={rule.operator}
                onSelectionChange={(key) => updateRule(rule.id, index, { operator: String(key) })}
              >
                <Label>Operator</Label>
                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {operators.map((operator) => (
                      <ListBox.Item key={operator} id={operator} textValue={operator}>
                        {operator}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              {operatorNeedsValue(rule.operator) ? (
                <TextField className="w-full">
                  <Label>Value</Label>
                  <Input
                    variant="secondary"
                    fullWidth
                    value={String(rule.value ?? "")}
                    onChange={(e) => updateRule(rule.id, index, { value: e.target.value })}
                    list={descriptor ? `samples-${descriptor.path}` : undefined}
                  />
                  {descriptor?.sampleValues?.length ? (
                    <datalist id={`samples-${descriptor.path}`}>
                      {descriptor.sampleValues.map((sample) => (
                        <option key={sample} value={sample} />
                      ))}
                    </datalist>
                  ) : null}
                </TextField>
              ) : null}
            </div>
          )
        })}
      </div>

      <Select selectedKey={passWhen} onSelectionChange={(key) => setPassWhen(String(key))}>
        <Label>Pass when</Label>
        <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="no_matching_hits" textValue="No logs match rules">No logs match rules<ListBox.ItemIndicator /></ListBox.Item>
            <ListBox.Item id="has_matching_hits" textValue="At least one log matches">At least one log matches<ListBox.ItemIndicator /></ListBox.Item>
            <ListBox.Item id="hit_count_lte" textValue="Hit count at most">Hit count at most<ListBox.ItemIndicator /></ListBox.Item>
            <ListBox.Item id="hit_count_gte" textValue="Hit count at least">Hit count at least<ListBox.ItemIndicator /></ListBox.Item>
            <ListBox.Item id="hit_count_gt" textValue="Hit count greater than">Hit count greater than<ListBox.ItemIndicator /></ListBox.Item>
            <ListBox.Item id="hit_count_eq" textValue="Hit count equals">Hit count equals<ListBox.ItemIndicator /></ListBox.Item>
            <ListBox.Item id="hit_count_lt" textValue="Hit count less than">Hit count less than<ListBox.ItemIndicator /></ListBox.Item>
          </ListBox>
        </Select.Popover>
      </Select>

      {(passWhen === "hit_count_lte" || passWhen === "hit_count_gte" || passWhen === "hit_count_gt" || passWhen === "hit_count_eq" || passWhen === "hit_count_lt") && (
        <TextField className="w-full">
          <Label>Hit threshold</Label>
          <Input
            variant="secondary"
            fullWidth
            type="number"
            value={String(passThreshold)}
            onChange={(e) => setPassThreshold(Number(e.target.value) || 0)}
          />
        </TextField>
      )}

      {previewBody ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">Compiled query preview</div>
          <pre className="max-h-40 overflow-auto rounded-md border bg-muted/10 p-2 font-mono text-[10px]">
            {JSON.stringify(previewBody, null, 2)}
          </pre>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {previewBody && onTestPreview ? (
          <Button variant="secondary" className="w-full" onPress={() => void onTestPreview(previewBody)} isDisabled={testing}>
            {testing ? <RotateCw className="size-4 animate-spin" /> : null}
            {testing ? "Testing rule…" : "Test rule on probe window"}
          </Button>
        ) : null}
        <Button className="w-full" onPress={() => void saveExpression()} isDisabled={saving || !hasCondition}>
          {saving ? "Saving check…" : `Save ${checkKindLabel("expression", rules.length)}`}
        </Button>
      </div>

      <button
        type="button"
        className="text-xs font-semibold text-primary underline"
        onClick={() => setShowLegacy((value) => !value)}
      >
        {showLegacy ? "Hide advanced templates" : "Advanced templates"}
      </button>
      {showLegacy ? (
        <LegacyTemplateBuilder
          probe={probe}
          mapping={{}}
          inferredFields={fields.map((field) => ({
            path: field.path,
            sampleValues: field.sampleValues,
            suggestedRole: field.suggestedRole,
            valueType: field.valueType,
          }))}
          initial={{
            checkKind: initial?.checkKind !== "expression" ? initial?.checkKind : "new_terms",
            checkConfig: initial?.checkConfig,
            passCriteria: initial?.passCriteria || { type: "max_hits", threshold: 0 },
          }}
          onSave={async (draft: CheckBuilderDraft) => {
            await onSave({
              checkKind: draft.checkKind,
              checkConfig: { ...draft.checkConfig, mode: "template", facetField: draft.facetField },
              passCriteria: draft.passCriteria,
            })
          }}
          saving={saving}
        />
      ) : null}
    </div>
  )
}

export { checkKindLabel }
