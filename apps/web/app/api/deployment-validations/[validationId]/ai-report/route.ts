import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function PUT(request: Request, context: { params: Promise<{ validationId: string }> }) {
  const { validationId } = await context.params
  return proxyToPulseApi(request, `/api/deployment-validations/${validationId}/ai-report`)
}
