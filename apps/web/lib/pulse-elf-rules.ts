import type { ElfCheckRule, ElfFieldDescriptor } from "@/lib/pulse-types"

export function operatorsForType(valueType?: string): string[] {
  switch ((valueType || "string").toLowerCase()) {
    case "number":
      return ["eq", "neq", "gte", "lte", "gt", "lt", "exists", "not_exists"]
    case "date":
      return ["gte", "lte", "gt", "lt", "exists", "not_exists"]
    case "boolean":
      return ["eq", "neq", "exists", "not_exists"]
    default:
      return ["contains", "not_contains", "eq", "neq", "regex", "exists", "not_exists"]
  }
}

export function defaultOperator(valueType?: string): string {
  return operatorsForType(valueType)[0] || "contains"
}

export function operatorNeedsValue(operator: string): boolean {
  return !["exists", "not_exists"].includes(operator)
}

export function compileRulesPreview(
  rules: ElfCheckRule[],
  logic: "all" | "any",
  timeField: string,
  gte: string,
  lte: string,
): Record<string, unknown> {
  const clauses = rules.map((rule) => compileRuleClause(rule))
  const boolQuery: Record<string, unknown> = clauses.length
    ? logic === "any"
      ? { should: clauses, minimum_should_match: 1 }
      : { must: clauses }
    : { must: [{ match_all: {} }] }
  return {
    size: 0,
    track_total_hits: true,
    query: {
      bool: {
        ...boolQuery,
        filter: [{ range: { [timeField]: { gte, lte } } }],
      },
    },
  }
}

function compileRuleClause(rule: ElfCheckRule): Record<string, unknown> {
  const field = rule.field
  const operator = rule.operator
  const value = rule.value
  switch (operator) {
    case "contains":
      return { match_phrase: { [field]: String(value ?? "") } }
    case "not_contains":
      return { bool: { must_not: [{ match_phrase: { [field]: String(value ?? "") } }] } }
    case "eq":
      return { term: { [field]: coerceValue(value) } }
    case "neq":
      return { bool: { must_not: [{ term: { [field]: coerceValue(value) } }] } }
    case "gte":
    case "lte":
    case "gt":
    case "lt":
      return { range: { [field]: { [operator]: coerceValue(value) } } }
    case "exists":
      return { exists: { field } }
    case "not_exists":
      return { bool: { must_not: [{ exists: { field } }] } }
    case "regex":
      return { regexp: { [field]: String(value ?? "") } }
    default:
      return { match_phrase: { [field]: String(value ?? "") } }
  }
}

function coerceValue(value: ElfCheckRule["value"]) {
  if (typeof value === "number" || typeof value === "boolean") return value
  const text = String(value ?? "")
  if (text === "true") return true
  if (text === "false") return false
  const num = Number(text)
  if (!Number.isNaN(num) && text.trim() !== "") return num
  return text
}

export function newRuleFromField(field: ElfFieldDescriptor, sampleValue?: string): ElfCheckRule {
  const operator = defaultOperator(field.valueType)
  return {
    id: crypto.randomUUID(),
    field: field.path,
    operator,
    value: operatorNeedsValue(operator) ? sampleValue || field.sampleValues?.[0] || "" : undefined,
  }
}

export function checkKindLabel(kind?: string, ruleCount?: number) {
  if (kind === "expression") {
    return ruleCount ? `Expression (${ruleCount} rules)` : "Expression"
  }
  const labels: Record<string, string> = {
    new_terms: "New exceptions",
    delta_pct: "Metric spike",
    threshold: "Latency threshold",
    hit_count: "Hit count",
    message_match: "Message match",
    raw: "Raw",
  }
  return labels[kind || ""] || kind || "Raw"
}
