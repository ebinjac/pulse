import { listMonitors, upsertMonitor } from "@/lib/pulse-mock-store"
import { proxyToPulseApi } from "@/lib/pulse-upstream"
import type { Monitor } from "@/lib/pulse-types"

export async function GET(request: Request) {
  const upstream = await proxyToPulseApi(request, "/api/monitors")
  if (upstream) return upstream

  return Response.json({ monitors: listMonitors() })
}

export async function POST(request: Request) {
  const upstream = await proxyToPulseApi(request, "/api/monitors")
  if (upstream) return upstream

  const monitor = (await request.json()) as Monitor
  const saved = upsertMonitor(monitor)

  return Response.json({ monitor: saved }, { status: 201 })
}
