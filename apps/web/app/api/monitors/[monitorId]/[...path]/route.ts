import { pulseMonitorApiPath } from "@/lib/pulse-api-paths"
import { proxyToPulseApi } from "@/lib/pulse-upstream"

type RouteContext = {
  params: Promise<{ monitorId: string; path: string[] }>
}

async function proxy(request: Request, context: RouteContext) {
  const { monitorId, path } = await context.params
  const segments = path ?? []
  const upstream = pulseMonitorApiPath(monitorId, ...segments)
  const query = new URL(request.url).search
  return proxyToPulseApi(request, `${upstream}${query}`)
}

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context)
}

export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context)
}

export async function PUT(request: Request, context: RouteContext) {
  return proxy(request, context)
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxy(request, context)
}
