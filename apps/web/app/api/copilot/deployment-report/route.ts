import { NextResponse } from "next/server"
import type { DeploymentValidation, MonitorRun } from "@/lib/pulse-types"

interface DeploymentReportRequest {
  validation: DeploymentValidation
  preRuns: MonitorRun[]
  postRuns: MonitorRun[]
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY is not configured on the server." }, { status: 500 })
  }

  try {
    const { validation, preRuns, postRuns } = (await request.json()) as DeploymentReportRequest
    if (!validation?.report) {
      return NextResponse.json({ error: "Completed deployment validation report is required." }, { status: 400 })
    }

    const payload = {
      validation: {
        name: validation.name,
        applicationName: validation.applicationName,
        carId: validation.carId,
        environment: validation.environment,
        version: validation.version,
        buildId: validation.buildId,
        sampleCount: validation.sampleCount,
        intervalSeconds: validation.intervalSeconds,
      },
      deterministicReport: validation.report,
      preRuns: preRuns.map(simplifyRun),
      postRuns: postRuns.map(simplifyRun),
    }

    const prompt = `You are Pulse Deployment Report Copilot, an SRE release validation analyst.
Create an executive deployment validation report from deterministic Pulse metrics. Do not override the deterministic pass/warning/fail status; explain it.

Data:
${JSON.stringify(payload, null, 2)}

Return ONLY valid JSON matching:
{
  "executiveSummary": "2-4 concise sentences",
  "recommendation": "Proceed | Proceed with caution | Rollback / investigate",
  "riskLevel": "low | medium | high",
  "keyFindings": ["at most 5 concrete findings grounded in the metrics"],
  "nextActions": ["at most 5 practical SRE actions"]
}`

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    })

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text()
      return NextResponse.json({ error: `Groq API responded with status ${groqResponse.status}: ${errorText}` }, { status: 502 })
    }

    const groqPayload = await groqResponse.json()
    const content = groqPayload?.choices?.[0]?.message?.content?.trim() ?? "{}"
    const cleaned = content.startsWith("```")
      ? content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
      : content

    try {
      const result = JSON.parse(cleaned.trim())
      return NextResponse.json({ result })
    } catch {
      return NextResponse.json({ error: "Copilot returned invalid JSON formatting.", raw: content }, { status: 502 })
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 })
  }
}

function simplifyRun(run: MonitorRun) {
  return {
    id: run.id,
    monitorId: run.monitorId,
    monitorName: run.monitorName,
    status: run.status,
    durationMs: run.durationMs,
    failureReason: run.failureReason,
    startedAt: run.startedAt,
  }
}
