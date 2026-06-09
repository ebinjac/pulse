import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function POST(request: Request, { params }: { params: Promise<{ validationId: string }> }) {
  const { validationId } = await params
  return proxyToPulseApi(request, `/api/deployment-validations/${validationId}/run-log-check`)
}
