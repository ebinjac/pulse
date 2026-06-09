import { NextResponse } from "next/server"
import type { MonitorRun } from "@/lib/pulse-types"

interface SummaryRequest {
  runs: MonitorRun[]
  monitorName: string
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
    const { runs, monitorName } = (await request.json()) as SummaryRequest

    if (!runs || runs.length === 0) {
      return NextResponse.json({ error: "Runs are required." }, { status: 400 })
    }

    const simplifiedRuns = runs.map((r) => ({
      id: r.id,
      status: r.status,
      durationMs: r.durationMs,
      failureReason: r.failureReason,
      startedAt: r.startedAt,
    }))

    const systemPrompt = `You are Pulse Root Cause Summary Copilot, an expert operations dashboard analytics agent.
Analyze the historical execution runs below for the synthetic monitor "${monitorName}" and write a concise pattern analysis summary identifying error trends, correlations with time of day, common steps failing, and potential root causes.

Historical Runs Data (latest first):
${JSON.stringify(simplifiedRuns, null, 2)}

Schema:
Your response must be a JSON object matching this interface:
interface RootCauseSummary {
  patternDetected: boolean // True if an explicit recurring pattern (like same step failing, failure starting at exact time) was identified
  summary: string // A concise, human-readable summary of the history patterns (e.g. "Monitor started failing consistently at 10:30 AM after a sudden latency spike in step 'Token Exchange' from 200ms to 2400ms."). Max 3 sentences.
  conclusions: string[] // Explanations or potential action suggestions based on the pattern trend (at most 3 items)
}

Critical Instructions:
1. Examine status shifts, timestamp changes, and error message recurring terms.
2. Output ONLY valid JSON. No conversational greetings, no markdown formatting.`

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
      console.error("Failed to parse Root Cause Summary output as JSON:", content)
      return NextResponse.json(
        { error: "Copilot returned invalid JSON formatting. Please try again.", raw: content },
        { status: 502 }
      )
    }
  } catch (err) {
    console.error("Error summarizing historical patterns:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
