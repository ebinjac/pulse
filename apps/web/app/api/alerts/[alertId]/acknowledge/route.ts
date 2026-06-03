import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ alertId: string }> }
) {
  const { alertId } = await params
  return proxyToPulseApi(request, `/api/alerts/${alertId}/acknowledge`)
}
