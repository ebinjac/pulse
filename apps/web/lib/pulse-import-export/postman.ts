import type { Monitor, MonitorStep } from "@/lib/pulse-types"
import {
  convertTemplateSyntax,
  createHttpStep,
  createMonitorTemplate,
  detectSensitiveValues,
  parseDocumentInput,
} from "./shared"
import type { ImportWarning, PostmanImportOptions, PostmanImportResult } from "./types"

interface PostmanCollection {
  info?: { name?: string; schema?: string }
  item?: PostmanItem[]
  variable?: PostmanVariable[]
}

interface PostmanItem {
  name?: string
  item?: PostmanItem[]
  request?: PostmanRequest
}

interface PostmanVariable {
  key?: string
  value?: string
}

interface PostmanRequest {
  method?: string
  header?: Array<{ key?: string; value?: string; disabled?: boolean }>
  url?: string | PostmanUrl
  body?: PostmanBody
}

interface PostmanUrl {
  raw?: string
  host?: string[]
  path?: string[]
  query?: Array<{ key?: string; value?: string; disabled?: boolean }>
}

interface PostmanBody {
  mode?: string
  raw?: string
  urlencoded?: Array<{ key?: string; value?: string; disabled?: boolean }>
  formdata?: Array<{ key?: string; value?: string; disabled?: boolean; type?: string }>
}

interface FlatRequest {
  name: string
  folderPath: string
  request: PostmanRequest
}

export function importPostmanCollection(
  document: string | Record<string, unknown>,
  options: PostmanImportOptions = {}
): PostmanImportResult {
  const parsed = parseDocumentInput(document) as PostmanCollection
  const warnings: ImportWarning[] = []

  if (!parsed.item?.length) {
    throw new Error("Postman collection has no requests (item array is empty).")
  }

  const schema = parsed.info?.schema ?? ""
  if (schema && !schema.includes("collection/v2")) {
    warnings.push({
      code: "POSTMAN_SCHEMA",
      message: `Expected Postman Collection v2.x schema; got "${schema}". Import may be incomplete.`,
    })
  }

  const flat = flattenPostmanItems(parsed.item)
  if (!flat.length) {
    throw new Error("No HTTP requests found in the Postman collection.")
  }

  const collectionVariables = Object.fromEntries(
    (parsed.variable ?? [])
      .filter((v) => v.key)
      .map((v) => [v.key!, v.value ?? ""])
  )

  const mode = options.mode ?? "workflow"
  const collectionName = parsed.info?.name?.trim() || "Imported Postman Collection"

  const monitors: Monitor[] =
    mode === "per-request"
      ? flat.map((entry) => {
          const step = postmanRequestToStep(entry.request, entry.name, 1, warnings, entry.folderPath)
          const monitor = createMonitorTemplate({
            name: entry.folderPath ? `${entry.folderPath} / ${entry.name}` : entry.name,
            description: `Imported from Postman request "${entry.name}".`,
            applicationId: options.applicationId,
            steps: [step],
            scheduleMode: options.scheduleMode,
            cron: options.cron,
          })
          monitor.variables = { ...collectionVariables }
          return monitor
        })
      : [
          (() => {
            const steps = flat.map((entry, index) =>
              postmanRequestToStep(entry.request, entry.name, index + 1, warnings, entry.folderPath)
            )
            const monitor = createMonitorTemplate({
              name: collectionName,
              description: `Imported Postman workflow with ${steps.length} step(s).`,
              applicationId: options.applicationId,
              steps,
              scheduleMode: options.scheduleMode,
              cron: options.cron,
            })
            monitor.variables = { ...collectionVariables }
            if (options.baseUrlVariable && options.baseUrlVariable in collectionVariables) {
              // baseUrlVariable hint only — variables already copied
            }
            return monitor
          })(),
        ]

  return {
    monitors,
    warnings,
    stats: {
      requestCount: flat.length,
      monitorCount: monitors.length,
      mode,
    },
  }
}

function flattenPostmanItems(items: PostmanItem[], folderPath = ""): FlatRequest[] {
  const result: FlatRequest[] = []

  for (const item of items) {
    const name = item.name?.trim() || "Untitled"
    if (item.request) {
      result.push({
        name,
        folderPath,
        request: item.request,
      })
    }
    if (item.item?.length) {
      const nextPath = folderPath ? `${folderPath} / ${name}` : name
      result.push(...flattenPostmanItems(item.item, nextPath))
    }
  }

  return result
}

function postmanRequestToStep(
  request: PostmanRequest,
  name: string,
  order: number,
  warnings: ImportWarning[],
  folderPath: string
): MonitorStep {
  const method = (request.method ?? "GET").toUpperCase()
  const url = resolvePostmanUrl(request.url)
  const headers = postmanHeaders(request.header)
  const body = postmanBody(request.body)

  const rawBlob = [url, JSON.stringify(headers), body].join("\n")
  for (const msg of detectSensitiveValues(rawBlob)) {
    warnings.push({
      code: "SENSITIVE_VALUE",
      message: msg,
      path: folderPath ? `${folderPath} / ${name}` : name,
    })
  }

  return createHttpStep({
    name: folderPath ? `${folderPath} — ${name}` : name,
    order,
    method,
    url,
    headers,
    body,
  })
}

function resolvePostmanUrl(url: string | PostmanUrl | undefined): string {
  if (!url) return "https://"
  if (typeof url === "string") return convertTemplateSyntax(url)

  if (url.raw?.trim()) {
    return convertTemplateSyntax(url.raw.trim())
  }

  const host = (url.host ?? []).join(".")
  const path = `/${(url.path ?? []).join("/")}`.replace(/\/+/g, "/")
  const query = (url.query ?? [])
    .filter((q) => q.key && !q.disabled)
    .map((q) => `${encodeURIComponent(q.key!)}=${encodeURIComponent(q.value ?? "")}`)
    .join("&")

  let built = host ? `https://${host}${path}` : path
  if (query) {
    built += (built.includes("?") ? "&" : "?") + query
  }
  return convertTemplateSyntax(built || "https://")
}

function postmanHeaders(
  headers: PostmanRequest["header"]
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const header of headers ?? []) {
    if (header.disabled || !header.key) continue
    result[header.key] = header.value ?? ""
  }
  return result
}

function postmanBody(body: PostmanBody | undefined): string {
  if (!body) return ""

  if (body.mode === "raw" && body.raw) {
    return body.raw
  }

  if (body.mode === "urlencoded" && body.urlencoded?.length) {
    const params = new URLSearchParams()
    for (const entry of body.urlencoded) {
      if (entry.disabled || !entry.key) continue
      params.append(entry.key, entry.value ?? "")
    }
    return params.toString()
  }

  if (body.mode === "formdata" && body.formdata?.length) {
    return JSON.stringify(
      Object.fromEntries(
        body.formdata
          .filter((e) => e.key && !e.disabled)
          .map((e) => [e.key!, e.value ?? ""])
      )
    )
  }

  return body.raw ?? ""
}
