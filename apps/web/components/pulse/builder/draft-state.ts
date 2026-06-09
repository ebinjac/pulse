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
