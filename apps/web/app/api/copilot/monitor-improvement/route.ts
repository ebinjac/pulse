import { NextResponse } from "next/server"
import type { Monitor } from "@/lib/pulse-types"

interface ImprovementRequest {
  monitor: Monitor
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
    const { monitor } = (await request.json()) as ImprovementRequest

    if (!monitor) {
      return NextResponse.json({ error: "Monitor is required." }, { status: 400 })
    }

    const systemPrompt = `You are Pulse Monitor Improvement Copilot, an expert synthetic monitoring advisor.
Analyze the current configuration of the synthetic API monitor below and suggest improvements to enhance test coverage, resilience, timing alerts, assertion coverage, and secret security.

Monitor Configuration:
- Name: ${monitor.name}
- Description: ${monitor.description || "None"}
- Interval (Cron): ${monitor.cron}
- Overall Timeout: ${monitor.timeoutMs}ms
- Retry Count: ${monitor.retryCount}
- Failure Consecutive Threshold: ${monitor.failureThreshold}
- Alert Policy Enabled: ${monitor.alertPolicy?.enabled ?? false}
- Alert Timeout Trigger: ${monitor.alertPolicy?.responseTimeMs ?? 0}ms

Steps Configured:
${JSON.stringify(
  (monitor.steps || []).map((s) => ({
    name: s.name,
    method: s.method,
    url: s.url,
    assertionsCount: (s.assertions || []).length,
    extractorsCount: (s.extractors || []).length,
  })),
  null,
  2
)}

Schema:
Your response must be a JSON object matching this interface:
interface ImprovementSuggestions {
  suggestions: Array<{
    category: "assertion" | "reliability" | "security" | "alerting"
    title: string // Clear short summary of recommendation (e.g. "Add a response time assertion")
    description: string // Elaborate explanation on why and how to add it.
  }>
}

Critical Instructions:
1. Provide realistic recommendations. For instance, if there are no assertions, recommend adding status code check assertions. If there is no retry count (e.g., 0), recommend setting it to 1 to reduce transient test noise. If the alert policy does not trigger on latency, recommend specifying a responseTimeMs alert threshold.
2. Output ONLY valid JSON. No conversational greetings, no markdown tags.`

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
      console.error("Failed to parse Monitor Improvement output as JSON:", content)
      return NextResponse.json(
        { error: "Copilot returned invalid JSON formatting. Please try again.", raw: content },
        { status: 502 }
      )
    }
  } catch (err) {
    console.error("Error analyzing monitor improvements:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
