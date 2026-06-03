import { NextResponse } from "next/server"
import type { MonitorRun } from "@/lib/pulse-types"

interface IncidentDraftRequest {
  run: MonitorRun
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
    const { run } = (await request.json()) as IncidentDraftRequest

    if (!run) {
      return NextResponse.json({ error: "Monitor run is required." }, { status: 400 })
    }

    const failedSteps = (run.steps || []).filter((s) => s.status === "failed")

    const failedStepsDetails = failedSteps.map((s) => ({
      stepName: s.stepName,
      type: s.type,
      latencyMs: s.latencyMs,
      statusCode: s.statusCode,
      responseSummary: s.responseSummary,
      errorMessage: s.errorMessage,
    }))

    const systemPrompt = `You are Pulse Operations Copilot, an incident response documentation specialist.
Draft a professional, copy-ready ServiceNow or JIRA ticket for a failed synthetic monitor check.

Monitor Name: ${run.monitorName}
Run ID: ${run.id}
Failure Category: ${run.failureCategory || "N/A"}
Failure Reason: ${run.failureReason || "N/A"}
Duration: ${run.durationMs}ms
Started At: ${run.startedAt}

Failed steps:
${JSON.stringify(failedStepsDetails, null, 2)}

Schema:
Your response must be a JSON object matching this interface:
interface IncidentDraft {
  title: string // Incident Title (e.g. "INCIDENT: Synthetic Monitor Payment API failed (HTTP 500)")
  severity: "P1" | "P2" | "P3" // Suggested severity based on duration or category
  markdownContent: string // The full ticket description formatted in clean Markdown. Include sections: "Overview", "Observed Error details", "Failed Steps List", "Metadata / Context", and "Recommended Diagnostics". Keep it clean, professional, and dense.
}

Critical Instructions:
1. Make the markdownContent look premium and structured, ready to be copy-pasted into incident trackers like JIRA, ServiceNow, or Opsgenie.
2. Return ONLY valid JSON. No conversational greetings, no markdown enclosing code blocks (other than the markdownContent field string itself).`

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
      console.error("Failed to parse Incident Draft output as JSON:", content)
      return NextResponse.json(
        { error: "Copilot returned invalid JSON formatting. Please try again.", raw: content },
        { status: 502 }
      )
    }
  } catch (err) {
    console.error("Error creating incident draft:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
