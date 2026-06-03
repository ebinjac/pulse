import { NextResponse } from "next/server"
import type { Monitor } from "@/lib/pulse-types"

interface GenerateRequest {
  prompt: string
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not configured on the server." },
      { status: 500 }
    )
  }

  try {
    const { prompt } = (await request.json()) as GenerateRequest

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 })
    }

    const systemPrompt = `You are Pulse Monitor Builder Copilot, a specialist AI agent that translates natural language requirements into a valid, structured synthetic monitor configuration draft.

Prompt: "${prompt}"

Your response must be a JSON object containing a draft monitor object that maps exactly to this interface structure:
interface MonitorDraft {
  name: string // A concise, descriptive name for the monitor
  description: string // A short summary of what this monitor validates
  cron: string // Standard 5-field cron expression representing the requested interval (e.g. "*/5 * * * *" for every 5 minutes, "0 * * * *" for hourly). Default to "*/5 * * * *" if not specified.
  timeoutMs: number // Overall monitor timeout in ms (default to 30000)
  retryCount: number // Default retries (default to 1)
  failureThreshold: number // Number of consecutive failures to trigger an alert (default to 2)
  steps: Array<{
    name: string // Step name (e.g., "Authenticate", "Fetch Profile")
    type: "http"
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" // Default GET
    url: string // The endpoint URL (default to example placeholder URL if none provided)
    timeoutMs: number // Step timeout (default 10000)
    retryCount: number // Step retries (default 0)
    continueOnFailure: boolean // Default false
    assertions: Array<{
      type: "statusCode" | "responseTime" | "jsonPath" | "header" | "bodyContains"
      label: string
      target: string
      operator: "equals" | "contains" | "exists" | "lessThan"
      expected: string
    }>
    extractors: Array<{
      variableName: string
      type: "jsonPath" | "regex"
      source: "responseBody" | "responseHeaders"
      target: string
    }>
  }>
}

Critical Instructions:
1. Always populate sensible default values for cron, name, steps, and assertions based on the prompt's instructions.
2. Provide typical assertions for each step (e.g., checking status code is 200/201 and checking responseTime is less than 2000).
3. Do NOT include markdown code blocks or conversational text. Output ONLY valid JSON.`

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
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
      console.error("Groq API error response:", errorText)
      return NextResponse.json(
        { error: `Groq API responded with status ${groqResponse.status}: ${errorText}` },
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
      console.error("Failed to parse Monitor Generator output as JSON:", content)
      return NextResponse.json(
        { error: "Copilot returned invalid JSON formatting. Please try again.", raw: content },
        { status: 502 }
      )
    }
  } catch (err) {
    console.error("Error generating monitor config:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
