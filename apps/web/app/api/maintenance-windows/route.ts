import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const active = url.searchParams.get("active")
  const suffix = active === "true" ? "?active=true" : ""
  return proxyToPulseApi(request, `/api/maintenance-windows${suffix}`)
}

export async function POST(request: Request) {
  return proxyToPulseApi(request, "/api/maintenance-windows")
}
