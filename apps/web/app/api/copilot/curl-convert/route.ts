import { NextResponse } from "next/server"
import { parseCurlCommand } from "@/lib/parse-curl"

interface CurlConvertRequest {
  curlCommand: string
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim()
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
  }
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1)
  }
  return trimmed
}

export async function POST(request: Request) {
  const apiKey = (process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "").trim()

  try {
    const { curlCommand } = (await request.json()) as CurlConvertRequest

    if (!curlCommand?.trim()) {
      return NextResponse.json({ error: "cURL command is required." }, { status: 400 })
    }

    const parsed = parseCurlCommand(curlCommand)
    if (parsed) {
      return NextResponse.json({ result: parsed, source: "parser" })
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Could not parse this cURL command automatically. Configure LLM_API_KEY for Copilot fallback, or simplify the command.",
        },
        { status: 422 },
      )
    }

    const systemPrompt = `You are Rythm cURL Converter Copilot. Parse the shell cURL command and return ONLY valid JSON matching this shape:
{
  "name": string,
  "method": "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  "url": string,
  "headers": Record<string, string>,
  "bodyType": "json" | "form" | "text" | "none",
  "body": string,
  "assertions": [{ "type": "statusCode", "label": string, "target": "status", "operator": "equals", "expected": "200" }],
  "warnings": string[]
}

cURL command:
${curlCommand}

Rules:
- Support GET requests that include a -d body (Elasticsearch/OpenSearch).
- Preserve multiline JSON bodies as a string in "body".
- Output ONLY JSON, no markdown.`

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
        messages: [{ role: "user", content: systemPrompt }],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    })

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text()
      console.error("LLM API error response:", errorText)
      return NextResponse.json(
        { error: `LLM API responded with status ${groqResponse.status}: ${errorText}` },
        { status: 502 },
      )
    }

    const payload = await groqResponse.json()
    const content = payload?.choices?.[0]?.message?.content?.trim() ?? "{}"
    const cleanedContent = extractJsonObject(content)

    try {
      const parsedResult = JSON.parse(cleanedContent)
      return NextResponse.json({ result: parsedResult, source: "copilot" })
    } catch {
      console.error("Failed to parse cURL convert output as JSON:", content)
      return NextResponse.json(
        { error: "Copilot returned invalid JSON formatting. Please try again.", raw: content },
        { status: 502 },
      )
    }
  } catch (err) {
    console.error("Error converting cURL command:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    )
  }
}
