import type { Monitor, MonitorStep } from "@/lib/pulse-types"

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error((errorData as { error?: string }).error || `Request failed: ${path}`)
  }
  return response.json() as Promise<T>
}

export interface CopilotAssertionSuggestion {
  type?: string
  label?: string
  target?: string
  operator?: string
  expected?: string | number
}

export interface CopilotExtractorSuggestion {
  name?: string
  type?: string
  source?: string
}

export async function suggestAssertions(input: {
  url: string
  method: string
  statusCode: number
  responseBody: string
}): Promise<CopilotAssertionSuggestion[]> {
  const data = await postJson<{ suggestions?: CopilotAssertionSuggestion[] }>("/api/copilot/assertions", input)
  if (!Array.isArray(data.suggestions)) {
    throw new Error("AI suggestions were not returned as a valid array.")
  }
  return data.suggestions
}

export async function suggestExtractors(input: {
  url: string
  method: string
  statusCode: number
  responseBody: string
}): Promise<CopilotExtractorSuggestion[]> {
  const data = await postJson<{ suggestions?: CopilotExtractorSuggestion[] }>("/api/copilot/extractors", input)
  if (!Array.isArray(data.suggestions)) {
    throw new Error("AI extractor suggestions were not returned as a valid array.")
  }
  return data.suggestions
}

export async function checkSecretSafety(steps: MonitorStep[]): Promise<{ safe: boolean; warnings: unknown[] } | null> {
  const data = await postJson<{ result?: { safe: boolean; warnings: unknown[] } }>("/api/copilot/secret-safety", { steps })
  return data.result ?? null
}

export async function analyzeMonitorImprovement(monitor: Monitor): Promise<unknown[]> {
  const data = await postJson<{ result: { suggestions?: unknown[] } }>("/api/copilot/monitor-improvement", { monitor })
  return data.result?.suggestions ?? []
}

export async function generateMonitorFromPrompt(prompt: string): Promise<unknown> {
  const data = await postJson<{ result: unknown }>("/api/copilot/generate-monitor", { prompt })
  return data.result
}

export async function convertCurl(curlCommand: string): Promise<unknown> {
  const data = await postJson<{ result: unknown }>("/api/copilot/curl-convert", { curlCommand })
  return data.result
}
