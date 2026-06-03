import { NextResponse } from "next/server"

interface CurlConvertRequest {
  curlCommand: string
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
    const { curlCommand } = (await request.json()) as CurlConvertRequest

    if (!curlCommand) {
      return NextResponse.json({ error: "cURL command is required." }, { status: 400 })
    }

    const systemPrompt = `You are Pulse cURL Converter Copilot, a specialist AI agent that parses shell cURL commands and converts them into structured HTTP steps.

cURL command:
"${curlCommand}"

Your response must be a JSON object representing the parsed HTTP monitor step, mapping exactly to this structure:
interface ParsedStep {
  name: string // A suitable name for the step (e.g. "POST Auth Token")
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  url: string // The parsed base URL
  headers: Record<string, string> // Parsed headers (like Content-Type, Authorization, Accept, etc.)
  bodyType: "json" | "form" | "text" | "none" // The body formatting type
  body: string // Stringified request body payload (or empty string if none)
  assertions: Array<{
    type: "statusCode" | "responseTime" | "jsonPath" | "header" | "bodyContains"
    label: string
    target: string
    operator: "equals" | "contains" | "exists" | "lessThan"
    expected: string
  }>
  warnings: string[] // Warn the user if they have hardcoded API keys, bearer tokens, or usernames/passwords in the cURL statement. Suggest that these should be converted to secure secret references.
}

Critical Instructions:
1. Parse HTTP methods correctly (e.g., -X POST, --request GET, or inferred by --data/-d parameters).
2. Extract headers (-H or --header flags) and query parameters from the URL correctly.
3. Detect sensitive values (like Authorization tokens, passwords, secrets, private keys, client_secret) and list them under the warnings array so the UI can flag them.
4. Output ONLY valid JSON. No conversational greetings, no markdown code blocks.`

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
      console.error("Failed to parse cURL convert output as JSON:", content)
      return NextResponse.json(
        { error: "Copilot returned invalid JSON formatting. Please try again.", raw: content },
        { status: 502 }
      )
    }
  } catch (err) {
    console.error("Error converting cURL command:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
