export const PULSE_API_REQUIRED_CODE = "PULSE_API_REQUIRED" as const

export function isPulseApiConfigured(): boolean {
  return Boolean(process.env.PULSE_API_BASE_URL?.trim())
}

export function pulseApiRequiredResponse(): Response {
  return Response.json(
    {
      error: "Pulse API is required",
      code: PULSE_API_REQUIRED_CODE,
      detail:
        "Set PULSE_API_BASE_URL in apps/web/.env.local (for example http://localhost:8080) and ensure the Go API is running.",
    },
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
      },
    }
  )
}

export async function proxyToPulseApi(request: Request, path: string): Promise<Response> {
  const baseUrl = process.env.PULSE_API_BASE_URL?.trim()
  if (!baseUrl) {
    return pulseApiRequiredResponse()
  }

  const headers = new Headers(request.headers)
  headers.delete("host")

  const hasBody = request.method !== "GET" && request.method !== "HEAD"
  const upstreamResponse = await fetch(new URL(path, baseUrl), {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  })

  const contentType = upstreamResponse.headers.get("Content-Type") ?? "application/json"
  if (contentType.includes("application/json")) {
    const payload = await upstreamResponse.json().catch(() => null)
    if (payload !== null) {
      return Response.json(normalizePulseApiPayload(payload), {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
      })
    }
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: {
      "Content-Type": contentType,
    },
  })
}

function normalizePulseApiPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizePulseApiPayload)
  }

  if (!value || typeof value !== "object") {
    return normalizeMonitorStatus(value)
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === "status" ? normalizeMonitorStatus(child) : normalizePulseApiPayload(child),
    ])
  )
}

function normalizeMonitorStatus(value: unknown): unknown {
  if (typeof value !== "string") return value

  switch (value.toUpperCase()) {
    case "SUCCESS":
      return "success"
    case "FAILED":
      return "failed"
    case "TIMEOUT":
      return "timeout"
    case "ERROR":
      return "error"
    case "SKIPPED":
      return "skipped"
    default:
      return value
  }
}
