import type { Monitor, MonitorRun, MonitorStatus, PulseAssertion } from "./pulse-types"

function numericValue(value: string | undefined) {
  if (!value) return Number.NaN

  return Number(value.replace(/[^\d.]/g, ""))
}

function assertionFails(assertion: PulseAssertion) {
  if (assertion.actual === undefined) return false

  if (assertion.operator === "equals") {
    return assertion.actual !== assertion.expected
  }

  if (assertion.operator === "notEquals") {
    return assertion.actual === assertion.expected
  }

  if (assertion.operator === "lessThan") {
    return numericValue(assertion.actual) >= numericValue(assertion.expected)
  }

  if (assertion.operator === "greaterThan") {
    return numericValue(assertion.actual) <= numericValue(assertion.expected)
  }

  if (assertion.operator === "exists") {
    return assertion.actual === "" || assertion.actual === "missing"
  }

  return false
}

export function buildMockRun(draft: Monitor): MonitorRun {
  const startedAt = new Date()
  const steps = draft.steps.map((step, index) => {
    const latencyMs = step.type === "preRequest" ? 26 + index * 9 : 280 + index * 170
    const isLast = index === draft.steps.length - 1
    const hasAssertionFailure = step.assertions.some(assertionFails)
    const status: MonitorStatus =
      hasAssertionFailure || (isLast && draft.name.toLowerCase().includes("fail"))
        ? "failed"
        : "success"

    return {
      id: `mock-step-${step.id}`,
      stepId: step.id,
      stepName: step.name,
      type: step.type,
      status,
      latencyMs,
      requestSummary:
        step.type === "http"
          ? `${step.method ?? "GET"} ${step.url ?? "{{variables.baseUrl}}"}. Sensitive headers/body values masked before storage.`
          : `Executed ${(step.actions ?? []).length} controlled pre-request action. Secret inputs masked.`,
      responseSummary:
        step.type === "http"
          ? `${status === "success" ? "200" : "503"} application/json, masked and truncated to ${draft.responseBodyLimitKb} KB.`
          : "Generated outputs available to later steps as masked runtime variables.",
      assertions: step.assertions.map((assertion) => ({
        ...assertion,
        actual: assertion.sensitive ? "********" : assertion.actual ?? assertion.expected,
      })),
      extractors: step.extractors,
      errorMessage:
        status === "failed"
          ? hasAssertionFailure
            ? "One or more assertions failed."
            : "Mock failure triggered by monitor name containing fail."
          : undefined,
    }
  })
  const failedStep = steps.find((step) => step.status === "failed")
  const durationMs = steps.reduce((sum, step) => sum + step.latencyMs, 0)
  const endedAt = new Date(startedAt.getTime() + durationMs)

  return {
    id: `mock-${startedAt.getTime()}`,
    monitorId: draft.id,
    monitorName: draft.name,
    status: failedStep ? "failed" : "success",
    triggeredBy: "manual",
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs,
    failureCategory: failedStep ? "ASSERTION_FAILURE" : undefined,
    failureReason: failedStep
      ? `${failedStep.stepName} failed during local mocked execution.`
      : undefined,
    steps,
  }
}

export function maskMonitorForApi(monitor: Monitor) {
  return {
    ...monitor,
    secretAliases: monitor.secretAliases.map((alias) => alias),
  }
}
