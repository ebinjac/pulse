import { NextResponse } from "next/server"
import type { MonitorRun } from "@/lib/pulse-types"

interface AlertMessageRequest {
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
    const { run } = (await request.json()) as AlertMessageRequest

    if (!run) {
      return NextResponse.json({ error: "Monitor run is required." }, { status: 400 })
    }

    const failedSteps = (run.steps || []).filter((s) => s.status === "failed")

    const systemPrompt = `You are Pulse Notification Rephraser Copilot.
Translate a raw technical synthetic monitor failure into human-friendly, high-impact alert content suitable for Slack notifications, email bodies, and Microsoft Teams cards.

Monitor Name: ${run.monitorName}
Run ID: ${run.id}
Failure Category: ${run.failureCategory || "N/A"}
Failure Reason: ${run.failureReason || "N/A"}
Duration: ${run.durationMs}ms
Started At: ${run.startedAt}

Failed steps:
${JSON.stringify(failedSteps.map((s) => ({ stepName: s.stepName, statusCode: s.statusCode, responseSummary: s.responseSummary })), null, 2)}

Schema:
Your response must be a JSON object matching this interface:
interface AlertMessageDraft {
  slackMessage: string // Slack mrkdwn formatted content with emoji (e.g. "*Pulse Outage Alert*: \`Payment Health API\` has failed consecutive checks...")
  emailSubject: string // Actionable email subject line
  emailBody: string // Clean, professional HTML/Text email content structure
  teamsCardText: string // Brief Teams connector card summary description
}

Critical Instructions:
1. Make the messages action-oriented and clear on business impact (e.g. "Payment API is returning HTTP 500. This could block payments checkout").
2. Output ONLY valid JSON. No conversational greetings, no markdown tags.`

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
      console.error("Failed to parse Alert Message output as JSON:", content)
      return NextResponse.json(
        { error: "Copilot returned invalid JSON formatting. Please try again.", raw: content },
        { status: 502 }
      )
    }
  } catch (err) {
    console.error("Error creating alert messages:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
