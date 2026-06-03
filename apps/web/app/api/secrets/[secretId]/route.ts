import { getSecretById } from "@/lib/pulse-mock-store"
import { proxyToPulseApi } from "@/lib/pulse-upstream"

interface SecretRouteContext {
  params: Promise<{ secretId: string }>
}

export async function GET(_request: Request, context: SecretRouteContext) {
  const { secretId } = await context.params
  const upstream = await proxyToPulseApi(_request, `/api/secrets/${secretId}`)
  if (upstream) return upstream

  const secret = getSecretById(secretId)

  if (!secret) {
    return Response.json({ error: "Secret not found" }, { status: 404 })
  }

  return Response.json({
    secret: {
      ...secret,
      encryptedValue: undefined,
      value: "********",
    },
  })
}

export async function PUT(request: Request, context: SecretRouteContext) {
  const { secretId } = await context.params
  const upstream = await proxyToPulseApi(request, `/api/secrets/${secretId}`)
  if (upstream) return upstream

  return Response.json({ error: "Secret writes require Pulse API upstream" }, { status: 501 })
}
