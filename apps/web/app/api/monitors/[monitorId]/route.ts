import {
  deleteMonitor,
  getMonitorById,
  upsertMonitor,
} from "@/lib/pulse-mock-store"
import { proxyToPulseApi } from "@/lib/pulse-upstream"
import type { Monitor } from "@/lib/pulse-types"

interface MonitorRouteContext {
  params: Promise<{ monitorId: string }>
}

export async function GET(_request: Request, context: MonitorRouteContext) {
  const { monitorId } = await context.params
  const upstream = await proxyToPulseApi(_request, `/api/monitors/${monitorId}`)
  if (upstream) return upstream

  const monitor = getMonitorById(monitorId)

  if (!monitor) {
    return Response.json({ error: "Monitor not found" }, { status: 404 })
  }

  return Response.json({ monitor })
}

export async function PUT(request: Request, context: MonitorRouteContext) {
  const { monitorId } = await context.params
  const upstream = await proxyToPulseApi(request, `/api/monitors/${monitorId}`)
  if (upstream) return upstream

  const input = (await request.json()) as Monitor
  const monitor = upsertMonitor({ ...input, id: monitorId })

  return Response.json({ monitor })
}

export async function DELETE(_request: Request, context: MonitorRouteContext) {
  const { monitorId } = await context.params
  const upstream = await proxyToPulseApi(_request, `/api/monitors/${monitorId}`)
  if (upstream) return upstream

  const deleted = deleteMonitor(monitorId)

  if (!deleted) {
    return Response.json({ error: "Monitor not found" }, { status: 404 })
  }

  return Response.json({ deleted: true })
}
