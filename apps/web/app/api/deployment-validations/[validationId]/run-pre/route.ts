import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function POST(request: Request, context: { params: Promise<{ validationId: string }> }) {
  const { validationId } = await context.params
  return proxyToPulseApi(request, `/api/deployment-validations/${validationId}/run-pre`)
}
