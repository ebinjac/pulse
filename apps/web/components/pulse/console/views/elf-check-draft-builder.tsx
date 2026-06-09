"use client"

import { Plus, Sparkles } from "lucide-react"
import { Button, Description, Input, Label, ListBox, Select, TextField } from "@heroui/react"
import type { ElfCheckConfig, ElfCheckRule, ElfFieldDescriptor, ElfPassCriteria, ElfQuery, ElfSuggestedCheck } from "@/lib/pulse-types"
import { defaultOperator, operatorNeedsValue, operatorsForType } from "@/lib/pulse-elf-rules"

export type DraftCheck = {
  checkKind: string
  rules: ElfCheckRule[]
  logic: "all" | "any"
  matchMode?: "rules" | "total_hits"
  passWhen: string
  passThreshold: number
  passCriteria: ElfPassCriteria
  gateMode: "blocking" | "advisory"
}

export function draftFromQuery(query: ElfQuery): DraftCheck {
  const config = query.checkConfig || {}
  const passWhen = config.passWhen || "no_matching_hits"
  const rules = config.rules || []
  return {
    checkKind: "expression",
    rules,
    logic: config.logic === "any" ? "any" : "all",
    matchMode: rules.length === 0 && isTotalHitsPassWhen(passWhen) ? "total_hits" : "rules",
    passWhen,
    passThreshold: config.passThreshold || 0,
    passCriteria: query.passCriteria || { type: "max_hits", threshold: 0 },
    gateMode: query.gateMode === "blocking" ? "blocking" : "advisory",
  }
}

export function draftFromSuggestion(suggestion: ElfSuggestedCheck): DraftCheck {
  const passWhen = suggestion.checkConfig?.passWhen || "no_matching_hits"
  const rules = suggestion.checkConfig?.rules || []
  return {
    checkKind: suggestion.checkKind || "expression",
    rules,
    logic: suggestion.checkConfig?.logic === "any" ? "any" : "all",
    matchMode: rules.length === 0 && isTotalHitsPassWhen(passWhen) ? "total_hits" : "rules",
    passWhen,
    passThreshold: suggestion.checkConfig?.passThreshold || 0,
    passCriteria: suggestion.passCriteria || { type: "max_hits", threshold: 0 },
    gateMode: suggestion.gateMode === "blocking" ? "blocking" : "advisory",
  }
}

export function checkConfigFromDraft(draft: DraftCheck): ElfCheckConfig {
  return {
    mode: "expression",
    logic: draft.logic,
    rules: draft.matchMode === "total_hits" ? [] : draft.rules,
    passWhen: draft.passWhen,
    passThreshold: draft.passThreshold,
  }
}

export function passCriteriaFromDraft(draft: DraftCheck): ElfPassCriteria {
  if (draft.passWhen === "has_matching_hits") return { type: "min_hits", threshold: 1 }
  if (draft.passWhen === "hit_count_lte") return { type: "max_hits", threshold: draft.passThreshold }
  if (draft.passWhen === "hit_count_gte") return { type: "min_hits", threshold: draft.passThreshold || 1 }
  if (draft.passWhen === "hit_count_gt") return { type: "total_hits", operator: "gt", threshold: draft.passThreshold }
  if (draft.passWhen === "hit_count_eq") return { type: "total_hits", operator: "eq", threshold: draft.passThreshold }
  if (draft.passWhen === "hit_count_lt") return { type: "total_hits", operator: "lt", threshold: draft.passThreshold }
  return { type: "max_hits", threshold: 0 }
}

export function hasCheckCondition(draft: DraftCheck) {
  return (
    draft.matchMode === "total_hits" ||
    draft.rules.length > 0 ||
    ["no_matching_hits", "has_matching_hits", "hit_count_lte", "hit_count_gte", "hit_count_gt", "hit_count_eq", "hit_count_lt"].includes(
      draft.passWhen,
    )
  )
}

export function naturalLanguagePreview(draft: DraftCheck) {
  if (draft.matchMode === "total_hits") {
    const symbols: Record<string, string> = {
      hit_count_gt: ">",
      hit_count_gte: ">=",
      hit_count_eq: "=",
      hit_count_lte: "<=",
      hit_count_lt: "<",
    }
    return `Pass when OpenSearch hits.total.value ${symbols[draft.passWhen] || ">"} ${draft.passThreshold}.`
  }
  const ruleText = draft.rules.length
    ? draft.rules
        .map((rule) => `${rule.field} ${rule.operator}${operatorNeedsValue(rule.operator) ? ` ${String(rule.value ?? "")}` : ""}`)
        .join(draft.logic === "any" ? " or " : " and ")
    : "the current query and time window"
  const pass =
    draft.passWhen === "no_matching_hits"
      ? "Pass when OpenSearch hits.total.value is 0"
      : draft.passWhen === "has_matching_hits"
        ? "Pass when OpenSearch hits.total.value is at least 1"
        : draft.passWhen === "hit_count_lte"
          ? `Pass when OpenSearch hits.total.value is at most ${draft.passThreshold}`
          : draft.passWhen === "hit_count_gt"
            ? `Pass when OpenSearch hits.total.value is greater than ${draft.passThreshold}`
            : draft.passWhen === "hit_count_eq"
              ? `Pass when OpenSearch hits.total.value equals ${draft.passThreshold}`
              : draft.passWhen === "hit_count_lt"
                ? `Pass when OpenSearch hits.total.value is less than ${draft.passThreshold}`
                : `Pass when OpenSearch hits.total.value is at least ${draft.passThreshold || 1}`
  return `${pass}: ${ruleText}.`
}

function isTotalHitsPassWhen(passWhen: string) {
  return ["hit_count_lte", "hit_count_gte", "hit_count_gt", "hit_count_eq", "hit_count_lt"].includes(passWhen)
}

function passWhenFromTotalHitsOperator(operator: string) {
  switch (operator) {
    case "gt":
      return "hit_count_gt"
    case "gte":
      return "hit_count_gte"
    case "eq":
      return "hit_count_eq"
    case "lte":
      return "hit_count_lte"
    case "lt":
      return "hit_count_lt"
    default:
      return "hit_count_gt"
  }
}

function totalHitsOperatorFromPassWhen(passWhen: string) {
  switch (passWhen) {
    case "hit_count_gt":
      return "gt"
    case "hit_count_gte":
      return "gte"
    case "hit_count_eq":
      return "eq"
    case "hit_count_lte":
      return "lte"
    case "hit_count_lt":
      return "lt"
    default:
      return "gt"
  }
}

function coerceInputValue(value: string, valueType?: string): string | number | boolean {
  if (valueType === "number") {
    const num = Number(value)
    return Number.isNaN(num) ? value : num
  }
  if (valueType === "boolean") {
    if (value === "true") return true
    if (value === "false") return false
  }
  return value
}

export function ElfCheckDraftBuilder({
  fields,
  draft,
  onChange,
  onAddRule,
}: {
  fields: ElfFieldDescriptor[]
  draft: DraftCheck
  onChange: (draft: DraftCheck) => void
  onAddRule: () => void
}) {
  const matchSelection = draft.matchMode === "total_hits" ? "total_hits" : draft.logic
  const isTotalHitsOnly = draft.matchMode === "total_hits"

  function updateRule(index: number, patch: Partial<ElfCheckRule>) {
    const rules = draft.rules.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule))
    onChange({ ...draft, rules })
  }

  function removeRule(index: number) {
    onChange({ ...draft, rules: draft.rules.filter((_, idx) => idx !== index) })
  }

  function updatePass(patch: Partial<DraftCheck>) {
    const next = { ...draft, ...patch }
    next.passCriteria = passCriteriaFromDraft(next)
    onChange(next)
  }

  function updateMatchSelection(value: string) {
    if (value === "total_hits") {
      const next = {
        ...draft,
        matchMode: "total_hits" as const,
        rules: [],
        passWhen: isTotalHitsPassWhen(draft.passWhen) ? draft.passWhen : "hit_count_gt",
        passThreshold: isTotalHitsPassWhen(draft.passWhen) ? draft.passThreshold : 0,
      }
      next.passCriteria = passCriteriaFromDraft(next)
      onChange(next)
      return
    }
    const next = {
      ...draft,
      matchMode: "rules" as const,
      logic: value === "any" ? ("any" as const) : ("all" as const),
      passWhen: isTotalHitsPassWhen(draft.passWhen) ? "no_matching_hits" : draft.passWhen,
    }
    next.passCriteria = passCriteriaFromDraft(next)
    onChange(next)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Select selectedKey={matchSelection} onSelectionChange={(key) => updateMatchSelection(String(key))}>
          <Label>Rule matching</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="total_hits" textValue="Total hits only">
                Total hits only
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="all" textValue="Match all field rules">
                Match all field rules
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="any" textValue="Match any field rule">
                Match any field rule
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
        <Select
          key={isTotalHitsOnly ? "total-hits-operator" : "field-rule-pass-condition"}
          selectedKey={isTotalHitsOnly ? totalHitsOperatorFromPassWhen(draft.passWhen) : draft.passWhen}
          onSelectionChange={(key) => {
            const value = String(key)
            updatePass({ passWhen: isTotalHitsOnly ? passWhenFromTotalHitsOperator(value) : value })
          }}
        >
          <Label>{isTotalHitsOnly ? "hits.total.value" : "Pass when"}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {isTotalHitsOnly ? (
                <>
                  <ListBox.Item id="gt" textValue="is greater than">
                    is greater than
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="gte" textValue="is greater than or equal to">
                    is greater than or equal to
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="eq" textValue="equals">
                    equals
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="lte" textValue="is less than or equal to">
                    is less than or equal to
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="lt" textValue="is less than">
                    is less than
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </>
              ) : (
                <>
                  <ListBox.Item id="no_matching_hits" textValue="No logs match field rules">
                    No logs match field rules
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="has_matching_hits" textValue="At least one log matches field rules">
                    At least one log matches field rules
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="hit_count_lte" textValue="Matching logs at most">
                    Matching logs at most
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="hit_count_gte" textValue="Matching logs at least">
                    Matching logs at least
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="hit_count_eq" textValue="Matching logs equals">
                    Matching logs equals
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </>
              )}
            </ListBox>
          </Select.Popover>
        </Select>
        <Select
          selectedKey={draft.gateMode}
          onSelectionChange={(key) => onChange({ ...draft, gateMode: String(key) === "blocking" ? "blocking" : "advisory" })}
        >
          <Label>Gate mode</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="blocking" textValue="Blocking">
                Blocking
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="advisory" textValue="Advisory">
                Advisory
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      {(isTotalHitsOnly ||
        draft.passWhen === "hit_count_lte" ||
        draft.passWhen === "hit_count_gte" ||
        draft.passWhen === "hit_count_gt" ||
        draft.passWhen === "hit_count_eq" ||
        draft.passWhen === "hit_count_lt") && (
        <TextField className="max-w-xs">
          <Label>{isTotalHitsOnly ? "Threshold" : "Matching log threshold"}</Label>
          <Input
            variant="secondary"
            type="number"
            value={String(draft.passThreshold)}
            onChange={(event) => updatePass({ passThreshold: Number(event.target.value) || 0 })}
          />
        </TextField>
      )}

      {!isTotalHitsOnly ? (
        <div className="space-y-3">
          {draft.rules.map((rule, index) => {
            const descriptor = fields.find((field) => field.path === rule.field)
            const operators = operatorsForType(descriptor?.valueType)
            return (
              <div
                key={rule.id || index}
                className="grid gap-3 rounded-lg border bg-muted/5 p-3 md:grid-cols-[minmax(0,1fr)_180px_minmax(160px,220px)_auto]"
              >
                <Select
                  selectedKey={rule.field}
                  onSelectionChange={(key) => {
                    const field = fields.find((item) => item.path === String(key))
                    updateRule(index, {
                      field: String(key),
                      operator: defaultOperator(field?.valueType),
                      value: field?.sampleValues?.[0] || "",
                    })
                  }}
                >
                  <Label>Field</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
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
                <Select selectedKey={rule.operator} onSelectionChange={(key) => updateRule(index, { operator: String(key) })}>
                  <Label>Operator</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
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
                  <TextField>
                    <Label>Value</Label>
                    <Input
                      variant="secondary"
                      value={String(rule.value ?? "")}
                      onChange={(event) => updateRule(index, { value: coerceInputValue(event.target.value, descriptor?.valueType) })}
                    />
                  </TextField>
                ) : (
                  <div />
                )}
                <Button variant="secondary" className="self-end" onPress={() => removeRule(index)}>
                  Remove
                </Button>
              </div>
            )
          })}
        </div>
      ) : null}

      {!isTotalHitsOnly ? (
        <Button variant="secondary" className="gap-2" onPress={onAddRule} isDisabled={fields.length === 0}>
          <Plus className="size-4" />
          Add field rule
        </Button>
      ) : (
        <Description className="rounded-lg border border-dashed bg-muted/5 p-3 text-sm">
          This check uses the OpenSearch response count directly, so no field rule is needed.
        </Description>
      )}
    </div>
  )
}
