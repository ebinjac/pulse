"use client"

import { Description, Input, Label, TextField } from "@workspace/ui/components/ui"
import type { ElfInferredField, LogFieldMapping } from "@/lib/pulse-types"

const FIELD_ROLES: Array<{ key: keyof LogFieldMapping; label: string }> = [
  { key: "timestamp", label: "Timestamp" },
  { key: "level", label: "Level" },
  { key: "message", label: "Message" },
  { key: "service", label: "Service" },
  { key: "endpoint", label: "Endpoint" },
  { key: "statusCode", label: "Status code" },
  { key: "responseTimeMs", label: "Response time (ms)" },
  { key: "exceptionType", label: "Exception type" },
  { key: "traceId", label: "Trace ID" },
]

export function ElfFieldMapper({
  mapping,
  inferredFields,
  onChange,
}: {
  mapping: LogFieldMapping
  inferredFields?: ElfInferredField[]
  onChange: (next: LogFieldMapping) => void
}) {
  const suggestions = new Map<string, string>()
  inferredFields?.forEach((field) => {
    if (field.suggestedRole) {
      suggestions.set(field.suggestedRole, field.path)
    }
  })

  return (
    <div className="space-y-3">
      <Description className="text-xs">
        Map log document paths to semantic roles. Application and service defaults are merged at probe time.
      </Description>
      {FIELD_ROLES.map(({ key, label }) => {
        const suggested = suggestions.get(key)
        const value = mapping[key] || ""
        return (
          <TextField key={key} className="w-full">
            <Label className="flex items-center justify-between gap-2">
              <span>{label}</span>
              {suggested && suggested !== value ? (
                <button
                  type="button"
                  className="text-[10px] font-normal text-primary underline"
                  onClick={() => onChange({ ...mapping, [key]: suggested })}
                >
                  Use {suggested}
                </button>
              ) : null}
            </Label>
            <Input
              variant="secondary"
              fullWidth
              value={value}
              placeholder={suggested || key}
              onChange={(e) => onChange({ ...mapping, [key]: e.target.value })}
            />
          </TextField>
        )
      })}
    </div>
  )
}

export function mergeFieldMapping(
  applicationMapping?: LogFieldMapping,
  serviceMapping?: LogFieldMapping,
  queryMapping?: LogFieldMapping,
): LogFieldMapping {
  return {
    ...defaultMapping(),
    ...nonEmptyMapping(applicationMapping),
    ...nonEmptyMapping(serviceMapping),
    ...nonEmptyMapping(queryMapping),
  }
}

function defaultMapping(): LogFieldMapping {
  return {
    timestamp: "@timestamp",
    level: "level",
    message: "message",
    service: "service",
    endpoint: "endpoint",
    statusCode: "statusCode",
    responseTimeMs: "responseTimeMs",
    exceptionType: "exceptionType",
    traceId: "traceId",
  }
}

function nonEmptyMapping(mapping?: LogFieldMapping): LogFieldMapping {
  if (!mapping) return {}
  const out: LogFieldMapping = {}
  for (const [key, value] of Object.entries(mapping)) {
    if (typeof value === "string" && value.trim()) {
      ;(out as Record<string, string>)[key] = value.trim()
    }
  }
  return out
}
