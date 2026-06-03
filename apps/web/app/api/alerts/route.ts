import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(request: Request) {
  return proxyToPulseApi(request, "/api/alerts")
}
