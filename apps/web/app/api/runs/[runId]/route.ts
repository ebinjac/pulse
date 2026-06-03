import { proxyToPulseApi } from "@/lib/pulse-upstream"

interface RunRouteContext {
  params: Promise<{ runId: string }>
}

export async function GET(_request: Request, context: RunRouteContext) {
  const { runId } = await context.params
  return proxyToPulseApi(_request, `/api/runs/${runId}`)
}
