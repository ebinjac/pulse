import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(_request: Request, context: { params: Promise<{ validationId: string }> }) {
  const { validationId } = await context.params
  return proxyToPulseApi(_request, `/api/deployment-validations/${validationId}`)
}
