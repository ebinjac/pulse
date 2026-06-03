import { proxyToPulseApi } from "@/lib/pulse-upstream"

interface MonitorRouteContext {
  params: Promise<{ monitorId: string }>
}

export async function GET(_request: Request, context: MonitorRouteContext) {
  const { monitorId } = await context.params
  return proxyToPulseApi(_request, `/api/monitors/${monitorId}`)
}

export async function PUT(request: Request, context: MonitorRouteContext) {
  const { monitorId } = await context.params
  return proxyToPulseApi(request, `/api/monitors/${monitorId}`)
}

export async function DELETE(_request: Request, context: MonitorRouteContext) {
  const { monitorId } = await context.params
  return proxyToPulseApi(_request, `/api/monitors/${monitorId}`)
}
