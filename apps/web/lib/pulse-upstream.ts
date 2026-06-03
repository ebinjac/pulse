export async function proxyToPulseApi(request: Request, path: string) {
  const baseUrl = process.env.PULSE_API_BASE_URL
  if (!baseUrl) return null

  const headers = new Headers(request.headers)
  headers.delete("host")

  const hasBody = request.method !== "GET" && request.method !== "HEAD"
  const upstreamResponse = await fetch(new URL(path, baseUrl), {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  })

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: {
      "Content-Type": upstreamResponse.headers.get("Content-Type") ?? "application/json",
    },
  })
}
