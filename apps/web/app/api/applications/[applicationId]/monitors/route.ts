import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> }
) {
  const { applicationId } = await context.params
  return proxyToPulseApi(request, `/api/applications/${applicationId}/monitors`)
}
