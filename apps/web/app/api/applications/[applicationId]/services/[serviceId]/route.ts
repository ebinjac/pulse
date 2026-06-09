import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string; serviceId: string }> }
) {
  const { applicationId, serviceId } = await context.params
  return proxyToPulseApi(request, `/api/applications/${applicationId}/services/${serviceId}`)
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ applicationId: string; serviceId: string }> }
) {
  const { applicationId, serviceId } = await context.params
  return proxyToPulseApi(request, `/api/applications/${applicationId}/services/${serviceId}`)
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ applicationId: string; serviceId: string }> }
) {
  const { applicationId, serviceId } = await context.params
  return proxyToPulseApi(request, `/api/applications/${applicationId}/services/${serviceId}`)
}
