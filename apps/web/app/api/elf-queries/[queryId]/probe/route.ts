import { proxyToPulseApi } from "@/lib/pulse-upstream"
import type { NextRequest } from "next/server"

export async function POST(request: NextRequest, { params }: { params: Promise<{ queryId: string }> }) {
  const { queryId } = await params
  return proxyToPulseApi(request, `/api/elf-queries/${queryId}/probe`)
}
