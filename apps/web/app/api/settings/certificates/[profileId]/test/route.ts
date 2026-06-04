import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function POST(request: Request, context: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await context.params
  return proxyToPulseApi(request, `/api/settings/certificates/${profileId}/test`)
}
