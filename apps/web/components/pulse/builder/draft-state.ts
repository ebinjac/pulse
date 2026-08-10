import type { Monitor, MonitorStep, PulseAssertion } from "@/lib/pulse-types"

export function configFromMonitor(monitor: Monitor) {
  return {
    applicationId: monitor.applicationId || "",
    name: monitor.name,
    description: monitor.description,
    scheduleMode: monitor.scheduleMode,
    schedule: monitor.cron,
    timezone: monitor.timezone,
    timeoutMs: monitor.timeoutMs,
    retryCount: monitor.retryCount,
    failureThreshold: monitor.failureThreshold,
    responseBodyLimitKb: monitor.responseBodyLimitKb,
    isActive: monitor.isActive,
    variables: monitor.variables,
    secrets: monitor.secretAliases.map((alias) => ({
      alias,
      provider: "encrypted-db",
      masked: true,
    })),
    alerts: monitor.alertPolicy,
    steps: monitor.steps.map((step) => ({
      id: step.id,
      name: step.name,
      type: step.type,
      method: step.method,
      url: step.url,
      timeoutMs: step.timeoutMs,
      retryCount: step.retryCount,
      continueOnFailure: step.continueOnFailure,
      actions: step.actions ?? [],
      assertions: step.assertions,
      extractors: step.extractors,
      preRequestScript: step.preRequestScript,
      config: step.config ?? {},
    })),
  }
}

export function validateMonitor(draft: Monitor) {
  const errors: string[] = []

  if (!draft.name.trim()) errors.push("Monitor name is required.")
  if (!draft.cron.trim() && draft.scheduleMode !== "manual") errors.push("Cron expression is required for scheduled monitors.")
  if (draft.timeoutMs < 1000) errors.push("Monitor timeout should be at least 1000ms.")
  if (draft.responseBodyLimitKb < 1) errors.push("Response body limit should be at least 1 KB.")
  if (!draft.steps.length) errors.push("At least one step is required.")

  draft.steps.forEach((step, index) => {
    if (!step.name.trim()) errors.push(`Step ${index + 1} needs a name.`)
    if (step.type === "http" && !step.url?.trim()) errors.push(`Step ${index + 1} needs a URL.`)
    if (["dns", "tcp", "tls"].includes(step.type)) {
      const host = String(step.config?.host || step.url || "").trim()
      if (!host) errors.push(`Step ${index + 1} needs a host.`)
    }
  })

  return errors
}

export interface ScriptDiagnostic {
  stepId: string
  stepName: string
  severity: "warning" | "danger"
  message: string
}

export function analyzeMonitorScripts(draft: Monitor): ScriptDiagnostic[] {
  const diagnostics: ScriptDiagnostic[] = []
  const knownVariables = new Set(Object.keys(draft.variables || {}))
  const knownSecrets = new Set((draft.secretAliases || []).map((alias) => alias.trim()).filter(Boolean))

  for (const step of draft.steps) {
    for (const action of step.actions || []) {
      if (action.output) knownVariables.add(action.output)
    }
    for (const extractor of step.extractors || []) {
      if (extractor.name) knownVariables.add(extractor.name)
    }
    for (const variable of scriptAssignedVariables(step.preRequestScript || "")) {
      knownVariables.add(variable)
    }
  }

  for (const step of draft.steps) {
    const script = step.preRequestScript || ""
    if (!script.trim()) continue

    const syntaxError = syntaxErrorForScript(script)
    if (syntaxError) {
      diagnostics.push({
        stepId: step.id,
        stepName: step.name,
        severity: "danger",
        message: `Script syntax error: ${syntaxError}`,
      })
    }

    for (const variable of scriptReadVariables(script)) {
      if (!knownVariables.has(variable)) {
        diagnostics.push({
          stepId: step.id,
          stepName: step.name,
          severity: "warning",
          message: `References unknown variable "${variable}". Add it in Variables or extract/set it in an earlier step.`,
        })
      }
    }

    for (const secret of scriptReadSecrets(script)) {
      if (!knownSecrets.has(secret)) {
        diagnostics.push({
          stepId: step.id,
          stepName: step.name,
          severity: "warning",
          message: `References unbound secret alias "${secret}". Bind it in Variables & secrets before running.`,
        })
      }
    }
  }

  return diagnostics
}

export function validateJsonConfig(raw: string): string[] {
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return [error instanceof Error ? error.message : "Invalid JSON."]
  }

  const errors: string[] = []
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return ["JSON config must be an object."]
  }
  if (typeof parsed.name !== "string" || !parsed.name.trim()) {
    errors.push("name must be a non-empty string.")
  }
  if (!Array.isArray(parsed.steps)) {
    errors.push("steps must be an array.")
  }
  if (parsed.lastRunAt === "") {
    errors.push("lastRunAt is runtime metadata and cannot be an empty string. Remove it from JSON config.")
  }
  if (parsed.createdAt === "") {
    errors.push("createdAt is runtime metadata and cannot be an empty string. Remove it from JSON config.")
  }
  if (parsed.updatedAt === "") {
    errors.push("updatedAt is runtime metadata and cannot be an empty string. Remove it from JSON config.")
  }
  if (parsed.timeoutMs !== undefined && (!Number.isFinite(Number(parsed.timeoutMs)) || Number(parsed.timeoutMs) < 1000)) {
    errors.push("timeoutMs must be at least 1000.")
  }
  if (
    parsed.responseBodyLimitKb !== undefined &&
    (!Number.isFinite(Number(parsed.responseBodyLimitKb)) || Number(parsed.responseBodyLimitKb) < 1)
  ) {
    errors.push("responseBodyLimitKb must be at least 1.")
  }

  if (Array.isArray(parsed.steps)) {
    parsed.steps.forEach((step: any, index: number) => {
      const prefix = `steps[${index}]`
      if (!step || typeof step !== "object") {
        errors.push(`${prefix} must be an object.`)
        return
      }
      if (typeof step.name !== "string" || !step.name.trim()) errors.push(`${prefix}.name is required.`)
      if (typeof step.type !== "string" || !step.type.trim()) errors.push(`${prefix}.type is required.`)
      if (step.type === "http" && (typeof step.url !== "string" || !step.url.trim())) {
        errors.push(`${prefix}.url is required for HTTP steps.`)
      }
      if (!Array.isArray(step.assertions)) errors.push(`${prefix}.assertions must be an array.`)
      if (!Array.isArray(step.extractors)) errors.push(`${prefix}.extractors must be an array.`)
    })
  }

  return errors
}

export function checkAssertionFailed(assertion: PulseAssertion) {
  if (assertion.actual === undefined || assertion.actual === null) return true

  const actual = String(assertion.actual)
  const expected = String(assertion.expected)

  switch (assertion.operator) {
    case "equals":
      return actual !== expected
    case "notEquals":
      return actual === expected
    case "contains":
      return !actual.includes(expected)
    case "notContains":
      return actual.includes(expected)
    case "exists":
      return actual === "" || actual === "missing" || actual === "null"
    case "notExists":
      return actual !== "" && actual !== "missing" && actual !== "null"
    case "greaterThan": {
      const actNum = Number(actual.replace(/[^\d.]/g, ""))
      const expNum = Number(expected.replace(/[^\d.]/g, ""))
      return Number.isNaN(actNum) || Number.isNaN(expNum) || actNum <= expNum
    }
    case "lessThan": {
      const actNum = Number(actual.replace(/[^\d.]/g, ""))
      const expNum = Number(expected.replace(/[^\d.]/g, ""))
      return Number.isNaN(actNum) || Number.isNaN(expNum) || actNum >= expNum
    }
    default:
      return false
  }
}

export function normalizeStepOrder(steps: MonitorStep[]) {
  return steps.map((step, index) => ({
    ...step,
    order: index + 1,
  }))
}

export function queryParamsFromUrl(url: string | undefined) {
  const raw = url ?? ""
  const queryStart = raw.indexOf("?")
  if (queryStart === -1) return []
  const hashStart = raw.indexOf("#", queryStart)
  const query = raw.slice(queryStart + 1, hashStart === -1 ? raw.length : hashStart)
  if (!query) return []

  return query
    .split("&")
    .filter(Boolean)
    .map((part) => {
      const [rawKey = "", ...rest] = part.split("=")
      return {
        key: decodeParamPart(rawKey),
        value: decodeParamPart(rest.join("=")),
      }
    })
}

export function urlWithQueryParams(url: string | undefined, params: Array<{ key: string; value: string }>) {
  const raw = url ?? ""
  const hashStart = raw.indexOf("#")
  const hash = hashStart === -1 ? "" : raw.slice(hashStart)
  const withoutHash = hashStart === -1 ? raw : raw.slice(0, hashStart)
  const queryStart = withoutHash.indexOf("?")
  const base = queryStart === -1 ? withoutHash : withoutHash.slice(0, queryStart)
  const query = params
    .filter((param) => param.key.trim())
    .map((param) => `${encodeParamPart(param.key.trim())}=${encodeParamPart(param.value)}`)
    .join("&")
  return `${base}${query ? `?${query}` : ""}${hash}`
}

function decodeParamPart(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "))
  } catch {
    return value
  }
}

function encodeParamPart(value: string) {
  return encodeURIComponent(value)
    .replace(/%7B/g, "{")
    .replace(/%7D/g, "}")
}

export function applyJsonToMonitor(current: Monitor, raw: string): { draft?: Monitor; error?: string } {
  try {
    const validationErrors = validateJsonConfig(raw)
    if (validationErrors.length) {
      return { error: validationErrors.join(" ") }
    }

    const parsed = JSON.parse(raw) as Partial<Monitor> & {
      schedule?: string
      secrets?: Array<{ alias?: string }>
    }

    if (!parsed.name || !Array.isArray(parsed.steps)) {
      return { error: "JSON must include at least name and steps." }
    }

    return {
      draft: {
        ...current,
        ...parsed,
        cron: parsed.cron ?? parsed.schedule ?? current.cron,
        secretAliases: parsed.secretAliases ?? parsed.secrets?.map((secret) => secret.alias).filter(Boolean) as string[] ?? current.secretAliases,
        steps: parsed.steps.map((step, index) => ({
          ...current.steps[index],
          ...step,
          id: step.id ?? current.steps[index]?.id ?? `step-${index + 1}`,
          order: step.order ?? index + 1,
          timeoutMs: step.timeoutMs ?? current.steps[index]?.timeoutMs ?? current.timeoutMs,
          retryCount: step.retryCount ?? current.steps[index]?.retryCount ?? 0,
          continueOnFailure: step.continueOnFailure ?? current.steps[index]?.continueOnFailure ?? false,
          assertions: step.assertions ?? [],
          extractors: step.extractors ?? [],
        })) as MonitorStep[],
      },
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid JSON." }
  }
}

export function defaultHttpConfig(): NonNullable<MonitorStep["config"]> {
  return {
    headers: {},
    body: "",
    auth: { type: "noAuth" as const },
    cookies: { enabled: true, mode: "jar" as const, manual: [] },
    mtls: { mode: "global" as const, enabled: false, insecureSkipVerify: false },
    proxy: { enabled: false },
  }
}

function syntaxErrorForScript(script: string) {
  try {
    new Function(script)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid JavaScript"
  }
}

function scriptAssignedVariables(script: string) {
  return captureStringArguments(script, /pm\.(?:variables|environment)\.set\(\s*(["'`])([^"'`]+)\1/g)
}

function scriptReadVariables(script: string) {
  return captureStringArguments(script, /pm\.(?:variables|environment)\.get\(\s*(["'`])([^"'`]+)\1/g)
}

function scriptReadSecrets(script: string) {
  return captureStringArguments(script, /pm\.secrets\.get\(\s*(["'`])([^"'`]+)\1/g)
}

function captureStringArguments(script: string, pattern: RegExp) {
  const values = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = pattern.exec(script)) !== null) {
    const value = match[2]?.trim()
    if (value) values.add(value)
  }
  return values
}
