import { NextResponse } from "next/server"
import { elfPromptHeader, maskForElfCopilot, missingLLMKey, runElfCopilotJSON } from "../_lib"

export async function POST(request: Request) {
  const apiKey = (process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "").trim()
  if (!apiKey) return missingLLMKey()
  try {
    const input = maskForElfCopilot(await request.json())
    const prompt = `${elfPromptHeader("Explain an ELF/OpenSearch probe response for an SRE user.")}

Input:
${JSON.stringify(input, null, 2)}

Return JSON:
{
  "summary": "2-4 concise sentences",
  "topPatterns": ["at most 5 concrete patterns"],
  "riskyServices": ["at most 5 services/endpoints/downstreams"],
  "recommendedFields": ["field paths Pulse should rely on"],
  "warnings": ["noise, missing fields, or misleading signals"]
}`
    const result = await runElfCopilotJSON({ apiKey, prompt })
    if (!result.ok) return result.response
    return NextResponse.json({ result: result.json })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 })
  }
}
