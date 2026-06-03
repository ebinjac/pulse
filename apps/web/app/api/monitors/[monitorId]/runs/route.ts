import { getMonitorById, listRuns } from "@/lib/pulse-mock-store"
import { proxyToPulseApi } from "@/lib/pulse-upstream"

interface MonitorRunsRouteContext {
  params: Promise<{ monitorId: string }>
}

export async function GET(_request: Request, context: MonitorRunsRouteContext) {
  const { monitorId } = await context.params
  const upstream = await proxyToPulseApi(_request, `/api/monitors/${monitorId}/runs`)
  if (upstream) return upstream

  if (!getMonitorById(monitorId)) {
    return Response.json({ error: "Monitor not found" }, { status: 404 })
  }

  return Response.json({ runs: listRuns(monitorId) })
}
