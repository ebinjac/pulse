import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> }
) {
  const { applicationId } = await context.params
  return proxyToPulseApi(request, `/api/applications/${applicationId}`)
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ applicationId: string }> }
) {
  const { applicationId } = await context.params
  return proxyToPulseApi(request, `/api/applications/${applicationId}`)
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ applicationId: string }> }
) {
  const { applicationId } = await context.params
  return proxyToPulseApi(request, `/api/applications/${applicationId}`)
}
