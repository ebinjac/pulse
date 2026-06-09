import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(request: Request, { params }: { params: Promise<{ queryId: string }> }) {
  const { queryId } = await params
  return proxyToPulseApi(request, `/api/elf-queries/${queryId}`)
}

export async function PUT(request: Request, { params }: { params: Promise<{ queryId: string }> }) {
  const { queryId } = await params
  return proxyToPulseApi(request, `/api/elf-queries/${queryId}`)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ queryId: string }> }) {
  const { queryId } = await params
  return proxyToPulseApi(request, `/api/elf-queries/${queryId}`)
}
