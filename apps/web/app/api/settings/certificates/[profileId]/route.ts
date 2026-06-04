import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(request: Request, context: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await context.params
  return proxyToPulseApi(request, `/api/settings/certificates/${profileId}`)
}

export async function PUT(request: Request, context: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await context.params
  return proxyToPulseApi(request, `/api/settings/certificates/${profileId}`)
}

export async function DELETE(request: Request, context: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await context.params
  return proxyToPulseApi(request, `/api/settings/certificates/${profileId}`)
}
