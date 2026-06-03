import { NextResponse } from "next/server"
import type { HttpTiming } from "@/lib/pulse-types"

interface PerformanceRequest {
  timing: HttpTiming
  stepName: string
  url?: string
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
    const { timing, stepName, url } = (await request.json()) as PerformanceRequest

    if (!timing) {
      return NextResponse.json({ error: "Timing metrics are required." }, { status: 400 })
    }

    const systemPrompt = `You are Pulse Performance Diagnosis Copilot, an expert AI network performance specialist.
Analyze the HTTP request network timing breakdown below and provide a concise, high-value assessment explaining where the bottleneck lies and how to improve latency.

Step Name: ${stepName}
URL: ${url || "N/A"}

Timing Breakdown (ms):
- DNS Lookup: ${timing.dnsLookupMs ?? 0}ms
- TCP Connect: ${timing.tcpConnectMs ?? 0}ms
- TLS Handshake: ${timing.tlsHandshakeMs ?? 0}ms
- Time To First Byte (TTFB/Waiting): ${timing.timeToFirstByteMs ?? 0}ms
- Response Download: ${timing.downloadMs ?? 0}ms
- Total Response Duration: ${timing.totalMs ?? 0}ms

Schema:
Your response must be a JSON object following this interface:
interface PerformanceDiagnosis {
  analysis: string // A concise summary explaining which phase was the primary bottleneck and what that means (e.g. slow DB queries, long TLS handshakes, slow DNS resolution). Limit to 2-3 sentences.
  recommendations: string[] // Concrete optimization steps (at most 4 items)
}

Critical Instructions:
1. Ground your recommendations in the actual values. For example, if TLS Handshake is high, suggest HTTP/2 connection reuse or SSL session resumption. If TTFB is high, focus on server-side processing, database latency, caching, and thread pool sizing. If DNS is high, check registrar TTL and DNS server latency.
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
      console.error("Failed to parse Performance Diagnosis output as JSON:", content)
      return NextResponse.json(
        { error: "Copilot returned invalid JSON formatting. Please try again.", raw: content },
        { status: 502 }
      )
    }
  } catch (err) {
    console.error("Error diagnosing performance:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
