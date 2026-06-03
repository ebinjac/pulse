import { pulseMonitorApiPath } from "@/lib/pulse-api-paths"
import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(
  request: Request,
  context: { params: Promise<{ monitorId: string }> }
) {
  const { monitorId } = await context.params
  return proxyToPulseApi(request, pulseMonitorApiPath(monitorId, "versions"))
}
