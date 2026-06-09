import { NextResponse } from "next/server"
import type { DeploymentValidation, MonitorRun } from "@/lib/pulse-types"
import { maskForElfCopilot, runElfCopilotJSON } from "../elf/_lib"

interface DeploymentReportRequest {
  validation: DeploymentValidation
  preRuns: MonitorRun[]
  postRuns: MonitorRun[]
}

export async function POST(request: Request) {
  const apiKey = (process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "").trim()
  if (!apiKey) {
    return NextResponse.json({ error: "LLM_API_KEY is not configured on the server." }, { status: 500 })
  }

  try {
    const { validation, preRuns, postRuns } = (await request.json()) as DeploymentReportRequest
    if (!validation?.report) {
      return NextResponse.json({ error: "Completed deployment validation report is required." }, { status: 400 })
    }

    const payload = maskForElfCopilot({
      validation: {
        name: validation.name,
        applicationName: validation.applicationName,
        carId: validation.carId,
        environment: validation.environment,
        version: validation.version,
        buildId: validation.buildId,
        sampleCount: validation.sampleCount,
        intervalSeconds: validation.intervalSeconds,
        observabilityProfile: validation.observabilityProfile,
      },
      deterministicReport: validation.report,
      observabilityFindings: validation.report?.elfObservability?.byService || {},
      structuredElfSignals: (validation.report?.elfComparisons || []).map((comparison) => ({
        serviceName: comparison.serviceName,
        signalType: comparison.signalType,
        queryName: comparison.queryName,
        result: comparison.result,
        baselineValue: comparison.baselineValue,
        postValue: comparison.postValue,
        deltaPct: comparison.deltaPct,
        reason: comparison.reason,
        topExceptions: comparison.facets?.topExceptions?.slice(0, 3),
        topEndpoints: comparison.facets?.topEndpoints?.slice(0, 3),
        newTerms: comparison.facets?.newTerms?.slice(0, 3),
        sampleHits: comparison.structuredSamples?.slice(0, 2),
      })),
      preRuns: preRuns.map(simplifyRun),
      postRuns: postRuns.map(simplifyRun),
    })

    const prompt = `You are Pulse Deployment Report Copilot, an SRE release validation analyst.
Create an executive deployment validation report from deterministic Pulse metrics and structured ELF observability findings (baseline vs post-deploy signals with facets). Do not override the deterministic pass/warning/fail status; explain it. Prioritize structuredElfSignals and observabilityFindings over raw hit counts.

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

    const result = await runElfCopilotJSON({ apiKey, prompt })
    if (!result.ok) return result.response
    return NextResponse.json({ result: result.json })
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
