import { getSecretById } from "@/lib/pulse-mock-store"
import { proxyToPulseApi } from "@/lib/pulse-upstream"

interface SecretTestRouteContext {
  params: Promise<{ secretId: string }>
}

export async function POST(_request: Request, context: SecretTestRouteContext) {
  const { secretId } = await context.params
  const upstream = await proxyToPulseApi(_request, `/api/secrets/${secretId}/test`)
  if (upstream) return upstream

  const secret = getSecretById(secretId)

  if (!secret) {
    return Response.json({ ok: false, error: "Secret not found" }, { status: 404 })
  }

  return Response.json({
    ok: secret.status === "active",
    alias: secret.alias,
    provider: secret.provider,
    value: "********",
  })
}
