import { buildMockRun } from "@/lib/pulse-execution"
import { proxyToPulseApi } from "@/lib/pulse-upstream"
import type { Monitor } from "@/lib/pulse-types"

export async function POST(request: Request) {
  const upstream = await proxyToPulseApi(request, "/api/monitors/test")
  if (upstream) return upstream

  // Fallback to building mock run without saving to the store.
  const monitor = (await request.json()) as Monitor
  const run = buildMockRun(monitor)

  return Response.json({ run }, { status: 200 })
}
