import type {
  ElfCopilotFieldMapping,
  ElfCopilotQueryRepair,
  ElfCopilotResultExplanation,
  ElfCopilotSummary,
  ElfSuggestedCheck,
} from "@/lib/pulse-types"

async function postElfCopilot<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/copilot/elf/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Copilot request failed: ${path}`)
  }
  return data as T
}

export const elfCopilotClient = {
  explainProbe(input: unknown) {
    return postElfCopilot<{ result: ElfCopilotSummary }>("explain-probe", input)
  },
  generateChecks(input: unknown) {
    return postElfCopilot<{ suggestions: ElfSuggestedCheck[] }>("generate-checks", input)
  },
  naturalLanguageCheck(input: unknown) {
    return postElfCopilot<{ suggestion: ElfSuggestedCheck | null }>("natural-language-check", input)
  },
  repairQuery(input: unknown) {
    return postElfCopilot<{ result: ElfCopilotQueryRepair }>("repair-query", input)
  },
  mapFields(input: unknown) {
    return postElfCopilot<{ mappings: ElfCopilotFieldMapping[]; warnings?: string[] }>("map-fields", input)
  },
  explainResult(input: unknown) {
    return postElfCopilot<{ result: ElfCopilotResultExplanation }>("explain-result", input)
  },
}
