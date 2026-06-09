import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function POST(request: Request, { params }: { params: Promise<{ queryId: string }> }) {
  const { queryId } = await params
  return proxyToPulseApi(request, `/api/elf-queries/${queryId}/validate-check`)
}
