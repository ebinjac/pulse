import { NextResponse } from "next/server"
import type { MonitorStep } from "@/lib/pulse-types"

interface SecretSafetyRequest {
  steps: MonitorStep[]
}

export async function POST(request: Request) {
  const apiKey = (process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "").trim()
  if (!apiKey) {
    return NextResponse.json(
      { error: "LLM_API_KEY is not configured on the server." },
      { status: 500 }
    )
  }

  try {
    const { steps } = (await request.json()) as SecretSafetyRequest

    if (!steps) {
      return NextResponse.json({ error: "Steps are required." }, { status: 400 })
    }

    // Prepare a simplified steps view to conserve tokens and avoid leaking long payloads unnecessarily
    const simplifiedSteps = steps.map((s) => ({
      name: s.name,
      method: s.method,
      url: s.url,
      preRequestScript: s.preRequestScript,
      config: s.config,
    }))

    const systemPrompt = `You are Pulse Secret Safety Agent, an enterprise API security auditor.
Analyze the monitor configuration details below. Scan them for hardcoded secrets, API keys, passwords, client secrets, JWT credentials, or bearer tokens that might be exposed in headers, URLs, script code, or body configurations.

Steps details:
${JSON.stringify(simplifiedSteps, null, 2)}

Schema:
Your response must be a JSON object matching this interface:
interface SecretAuditResult {
  safe: boolean // True if no hardcoded credentials were found. False otherwise.
  warnings: Array<{
    stepName: string // The step name where the credential was found
    location: "header" | "url" | "body" | "preRequestScript" | "config"
    key: string // The name of the header or key (e.g. "Authorization", "api_key", "client_secret")
    recommendation: string // How to fix it (e.g. "Use a secret reference '{{secrets.MY_TOKEN_ALIAS}}' instead of exposing client_secret directly.")
  }>
}

Critical Instructions:
1. Scan for values that look like hex strings, base64 tokens, Bearer, Basic auth credentials, or common credential keys (password, secret, key, token).
2. Do NOT flag standard non-sensitive headers (like Content-Type, Accept) or public URLs (like standard domain names).
3. Suggest converting these parameters into variables or secret references.
4. Output ONLY valid JSON. No conversational greetings, no markdown tags.`

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
        messages: [
          {
            role: "user",
            content: systemPrompt,
          },
        ],
        temperature: 0.1,
      }),
    })

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text()
      console.error("LLM API error response:", errorText)
      return NextResponse.json(
        { error: `LLM API responded with status ${groqResponse.status}: ${errorText}` },
        { status: 502 }
      )
    }

    const payload = await groqResponse.json()
    const content = payload?.choices?.[0]?.message?.content?.trim() ?? "{}"

    let cleanedContent = content
    if (content.startsWith("```")) {
      cleanedContent = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    }

    try {
      const parsedResult = JSON.parse(cleanedContent.trim())
      return NextResponse.json({ result: parsedResult })
    } catch (parseErr) {
      console.error("Failed to parse Secret Safety output as JSON:", content)
      return NextResponse.json(
        { error: "Copilot returned invalid JSON formatting. Please try again.", raw: content },
        { status: 502 }
      )
    }
  } catch (err) {
    console.error("Error auditing monitor for secrets:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
