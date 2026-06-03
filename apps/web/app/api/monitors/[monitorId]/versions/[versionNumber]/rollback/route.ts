import { pulseMonitorApiPath } from "@/lib/pulse-api-paths"
import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function POST(
  request: Request,
  context: { params: Promise<{ monitorId: string; versionNumber: string }> }
) {
  const { monitorId, versionNumber } = await context.params
  return proxyToPulseApi(request, pulseMonitorApiPath(monitorId, "versions", versionNumber, "rollback"))
}
