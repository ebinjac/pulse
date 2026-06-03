import { runMonitor } from "@/lib/pulse-mock-store"
import { proxyToPulseApi } from "@/lib/pulse-upstream"
import type { Monitor } from "@/lib/pulse-types"

interface MonitorRunRouteContext {
  params: Promise<{ monitorId: string }>
}

export async function POST(request: Request, context: MonitorRunRouteContext) {
  const { monitorId } = await context.params
  const upstream = await proxyToPulseApi(request, `/api/monitors/${monitorId}/run`)
  if (upstream) return upstream

  const body = (await request.json().catch(() => ({}))) as { monitor?: Monitor }
  const run = runMonitor(monitorId, body.monitor)

  if (!run) {
    return Response.json({ error: "Monitor not found" }, { status: 404 })
  }

  return Response.json({ run }, { status: 201 })
}
