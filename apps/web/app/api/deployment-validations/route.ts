import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const query = url.search || ""
  return proxyToPulseApi(request, `/api/deployment-validations${query}`)
}

export async function POST(request: Request) {
  return proxyToPulseApi(request, "/api/deployment-validations")
}
