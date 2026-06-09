export interface ParsedCurlStep {
  name: string
  method: string
  url: string
  headers: Record<string, string>
  bodyType: "json" | "form" | "text" | "none"
  body: string
  assertions: Array<{
    type: string
    label: string
    target: string
    operator: string
    expected: string
  }>
  warnings: string[]
}

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function extractFlagValue(command: string, flags: string[]): string | null {
  for (const flag of flags) {
    const flagPattern = new RegExp(
      `(?:^|\\s)${flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|=|['"])`,
      "i",
    )
    const match = flagPattern.exec(command)
    if (!match) continue

    let index = match.index + match[0].length
    while (index < command.length && (command[index] === " " || command[index] === "=")) {
      index++
    }

    if (index >= command.length) continue

    const quote = command[index]
    if (quote === "'" || quote === '"') {
      let end = index + 1
      while (end < command.length) {
        if (command[end] === quote && command[end - 1] !== "\\") break
        end++
      }
      if (end < command.length) {
        return command.slice(index + 1, end)
      }
      continue
    }

    const rest = command.slice(index)
    const tokenMatch = rest.match(/^[^\s]+/)
    return tokenMatch ? tokenMatch[0] : null
  }
  return null
}

function removeFlagSegments(command: string, flags: string[]): string {
  let result = command
  for (const flag of flags) {
    const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const patterns = [
      new RegExp(`(?:^|\\s)${escaped}(?:\\s*=\\s*|\\s*)['"]([\\s\\S]*?)['"]`, "gi"),
      new RegExp(`(?:^|\\s)${escaped}(?:\\s*=\\s*|\\s*)([^\\s]+)`, "gi"),
    ]
    for (const pattern of patterns) {
      result = result.replace(pattern, " ")
    }
  }
  return result.replace(/\s+/g, " ").trim()
}

function detectBodyType(headers: Record<string, string>, body: string): ParsedCurlStep["bodyType"] {
  if (!body) return "none"
  const contentType = Object.entries(headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? ""
  if (contentType.includes("application/json") || contentType.includes("+json")) return "json"
  if (contentType.includes("application/x-www-form-urlencoded")) return "form"
  try {
    JSON.parse(body)
    return "json"
  } catch {
    return "text"
  }
}

function stepNameFromUrl(method: string, url: string): string {
  try {
    const pathname = new URL(url).pathname
    const segment = pathname.split("/").filter(Boolean).pop() || "request"
    return `${method} ${segment}`
  } catch {
    return `${method} request`
  }
}

function collectSecurityWarnings(headers: Record<string, string>, body: string): string[] {
  const warnings: string[] = []
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase()
    if (lower === "authorization" || lower.includes("api-key") || lower.includes("token")) {
      warnings.push(`Header "${key}" appears to contain a credential — use a Rythm secret reference instead.`)
    }
    if (/bearer\s+/i.test(value) || /basic\s+/i.test(value)) {
      warnings.push(`Value in "${key}" looks like an auth token — replace with a secret alias before publishing.`)
    }
  }
  if (/(api[_-]?key|client_secret|password|passwd)\s*[:=]/i.test(body)) {
    warnings.push("Request body may contain hardcoded secrets — use secret references in the monitor builder.")
  }
  return warnings
}

function normalizeCurlInput(raw: string): string {
  return raw
    .trim()
    .replace(/^curl\s+/i, "")
    .replace(/\\\r?\n/g, " ")
}

export function parseCurlCommand(raw: string): ParsedCurlStep | null {
  if (!raw.trim()) return null

  const command = normalizeCurlInput(raw)

  const methodFlag = extractFlagValue(command, ["-X", "--request"])
  let method = methodFlag?.toUpperCase() ?? "GET"
  if (!HTTP_METHODS.has(method)) {
    method = "GET"
  }

  const headers: Record<string, string> = {}
  const headerPattern = /(?:^|\s)(?:-H|--header)\s+(['"])([\s\S]*?)\1/g
  let headerMatch: RegExpExecArray | null
  while ((headerMatch = headerPattern.exec(command)) !== null) {
    const headerLine = headerMatch[2]
    if (!headerLine) continue
    const colon = headerLine.indexOf(":")
    if (colon === -1) continue
    const key = headerLine.slice(0, colon).trim()
    const value = headerLine.slice(colon + 1).trim()
    if (key) headers[key] = value
  }

  const body =
    extractFlagValue(command, ["--data-raw", "--data-binary", "--data", "-d"])?.trim() ?? ""

  if (!methodFlag && body) {
    method = "POST"
  }

  const withoutFlags = removeFlagSegments(command, [
    "-H",
    "--header",
    "-d",
    "--data",
    "--data-raw",
    "--data-binary",
    "-X",
    "--request",
    "-u",
    "--user",
    "-A",
    "--user-agent",
    "-b",
    "--cookie",
  ])

  const urlMatch = withoutFlags.match(/https?:\/\/[^\s'"]+/i)
  if (!urlMatch) return null

  const url = stripWrappingQuotes(urlMatch[0])
  const bodyType = detectBodyType(headers, body)
  const normalizedBody =
    bodyType === "json"
      ? (() => {
          try {
            return JSON.stringify(JSON.parse(body), null, 2)
          } catch {
            return body
          }
        })()
      : body

  return {
    name: stepNameFromUrl(method, url),
    method,
    url,
    headers,
    bodyType,
    body: normalizedBody,
    assertions: [
      {
        type: "statusCode",
        label: "Status is 200",
        target: "status",
        operator: "equals",
        expected: "200",
      },
    ],
    warnings: collectSecurityWarnings(headers, normalizedBody),
  }
}
