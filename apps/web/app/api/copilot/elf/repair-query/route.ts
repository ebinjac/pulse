import { NextResponse } from "next/server"
import { elfPromptHeader, maskForElfCopilot, missingLLMKey, runElfCopilotJSON } from "../_lib"

export async function POST(request: Request) {
  const apiKey = (process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "").trim()
  if (!apiKey) return missingLLMKey()
  try {
    const input = maskForElfCopilot(await request.json())
    const prompt = `${elfPromptHeader("Repair or improve an OpenSearch query used by Pulse ELF probing.")}

Input:
${JSON.stringify(input, null, 2)}

Return JSON:
{
  "likelyCause": "The most likely reason the probe failed or returned unusable data",
  "correctedSearchBody": {"query": {"match_all": {}}},
  "explanation": "What changed and why",
  "warnings": ["at most 5 warnings"]
}

Keep correctedSearchBody valid OpenSearch JSON. Do not include secrets.`
    const result = await runElfCopilotJSON({ apiKey, prompt })
    if (!result.ok) return result.response
    return NextResponse.json({ result: result.json })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 })
  }
}
