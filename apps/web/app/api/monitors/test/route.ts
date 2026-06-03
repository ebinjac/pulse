import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function POST(request: Request) {
  return proxyToPulseApi(request, "/api/monitors/test")
}
