import { proxyToPulseApi } from "@/lib/pulse-upstream"

interface RunStepsRouteContext {
  params: Promise<{ runId: string }>
}

export async function GET(_request: Request, context: RunStepsRouteContext) {
  const { runId } = await context.params
  return proxyToPulseApi(_request, `/api/runs/${runId}/steps`)
}
