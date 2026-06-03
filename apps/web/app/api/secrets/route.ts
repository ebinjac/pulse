import { listSecrets } from "@/lib/pulse-mock-store"
import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(request: Request) {
  const upstream = await proxyToPulseApi(request, "/api/secrets")
  if (upstream) return upstream

  return Response.json({
    secrets: listSecrets().map((secret) => ({
      ...secret,
      encryptedValue: undefined,
      value: "********",
    })),
  })
}

export async function POST(request: Request) {
  const upstream = await proxyToPulseApi(request, "/api/secrets")
  if (upstream) return upstream

  return Response.json({ error: "Secret writes require Pulse API upstream" }, { status: 501 })
}
