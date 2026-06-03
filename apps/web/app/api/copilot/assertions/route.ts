import { NextResponse } from "next/server"

interface SuggestionRequest {
  url: string
  method: string
  statusCode: number
  responseBody: string
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
    const { url, method, statusCode, responseBody } = (await request.json()) as SuggestionRequest

    const systemPrompt = `You are Pulse Copilot, an AI assistant for an API synthetic monitoring tool.
Analyze the API endpoint details and the ACTUAL response body below, then suggest a JSON array of assertions to test this API endpoint.

Method: ${method}
URL: ${url}
Response Status: ${statusCode}
Response Body:
${responseBody}

Schema:
The assertions must follow this schema:
interface PulseAssertion {
  type: "statusCode" | "responseTime" | "jsonPath" | "header" | "bodyContains" | "regex"
  label: string
  target: string
  operator: "equals" | "notEquals" | "contains" | "notContains" | "exists" | "notExists" | "greaterThan" | "lessThan" | "matchesRegex"
  expected: string
}

Critical Instructions:
1. Suggest at most 3-4 assertions.
2. For status code, always suggest a "statusCode" assertion: type "statusCode", target "status", operator "equals", and expected value should be "${statusCode}" (must be a string).
3. Analyze the ACTUAL keys and structure present in the Response Body. If the response body is JSON, suggest "jsonPath" assertions ONLY for keys that actually exist in the response body.
4. DO NOT suggest exact equality ("equals") for highly dynamic, randomized, or temporary values that change on every API execution (such as random URLs, UUIDs, dynamic timestamps, file sizes, or session keys). If you suggest exact equality for these, the test will fail when run a second time.
   - Instead of exact equality for dynamic values, suggest checks like:
     * Check if a dynamic URL key exists: type "jsonPath", target "$.url", operator "exists", expected ""
     * Check if a dynamic URL starts with expected protocol: type "jsonPath", target "$.url", operator "contains", expected "https://"
     * Check if a dynamic size or number is positive: type "jsonPath", target "$.fileSizeBytes", operator "greaterThan", expected "0"
5. Do NOT confuse response headers with response body JSON. If you want to assert a header (such as Content-Type), suggest a "header" type assertion (e.g. type "header", target "Content-Type", operator "contains", expected "application/json"), NOT a jsonPath assertion querying "$.headers".
6. For operator "exists" or "notExists", the expected value should be empty string "".
7. Respond ONLY with a valid JSON array. No markdown formatting, no conversational text.`

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
    const content = payload?.choices?.[0]?.message?.content?.trim() ?? "[]"

    // Attempt to parse JSON to ensure it is valid before returning.
    // If it contains markdown code blocks, strip them.
    let cleanedContent = content
    if (content.startsWith("```")) {
      // Remove starting ```json or ``` and ending ```
      cleanedContent = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
    }

    try {
      const parsedSuggestions = JSON.parse(cleanedContent.trim())
      return NextResponse.json({ suggestions: parsedSuggestions })
    } catch (parseErr) {
      console.error("Failed to parse Copilot assertions content as JSON:", content)
      return NextResponse.json(
        { error: "Copilot returned invalid JSON formatting. Please try again.", raw: content },
        { status: 502 }
      )
    }
  } catch (err) {
    console.error("Error generating assertions:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
