import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(request: Request) {
  return proxyToPulseApi(request, "/api/elf-queries")
}

export async function POST(request: Request) {
  return proxyToPulseApi(request, "/api/elf-queries")
}
