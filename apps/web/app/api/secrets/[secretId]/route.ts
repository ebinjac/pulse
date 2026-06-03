import { proxyToPulseApi } from "@/lib/pulse-upstream"

interface SecretRouteContext {
  params: Promise<{ secretId: string }>
}

export async function GET(_request: Request, context: SecretRouteContext) {
  const { secretId } = await context.params
  return proxyToPulseApi(_request, `/api/secrets/${secretId}`)
}

export async function PUT(request: Request, context: SecretRouteContext) {
  const { secretId } = await context.params
  return proxyToPulseApi(request, `/api/secrets/${secretId}`)
}

export async function DELETE(request: Request, context: SecretRouteContext) {
  const { secretId } = await context.params
  return proxyToPulseApi(request, `/api/secrets/${secretId}`)
}
