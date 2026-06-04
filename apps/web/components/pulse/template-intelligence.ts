import type { Monitor, MonitorRun } from "@/lib/pulse-types"

export type TemplateSuggestionKind = "variable" | "secret" | "runtime"

export interface TemplateSuggestion {
  key: string
  label: string
  token: string
  scriptAccessor: string
  detail: string
  kind: TemplateSuggestionKind
}

export function buildTemplateSuggestions(monitor: Monitor, latestRun?: MonitorRun | null): TemplateSuggestion[] {
  const suggestions = new Map<string, TemplateSuggestion>()

  for (const key of Object.keys(monitor.variables || {})) {
    addVariableSuggestion(suggestions, key, "Monitor variable")
  }

  for (const alias of monitor.secretAliases || []) {
    const key = alias.trim()
    if (!key) continue
    suggestions.set(`secret:${key}`, {
      key,
      label: `secrets.${key}`,
      token: `{{secrets.${key}}}`,
      scriptAccessor: `pm.secrets.get("${key}")`,
      detail: "Encrypted secret alias",
      kind: "secret",
    })
  }

  for (const step of monitor.steps || []) {
    for (const key of scriptAssignedVariables(step.preRequestScript || "")) {
      addVariableSuggestion(suggestions, key, `Set in script: ${step.name}`)
    }
    for (const action of step.actions || []) {
      if (action.output) {
        addVariableSuggestion(suggestions, action.output, `Output from ${step.name}`)
      }
    }
    for (const extractor of step.extractors || []) {
      if (extractor.name) {
        addVariableSuggestion(suggestions, extractor.name, `Extractor from ${step.name}`)
      }
    }
  }

  for (const step of latestRun?.steps || []) {
    for (const key of Object.keys(step.extractedVars || {})) {
      addVariableSuggestion(suggestions, key, `Extracted from latest run: ${step.stepName}`)
    }
  }

  return Array.from(suggestions.values()).sort((a, b) => a.label.localeCompare(b.label))
}

function scriptAssignedVariables(script: string) {
  const keys = new Set<string>()
  const pattern = /pm\.(?:variables|environment)\.set\(\s*(["'`])([^"'`]+)\1/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(script)) !== null) {
    const key = match[2]?.trim()
    if (key) keys.add(key)
  }
  return keys
}

function addVariableSuggestion(suggestions: Map<string, TemplateSuggestion>, key: string, detail: string) {
  const cleanKey = key.trim()
  if (!cleanKey) return
  suggestions.set(`variable:${cleanKey}`, {
    key: cleanKey,
    label: `variables.${cleanKey}`,
    token: `{{variables.${cleanKey}}}`,
    scriptAccessor: `pm.variables.get("${cleanKey}")`,
    detail,
    kind: detail.startsWith("Extracted") || detail.startsWith("Output") || detail.startsWith("Set") ? "runtime" : "variable",
  })
}
