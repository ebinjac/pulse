import { NextResponse } from "next/server"
import { elfPromptHeader, maskForElfCopilot, missingLLMKey, runElfCopilotJSON } from "../_lib"

export async function POST(request: Request) {
  const apiKey = (process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "").trim()
  if (!apiKey) return missingLLMKey()
  try {
    const input = maskForElfCopilot(await request.json())
    const prompt = `${elfPromptHeader("Generate reviewable ELF deployment check suggestions from a probe.")}

Input:
${JSON.stringify(input, null, 2)}

Return JSON:
{
  "suggestions": [
    {
      "id": "ai-short-kebab-id",
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
      "explanation": "Why this is useful"
    }
  ]
}

Generate at most 6 suggestions. Use only existing fields.`
    const result = await runElfCopilotJSON({ apiKey, prompt })
    if (!result.ok) return result.response
    return NextResponse.json({ suggestions: Array.isArray(result.json?.suggestions) ? result.json.suggestions : [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 })
  }
}
