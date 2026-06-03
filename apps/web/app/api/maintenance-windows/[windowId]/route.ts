import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ windowId: string }> }
) {
  const { windowId } = await params
  return proxyToPulseApi(request, `/api/maintenance-windows/${windowId}`)
}
