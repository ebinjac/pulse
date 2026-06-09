import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(_request: Request, context: { params: Promise<{ validationId: string }> }) {
  const { validationId } = await context.params
  return proxyToPulseApi(_request, `/api/deployment-validations/${validationId}`)
}

export async function PUT(request: Request, context: { params: Promise<{ validationId: string }> }) {
  const { validationId } = await context.params
  return proxyToPulseApi(request, `/api/deployment-validations/${validationId}`)
}

export async function DELETE(_request: Request, context: { params: Promise<{ validationId: string }> }) {
  const { validationId } = await context.params
  return proxyToPulseApi(_request, `/api/deployment-validations/${validationId}`)
}
