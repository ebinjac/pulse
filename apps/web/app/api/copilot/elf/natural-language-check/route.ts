import { NextResponse } from "next/server"
import { elfPromptHeader, maskForElfCopilot, missingLLMKey, runElfCopilotJSON } from "../_lib"

export async function POST(request: Request) {
  const apiKey = (process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "").trim()
  if (!apiKey) return missingLLMKey()
  try {
    const input = maskForElfCopilot(await request.json())
    const prompt = `${elfPromptHeader("Convert a user's natural-language SRE log condition into one ELF expression check.")}

Input:
${JSON.stringify(input, null, 2)}

Return JSON:
{
  "suggestion": {
    "id": "ai-natural-language-check",
    "label": "Human label",
    "description": "What this catches",
    "gateMode": "blocking | advisory",
    "checkKind": "expression",
    "checkConfig": {
      "mode": "expression",
      "logic": "all | any",
      "rules": [{"field": "existing.field", "operator": "eq | contains | gte | lte | exists | regex", "value": "optional"}],
      "passWhen": "no_matching_hits | has_matching_hits | hit_count_lte | hit_count_gte | hit_count_eq",
      "passThreshold": 0
    },
    "passCriteria": {"type": "max_hits | min_hits", "threshold": 0},
    "matchCount": 0,
    "severity": "error | warning | info",
    "deploymentFocus": "post_deploy",
    "explanation": "Why this matches the user request"
  }
}`
    const result = await runElfCopilotJSON({ apiKey, prompt })
    if (!result.ok) return result.response
    return NextResponse.json({ suggestion: result.json?.suggestion || null })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 })
  }
}
