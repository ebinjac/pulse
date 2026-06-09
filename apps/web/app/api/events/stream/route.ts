import { proxyToPulseApi } from "@/lib/pulse-upstream"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const topics = url.searchParams.get("topics")
  if (!topics) {
    return Response.json({ error: "topics query parameter is required" }, { status: 400 })
  }

  return proxyToPulseApi(request, `/api/events/stream?topics=${encodeURIComponent(topics)}`)
}
