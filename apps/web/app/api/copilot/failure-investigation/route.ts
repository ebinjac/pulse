import { NextResponse } from "next/server"
import type { MonitorRun } from "@/lib/pulse-types"

interface InvestigationRequest {
  run: MonitorRun
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
    const { run } = (await request.json()) as InvestigationRequest

    if (!run) {
      return NextResponse.json({ error: "Monitor run is required." }, { status: 400 })
    }

    const failedSteps = (run.steps || []).filter((s) => s.status === "failed")

    const failedStepsDetails = failedSteps.map((s) => ({
      stepName: s.stepName,
      type: s.type,
      latencyMs: s.latencyMs,
      requestSummary: s.requestSummary,
      responseSummary: s.responseSummary,
      statusCode: s.statusCode,
      errorMessage: s.errorMessage,
      responseBody: s.responseBody ? s.responseBody.substring(0, 2000) : null,
      timing: s.timing,
      assertions: s.assertions,
    }))

    const systemPrompt = `You are Pulse Failure Investigator, an expert AI agent diagnosing failures in synthetic API monitoring.
Analyze the failed run details below and provide a concise, human-readable root cause explanation, possible failure causes, and suggested next steps.

Monitor Name: ${run.monitorName}
Overall Duration: ${run.durationMs}ms
Overall Failure Reason: ${run.failureReason || "N/A"}
Overall Failure Category: ${run.failureCategory || "N/A"}

Failed Steps Details:
${JSON.stringify(failedStepsDetails, null, 2)}

Schema:
Your response must be a JSON object following this interface:
interface InvestigationResult {
  explanation: string // Clear human-readable description of what went wrong (2-3 sentences)
  probableCauses: string[] // List of possible underlying causes (at most 4 items)
  suggestedSteps: string[] // Practical actions the user can take to verify or fix this (at most 4 items)
}

Critical Instructions:
1. Provide highly accurate suggestions based on HTTP status codes (e.g. 401/403 implies auth, 5xx implies backend server, 0/timeout implies connection/DNS issue).
2. Look at the failing assertions (e.g., if a status code assertion failed, or a JSONPath value check failed).
3. Do NOT include any markdown code blocks, conversational greetings, or preambles. Output ONLY valid JSON.`

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
      console.error("Failed to parse Failure Investigation output as JSON:", content)
      return NextResponse.json(
        { error: "Copilot returned invalid JSON formatting. Please try again.", raw: content },
        { status: 502 }
      )
    }
  } catch (err) {
    console.error("Error running failure investigation:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
