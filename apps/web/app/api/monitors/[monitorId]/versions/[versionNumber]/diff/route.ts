import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(
  request: Request,
  context: { params: Promise<{ monitorId: string; versionNumber: string }> }
) {
  const { monitorId, versionNumber } = await context.params
  const against = new URL(request.url).searchParams.get("against") ?? "published"
  return proxyToPulseApi(
    request,
    `/api/monitors/${monitorId}/versions/${versionNumber}/diff?against=${encodeURIComponent(against)}`
  )
}
