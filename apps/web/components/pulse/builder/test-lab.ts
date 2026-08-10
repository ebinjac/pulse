import type { Monitor, MonitorStep } from "@/lib/pulse-types"
import { defaultHttpConfig, normalizeStepOrder } from "./draft-state"

export interface BuilderTestScenario {
  id: string
  title: string
  summary: string
  covers: string[]
  apply: (draft: Monitor) => Monitor
}

const fixtureBaseToken = "{{variables.fixtureBaseUrl}}"

export const builderTestScenarios: BuilderTestScenario[] = [
  {
    id: "fixture-health",
    title: "Local health check",
    summary: "Runs a deterministic local GET and validates status/body extraction.",
    covers: ["draft run", "status assertion", "JSONPath assertion", "extractor"],
    apply: (draft) =>
      withScenario(draft, "QA Fixture Health", [
        httpStep(1, "Fixture health", "GET", `${fixtureBaseToken}/health`, {
          assertions: [
            assertion("status", "statusCode", "status", "equals", "200"),
            assertion("ok", "jsonPath", "$.ok", "equals", "true"),
          ],
          extractors: [extractor("fixtureVersion", "jsonPath", "$.version")],
        }),
      ]),
  },
  {
    id: "script-override",
    title: "Pre-request script override",
    summary: "Mutates request URL, adds headers, logs output, and records a nested sendRequest diagnostic.",
    covers: ["pm.variables", "pm.request.url", "pm.request.headers", "pm.sendRequest", "console output"],
    apply: (draft) =>
      withScenario(draft, "QA Script Override", [
        preRequestStep(1, "Pre-request setup step", {
          actions: [
            {
              id: "action-fixture-token",
              type: "setVariable",
              label: "Set fixture token",
              output: "token",
              configPreview: "fixture-token-123",
            },
          ],
          script: `pm.variables.set("scriptVar", "from-script");
console.log("scriptVar", pm.variables.get("scriptVar"));`,
        }),
        httpStep(2, "Scripted echo request", "POST", `${fixtureBaseToken}/missing`, {
          body: JSON.stringify({ source: "{{variables.scriptVar}}" }, null, 2),
          script: `pm.request.url = pm.variables.get("fixtureBaseUrl") + "/echo?mode=script";
pm.request.method = "POST";
pm.request.headers.add("Content-Type", "application/json");
pm.request.headers.add("X-Test-Token", pm.variables.get("token"));
pm.sendRequest(pm.variables.get("fixtureBaseUrl") + "/health", function (err, response) {
  console.log("nested status", response.code);
});`,
          assertions: [
            assertion("status", "statusCode", "status", "equals", "200"),
            assertion("echo-mode", "jsonPath", "$.query", "contains", "mode=script"),
          ],
          extractors: [extractor("echoMethod", "jsonPath", "$.method")],
        }),
      ]),
  },
  {
    id: "auth-token-chain",
    title: "Token chain",
    summary: "Fetches a token, extracts it, and uses it in a later bearer-auth request.",
    covers: ["multi-step", "extractor reuse", "bearer auth", "template suggestions"],
    apply: (draft) =>
      withScenario(draft, "QA Token Chain", [
        httpStep(1, "Fetch fixture token", "POST", `${fixtureBaseToken}/token`, {
          assertions: [assertion("status", "statusCode", "status", "equals", "200")],
          extractors: [extractor("accessToken", "jsonPath", "$.access_token", true)],
        }),
        httpStep(2, "Use extracted token", "GET", `${fixtureBaseToken}/echo`, {
          auth: { type: "bearer", token: "{{variables.accessToken}}" },
          assertions: [
            assertion("status", "statusCode", "status", "equals", "200"),
            assertion("auth-header", "jsonPath", "$.headers.Authorization", "contains", "Bearer"),
          ],
        }),
      ]),
  },
  {
    id: "cookies",
    title: "Cookie jar",
    summary: "Sets a cookie in one step and verifies the per-run cookie jar sends it to the next request.",
    covers: ["cookie jar", "multi-step", "JSONPath assertion"],
    apply: (draft) =>
      withScenario(draft, "QA Cookie Jar", [
        httpStep(1, "Set fixture cookie", "GET", `${fixtureBaseToken}/cookies?set=true`, {
          assertions: [assertion("status", "statusCode", "status", "equals", "200")],
        }),
        httpStep(2, "Read fixture cookie", "GET", `${fixtureBaseToken}/cookies`, {
          assertions: [
            assertion("status", "statusCode", "status", "equals", "200"),
            assertion("cookie", "jsonPath", "$.sessionCookie", "equals", "session-123"),
          ],
        }),
      ]),
  },
  {
    id: "synthetic",
    title: "Synthetic checks",
    summary: "Builds DNS, TCP, TLS, and delay checks with assertion examples.",
    covers: ["DNS", "TCP", "TLS", "delay", "synthetic assertions"],
    apply: (draft) =>
      withScenario(draft, "QA Synthetic Checks", [
        syntheticStep(1, "DNS localhost", "dns", { host: "localhost", recordType: "A" }, [
          assertion("dns-records", "dnsRecords", "records", "contains", "127."),
        ]),
        syntheticStep(2, "TCP local API", "tcp", { host: "localhost", port: "8080" }, [
          assertion("tcp-latency", "responseTime", "responseTime", "lessThan", "1000"),
        ]),
        syntheticStep(3, "TLS example.com", "tls", { host: "example.com", port: "443" }, [
          assertion("tls-expiry", "certExpiryDays", "certExpiryDays", "greaterThan", "7"),
        ]),
        syntheticStep(4, "Short delay", "delay", { delayMs: "250" }, []),
      ]),
  },
  {
    id: "intentional-failure",
    title: "Intentional failure",
    summary: "Uses a fixture 500 response to verify failure display, assertions, and continue-on-failure.",
    covers: ["failure handling", "assertion failure", "continue on failure"],
    apply: (draft) =>
      withScenario(draft, "QA Intentional Failure", [
        {
          ...httpStep(1, "Expected fixture failure", "GET", `${fixtureBaseToken}/failure`, {
            assertions: [assertion("status", "statusCode", "status", "equals", "200")],
          }),
          continueOnFailure: true,
        },
        httpStep(2, "Still runs after failure", "GET", `${fixtureBaseToken}/health`, {
          assertions: [assertion("status", "statusCode", "status", "equals", "200")],
        }),
      ]),
  },
]

function withScenario(draft: Monitor, name: string, steps: MonitorStep[]): Monitor {
  return {
    ...draft,
    name,
    description: "Generated by Builder Test Lab for local QA.",
    scheduleMode: "manual",
    scheduleLabel: "Manual",
    cron: "",
    variables: {
      ...draft.variables,
      fixtureBaseUrl: "http://localhost:8080/api/qa/monitor-fixtures",
    },
    alertPolicy: {
      ...draft.alertPolicy,
      enabled: false,
    },
    steps: normalizeStepOrder(steps),
  }
}

function httpStep(
  order: number,
  name: string,
  method: string,
  url: string,
  options: {
    body?: string
    script?: string
    auth?: Record<string, any>
    assertions?: MonitorStep["assertions"]
    extractors?: MonitorStep["extractors"]
  } = {},
): MonitorStep {
  return {
    id: `step-${crypto.randomUUID()}`,
    order,
    name,
    type: "http",
    method,
    url,
    timeoutMs: 10000,
    retryCount: 0,
    continueOnFailure: false,
    actions: [],
    assertions: options.assertions ?? [],
    extractors: options.extractors ?? [],
    preRequestScript: options.script ?? "",
    config: {
      ...defaultHttpConfig(),
      body: options.body ?? "",
      auth: options.auth ?? { type: "noAuth" },
    },
  }
}

function preRequestStep(
  order: number,
  name: string,
  options: { actions?: MonitorStep["actions"]; script?: string },
): MonitorStep {
  return {
    id: `step-${crypto.randomUUID()}`,
    order,
    name,
    type: "preRequest",
    timeoutMs: 5000,
    retryCount: 0,
    continueOnFailure: false,
    actions: options.actions ?? [],
    assertions: [],
    extractors: [],
    preRequestScript: options.script ?? "",
    config: {},
  }
}

function syntheticStep(
  order: number,
  name: string,
  type: "dns" | "tcp" | "tls" | "delay",
  config: Record<string, string>,
  assertions: MonitorStep["assertions"],
): MonitorStep {
  return {
    id: `step-${crypto.randomUUID()}`,
    order,
    name,
    type,
    timeoutMs: Number(config.delayMs) || (type === "tls" ? 8000 : 5000),
    retryCount: 0,
    continueOnFailure: false,
    assertions,
    extractors: [],
    config,
  }
}

function assertion(id: string, type: string, target: string, operator: string, expected: string) {
  return {
    id: `assert-${id}`,
    type: type as any,
    label: `${target} ${operator} ${expected}`,
    target,
    operator,
    expected,
  }
}

function extractor(name: string, type: string, source: string, sensitive = false) {
  return {
    id: `extract-${name}`,
    name,
    type: type as any,
    source,
    sensitive,
    optional: false,
  }
}
