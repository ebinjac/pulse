import { NextResponse } from "next/server"
import { elfPromptHeader, maskForElfCopilot, missingLLMKey, runElfCopilotJSON } from "../_lib"

export async function POST(request: Request) {
  const apiKey = (process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "").trim()
  if (!apiKey) return missingLLMKey()
  try {
    const input = maskForElfCopilot(await request.json())
    const prompt = `${elfPromptHeader("Map dynamic ELF/OpenSearch fields to Pulse log roles.")}

Input:
${JSON.stringify(input, null, 2)}

Return JSON:
{
  "mappings": [
    {
      "role": "timestamp | level | message | service | endpoint | statusCode | responseTimeMs | exceptionType | downstreamService | traceId | environment | tags",
      "path": "existing.field.path",
      "confidence": "high | medium | low",
      "reason": "short reason"
    }
  ],
  "warnings": ["fields that were missing or ambiguous"]
}

Use only existing paths. Omit roles when no credible field exists.`
    const result = await runElfCopilotJSON({ apiKey, prompt })
    if (!result.ok) return result.response
    return NextResponse.json({
      mappings: Array.isArray(result.json?.mappings) ? result.json.mappings : [],
      warnings: Array.isArray(result.json?.warnings) ? result.json.warnings : [],
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 })
  }
}
