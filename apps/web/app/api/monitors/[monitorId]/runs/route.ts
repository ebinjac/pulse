import { proxyToPulseApi } from "@/lib/pulse-upstream"

interface MonitorRunsRouteContext {
  params: Promise<{ monitorId: string }>
}

export async function GET(_request: Request, context: MonitorRunsRouteContext) {
  const { monitorId } = await context.params
  return proxyToPulseApi(_request, `/api/monitors/${monitorId}/runs`)
}
