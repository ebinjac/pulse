import { NextResponse } from "next/server"

interface SuggestionRequest {
  url: string
  method: string
  statusCode: number
  responseBody: string
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
    const { url, method, statusCode, responseBody } = (await request.json()) as SuggestionRequest

    const systemPrompt = `You are Pulse Copilot, an AI assistant for an API synthetic monitoring tool.
Analyze the API endpoint details and the ACTUAL response body below, then suggest a JSON array of extractors to capture variables from the response to chain into subsequent HTTP requests.

Method: ${method}
URL: ${url}
Response Status: ${statusCode}
Response Body:
${responseBody}

Schema:
The extractors must follow this schema:
interface SuggestedExtractor {
  type: "jsonPath" | "header" | "cookie" | "regex" | "statusCode" | "responseTime"
  name: string
  source: string
}

Critical Instructions:
1. Suggest at most 2-3 extractors.
2. Analyze the ACTUAL keys present in the Response Body. If the response body is JSON, suggest "jsonPath" extractors ONLY for keys that actually exist in the response body. Do NOT suggest keys like "token" or "id" unless they are actually present in the Response Body.
   - For example, if the response contains "url", you could suggest a "jsonPath" type extractor with source "$.url" and name "url" or "imageUrl".
   - If the response contains "fileSizeBytes", you could suggest a "jsonPath" type extractor with source "$.fileSizeBytes" and name "fileSize".
3. Use clean, camelCase or snake_case names for the extracted variable (e.g., "imageUrl").
4. For headers (e.g. content-type or authorization) or cookies, suggest "header" or "cookie" type extractors ONLY if they would be useful, but prioritize extracting key fields from the JSON body.
5. For "statusCode" type extractors, leave the 'source' as empty string "".
6. Respond ONLY with a valid JSON array. No markdown formatting, no conversational text.`

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
      console.error("Failed to parse Copilot extractors content as JSON:", content)
      return NextResponse.json(
        { error: "Copilot returned invalid JSON formatting. Please try again.", raw: content },
        { status: 502 }
      )
    }
  } catch (err) {
    console.error("Error generating extractors:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
