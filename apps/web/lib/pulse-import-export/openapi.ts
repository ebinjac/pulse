import type { Monitor } from "@/lib/pulse-types"
import {
  convertTemplateSyntax,
  createHttpStep,
  createMonitorTemplate,
  detectSensitiveValues,
  parseDocumentInput,
} from "./shared"
import type { ImportWarning, OpenApiImportOptions, OpenApiImportResult, OpenApiOperationPreview } from "./types"

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const

export function importOpenApiDocument(
  document: string | Record<string, unknown>,
  options: OpenApiImportOptions = {}
): OpenApiImportResult {
  const spec = parseDocumentInput(document)
  const warnings: ImportWarning[] = []
  const version = detectSpecVersion(spec)

  if (!version) {
    throw new Error("Unsupported API document. Expected OpenAPI 3.x or Swagger 2.0.")
  }

  const baseUrl = resolveBaseUrl(spec, version, options.baseUrl)
  if (!baseUrl) {
    warnings.push({
      code: "MISSING_BASE_URL",
      message: "No servers/host found. Provide baseUrl in import options or set servers in the spec.",
    })
  }

  const operations = listOperations(spec, version)
  const selected =
    options.operations?.length ?
      operations.filter((op) => options.operations!.includes(op.key))
    : operations

  if (!selected.length) {
    throw new Error("No operations selected for import.")
  }

  const monitors: Monitor[] = selected.map((op) => {
    const url = buildOperationUrl(baseUrl, op.path, op.pathParameters)
    const headers = contentTypeHeader(op.consumes)
    const body = exampleRequestBody(op.requestBodySchema)

    const rawBlob = [url, JSON.stringify(headers), body].join("\n")
    for (const msg of detectSensitiveValues(rawBlob)) {
      warnings.push({ code: "SENSITIVE_VALUE", message: msg, path: op.key })
    }

    const step = createHttpStep({
      name: op.summary || op.key,
      order: 1,
      method: op.method,
      url,
      headers,
      body,
    })

    return createMonitorTemplate({
      name: op.monitorName,
      description: op.description || `Imported OpenAPI operation ${op.key}`,
      applicationId: options.applicationId,
      steps: [step],
      scheduleMode: options.scheduleMode,
      cron: options.cron,
    })
  })

  return {
    monitors,
    warnings,
    operations: operations.map((op) => ({
      key: op.key,
      method: op.method,
      path: op.path,
      summary: op.summary,
      tags: op.tags,
    })),
    stats: {
      operationCount: operations.length,
      monitorCount: monitors.length,
    },
  }
}

function detectSpecVersion(spec: Record<string, unknown>): "2" | "3" | null {
  if (spec.swagger === "2.0" || spec.swagger === 2) return "2"
  const openapi = spec.openapi
  if (typeof openapi === "string" && openapi.startsWith("3")) return "3"
  return null
}

function resolveBaseUrl(
  spec: Record<string, unknown>,
  version: "2" | "3",
  override?: string
): string {
  if (override?.trim()) {
    return override.trim().replace(/\/$/, "")
  }

  if (version === "3") {
    const servers = spec.servers as Array<{ url?: string; variables?: Record<string, { default?: string }> }> | undefined
    const url = servers?.[0]?.url
    if (url) return expandServerUrl(url, servers[0]?.variables).replace(/\/$/, "")
  }

  const host = spec.host as string | undefined
  if (host) {
    const schemes = (spec.schemes as string[] | undefined) ?? ["https"]
    const basePath = (spec.basePath as string | undefined) ?? ""
    return `${schemes[0]}://${host}${basePath}`.replace(/\/$/, "")
  }

  return ""
}

function expandServerUrl(
  url: string,
  variables?: Record<string, { default?: string }>
): string {
  return url.replace(/\{([^}]+)\}/g, (_m, name: string) => {
    const variable = variables?.[name]
    return variable?.default ?? `{${name}}`
  })
}

interface ParsedOperation {
  key: string
  method: string
  path: string
  summary: string
  description: string
  monitorName: string
  tags: string[]
  pathParameters: string[]
  consumes?: string[]
  requestBodySchema?: unknown
}

function listOperations(spec: Record<string, unknown>, version: "2" | "3"): ParsedOperation[] {
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined
  if (!paths) return []

  const result: ParsedOperation[] = []

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as Record<string, unknown> | undefined
      if (!operation) continue

      const methodUpper = method.toUpperCase()
      const key = `${methodUpper} ${path}`
      const summary = String(operation.summary ?? operation.operationId ?? key)
      const tags = Array.isArray(operation.tags) ? operation.tags.map(String) : []

      result.push({
        key,
        method: methodUpper,
        path,
        summary,
        description: String(operation.description ?? ""),
        monitorName: tags.length ? `${tags[0]} — ${summary}` : summary,
        tags,
        pathParameters: extractPathParameters(path, operation, version),
        consumes: version === "2" ? (operation.consumes as string[] | undefined) : undefined,
        requestBodySchema: extractRequestBodySchema(operation, version),
      })
    }
  }

  return result.sort((a, b) => a.key.localeCompare(b.key))
}

function extractPathParameters(
  path: string,
  operation: Record<string, unknown>,
  version: "2" | "3"
): string[] {
  const fromPath = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!)
  const params = operation.parameters as Array<Record<string, unknown>> | undefined
  const fromParams =
    params
      ?.filter((p) => p.in === "path" && p.name)
      .map((p) => String(p.name)) ?? []
  return [...new Set([...fromPath, ...fromParams])]
}

function extractRequestBodySchema(
  operation: Record<string, unknown>,
  version: "2" | "3"
): unknown {
  if (version === "3") {
    const requestBody = operation.requestBody as Record<string, unknown> | undefined
    const content = requestBody?.content as Record<string, { schema?: unknown }> | undefined
    if (!content) return undefined
    const json = content["application/json"]
    return json?.schema
  }

  const params = operation.parameters as Array<Record<string, unknown>> | undefined
  const bodyParam = params?.find((p) => p.in === "body")
  return bodyParam?.schema
}

function buildOperationUrl(
  baseUrl: string,
  path: string,
  pathParameters: string[]
): string {
  let resolvedPath = path
  for (const param of pathParameters) {
    resolvedPath = resolvedPath.replace(
      `{${param}}`,
      `{{variables.${param}}}`
    )
  }

  const prefix = baseUrl || "{{variables.baseUrl}}"
  const joined = `${prefix}${resolvedPath.startsWith("/") ? "" : "/"}${resolvedPath}`
  return convertTemplateSyntax(joined)
}

function contentTypeHeader(consumes?: string[]): Record<string, string> {
  const type = consumes?.[0] ?? "application/json"
  if (type.includes("json")) {
    return { "Content-Type": "application/json" }
  }
  return { "Content-Type": type }
}

function exampleRequestBody(schema: unknown): string {
  if (!schema || typeof schema !== "object") return ""

  const s = schema as Record<string, unknown>
  if (s.example !== undefined) {
    return typeof s.example === "string" ? s.example : JSON.stringify(s.example, null, 2)
  }

  if (s.default !== undefined) {
    return typeof s.default === "string" ? s.default : JSON.stringify(s.default, null, 2)
  }

  const props = s.properties as Record<string, unknown> | undefined
  if (props) {
    const example = Object.fromEntries(
      Object.entries(props).map(([key, value]) => {
        const prop = value as Record<string, unknown>
        return [key, prop.example ?? prop.default ?? ""]
      })
    )
    return JSON.stringify(example, null, 2)
  }

  return ""
}
