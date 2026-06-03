import { proxyToPulseApi } from "@/lib/pulse-upstream"

interface MonitorRunRouteContext {
  params: Promise<{ monitorId: string }>
}

export async function POST(request: Request, context: MonitorRunRouteContext) {
  const { monitorId } = await context.params
  return proxyToPulseApi(request, `/api/monitors/${monitorId}/run`)
}
