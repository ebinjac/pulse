import { proxyToPulseApi } from "@/lib/pulse-upstream"

interface SecretTestRouteContext {
  params: Promise<{ secretId: string }>
}

export async function POST(_request: Request, context: SecretTestRouteContext) {
  const { secretId } = await context.params
  return proxyToPulseApi(_request, `/api/secrets/${secretId}/test`)
}
