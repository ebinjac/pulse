import { listRuns } from "@/lib/pulse-mock-store"
import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(request: Request) {
  const upstream = await proxyToPulseApi(request, "/api/runs")
  if (upstream) return upstream

  return Response.json({ runs: listRuns() })
}
