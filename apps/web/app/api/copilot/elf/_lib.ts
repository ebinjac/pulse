import { NextResponse } from "next/server"

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|secret|password|credential|apikey|api_key|requestbody|responsebody)/i

export function missingLLMKey() {
  return NextResponse.json({ error: "LLM_API_KEY is not configured on the server." }, { status: 500 })
}

export function maskForElfCopilot(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]"
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => maskForElfCopilot(item, depth + 1))
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.length > 500) return value.slice(0, 500) + "..."
    return value
  }
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = "[masked]"
      continue
    }
    out[key] = maskForElfCopilot(child, depth + 1)
  }
  return out
}

export function extractJsonObject(content: string): string {
  const trimmed = content.trim()
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
  }
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

export async function runElfCopilotJSON({
  apiKey,
  prompt,
}: {
  apiKey: string
  prompt: string
}) {
  const groqResponse = await fetch(process.env.LLM_API_ENDPOINT || "https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.LLM_HTTP_REFERER || "http://localhost:3000",
      "X-Title": process.env.LLM_APP_TITLE || "Pulse",
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "moonshotai/kimi-k2.6:free",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  })

  if (!groqResponse.ok) {
    const errorText = await groqResponse.text()
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: `LLM API responded with status ${groqResponse.status}: ${errorText}` },
        { status: 502 },
      ),
    }
  }

  const payload = await groqResponse.json()
  const content = payload?.choices?.[0]?.message?.content?.trim() ?? "{}"
  try {
    return { ok: true as const, json: JSON.parse(extractJsonObject(content)) }
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Copilot returned invalid JSON formatting. Please try again.", raw: content },
        { status: 502 },
      ),
    }
  }
}

export function elfPromptHeader(task: string) {
  return `You are Pulse ELF Query Copilot, an expert SRE assistant for OpenSearch/ELF log validation.
Task: ${task}

Rules:
- Return ONLY valid JSON. No markdown and no extra commentary.
- Do not invent fields. Use only fields present in detectedFields, detectedRoles, sampleLogs, or currentQuery.
- Prefer deterministic, reviewable expression checks over opaque raw DSL.
- Never mark an AI conclusion as authoritative over deterministic pass/warn/fail.
- Treat requestBody, responseBody, tokens, cookies, auth, and secrets as sensitive.`
}
