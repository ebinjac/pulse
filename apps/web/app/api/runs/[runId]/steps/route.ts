import { getRunById } from "@/lib/pulse-mock-store"
import { proxyToPulseApi } from "@/lib/pulse-upstream"

interface RunStepsRouteContext {
  params: Promise<{ runId: string }>
}

export async function GET(_request: Request, context: RunStepsRouteContext) {
  const { runId } = await context.params
  const upstream = await proxyToPulseApi(_request, `/api/runs/${runId}/steps`)
  if (upstream) return upstream

  const run = getRunById(runId)

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 })
  }

  return Response.json({ steps: run.steps })
}
