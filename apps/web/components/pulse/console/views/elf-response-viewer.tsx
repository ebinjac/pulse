"use client"

import { useMemo, useState } from "react"
import { Copy, Download, Plus, Search } from "lucide-react"
import { Button, Card, Chip, Description, Input, Label, Table, Tabs, TextField } from "@workspace/ui/components/ui"
import type { ElfInferredField, ElfQueryProbeResult } from "@/lib/pulse-types"

const PINNED_ROLE_ORDER = [
  "@timestamp",
  "timestamp",
  "level",
  "service",
  "environment",
  "endpoint",
  "statusCode",
  "responseTimeMs",
  "exceptionType",
  "downstreamService",
  "traceId",
  "message",
]

function CopyButton({ text }: { text: string }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      className="h-7 gap-1"
      onPress={() => void navigator.clipboard.writeText(text)}
    >
      <Copy className="size-3.5" />
      Copy
    </Button>
  )
}

export function ElfResponseViewer({
  probe,
  readOnly = false,
  onAddRuleFromField,
}: {
  probe: ElfQueryProbeResult | null
  readOnly?: boolean
  onAddRuleFromField?: (path: string, sampleValue?: string) => void
}) {
  const [selectedTab, setSelectedTab] = useState<string>("logs")
  const [fieldFilter, setFieldFilter] = useState("")
  const [pinnedFirst, setPinnedFirst] = useState(true)

  const jsonText = useMemo(() => {
    if (!probe?.rawResponse) return ""
    return JSON.stringify(probe.rawResponse, null, 2)
  }, [probe?.rawResponse])

  const fields = useMemo(() => {
    const byPath = new Map<string, ElfInferredField>()
    for (const field of probe?.fieldSchema?.fields || []) {
      byPath.set(field.path, field)
    }
    for (const field of probe?.inferredFields || []) {
      byPath.set(field.path, { ...byPath.get(field.path), ...field })
    }
    return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path))
  }, [probe])

  const discoveredSamplePaths = useMemo(() => {
    const paths = new Set<string>()
    for (const hit of probe?.sampleHits || []) {
      collectLeafPaths(hit, "", paths)
    }
    return paths
  }, [probe?.sampleHits])

  const columnPaths = useMemo(() => {
    const allPaths = new Set<string>()
    for (const field of fields) {
      if (field.path) allPaths.add(field.path)
    }
    for (const path of discoveredSamplePaths) {
      allPaths.add(path)
    }
    const filter = fieldFilter.trim().toLowerCase()
    const sorted = Array.from(allPaths).filter((path) => !filter || path.toLowerCase().includes(filter))
    sorted.sort((a, b) => {
      if (!pinnedFirst) return a.localeCompare(b)
      const aRank = pinnedRank(a, fields)
      const bRank = pinnedRank(b, fields)
      if (aRank !== bRank) return aRank - bRank
      return a.localeCompare(b)
    })
    return sorted
  }, [discoveredSamplePaths, fieldFilter, fields, pinnedFirst])

  const hiddenFieldCount = useMemo(() => {
    if (!fieldFilter.trim()) return 0
    const allPaths = new Set<string>()
    fields.forEach((field) => allPaths.add(field.path))
    discoveredSamplePaths.forEach((path) => allPaths.add(path))
    return Math.max(0, allPaths.size - columnPaths.length)
  }, [columnPaths.length, discoveredSamplePaths, fieldFilter, fields])

  const rolePathCount = useMemo(() => fields.filter((field) => field.suggestedRole || field.isTimeField).length, [fields])

  const hasColumns = columnPaths.length > 0

  const columnMinWidth = Math.max(760, columnPaths.length * 180)

  function clearFieldFilter() {
    setFieldFilter("")
  }

  function togglePinnedFirst() {
    setPinnedFirst((current) => !current)
  }

  if (!probe) {
    return (
      <Card>
        <Card.Content className="p-6 text-sm text-muted-foreground">
          {readOnly ? "No probe data available." : "Run a probe to inspect logs, fields, aggregations, and curl details."}
        </Card.Content>
      </Card>
    )
  }

  if (probe.errorMessage) {
    const dockerHint =
      probe.errorMessage.includes("connection refused") || probe.errorMessage.includes("0.0.0.0")
        ? " If the API runs in Docker and OpenSearch is on your Mac, set the ELF proxy base URL to http://host.docker.internal:9200 in Settings."
        : ""
    return (
      <Card>
        <Card.Content className="space-y-2 p-4">
          <p className="text-sm font-semibold text-danger">Probe failed</p>
          <p className="text-xs text-muted-foreground">
            {probe.errorMessage}
            {dockerHint}
          </p>
          {probe.curl ? (
            <pre className="overflow-x-auto rounded-md border bg-muted/20 p-3 font-mono text-[11px]">{probe.curl}</pre>
          ) : null}
        </Card.Content>
      </Card>
    )
  }

  return (
    <Card>
      <Card.Header className="flex flex-row items-center justify-between gap-2">
        <div>
          <Card.Title className="text-sm font-semibold">Probe result</Card.Title>
          <Description className="text-xs">
            {probe.hitCount ?? 0} hits · {probe.durationMs ?? 0}ms
            {probe.truncated ? " · truncated" : ""}
          </Description>
        </div>
        <div className="flex items-center gap-2">
          {probe.statusCode ? (
            <Chip size="sm" variant="secondary">
              <Chip.Label>HTTP {probe.statusCode}</Chip.Label>
            </Chip>
          ) : null}
          {probe.truncated && jsonText ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 gap-1"
              onPress={() => {
                const blob = new Blob([jsonText], { type: "application/json" })
                const url = URL.createObjectURL(blob)
                const link = document.createElement("a")
                link.href = url
                link.download = "elf-probe-response.json"
                link.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="size-3.5" />
              Download
            </Button>
          ) : null}
        </div>
      </Card.Header>
      <Card.Content className="space-y-3 pt-0">
        <Tabs selectedKey={selectedTab} onSelectionChange={(key) => setSelectedTab(String(key))}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="ELF response sections">
              <Tabs.Tab id="logs">Logs<Tabs.Indicator /></Tabs.Tab>
              <Tabs.Tab id="fields">Fields<Tabs.Indicator /></Tabs.Tab>
              <Tabs.Tab id="aggregations">Aggregations<Tabs.Indicator /></Tabs.Tab>
              <Tabs.Tab id="raw">Raw JSON<Tabs.Indicator /></Tabs.Tab>
              <Tabs.Tab id="curl">curl/debug<Tabs.Indicator /></Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
          <Tabs.Panel id="logs" className="pt-3">
            {probe.sampleHits?.length ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <TextField className="md:max-w-sm">
                    <Label>Filter fields</Label>
                    <Input
                      variant="secondary"
                      value={fieldFilter}
                      onChange={(event) => setFieldFilter(event.target.value)}
                      placeholder="Search any field path..."
                    />
                  </TextField>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip size="sm" variant="secondary"><Chip.Label>{columnPaths.length} columns</Chip.Label></Chip>
                    {hiddenFieldCount ? <Chip size="sm" variant="secondary"><Chip.Label>{hiddenFieldCount} hidden by filter</Chip.Label></Chip> : null}
                    {rolePathCount ? <Chip size="sm" variant="secondary"><Chip.Label>{rolePathCount} mapped/pinned</Chip.Label></Chip> : null}
                    <Button size="sm" variant={pinnedFirst ? "primary" : "secondary"} className="h-8" onPress={togglePinnedFirst}>
                      Pinned first
                    </Button>
                    {fieldFilter ? (
                      <Button size="sm" variant="secondary" className="h-8" onPress={clearFieldFilter}>
                        Clear
                      </Button>
                    ) : null}
                  </div>
                </div>
                {hasColumns ? (
                  <Table aria-label="Sample logs">
                    <Table.ScrollContainer>
                      <Table.Content style={{ minWidth: columnMinWidth }}>
                        <Table.Header>
                          {columnPaths.map((path) => (
                            <Table.Column key={path} className="min-w-44">
                              {onAddRuleFromField ? (
                                <button
                                  type="button"
                                  className="inline-flex max-w-52 items-center gap-1 truncate font-mono text-left hover:text-primary hover:underline"
                                  title="Add an exists check on this field"
                                  onClick={() => onAddRuleFromField(path)}
                                >
                                  <span className="truncate">{path}</span>
                                  {isPinnedPath(path, fields) ? <Search className="size-3 shrink-0" /> : null}
                                </button>
                              ) : (
                                path
                              )}
                            </Table.Column>
                          ))}
                        </Table.Header>
                        <Table.Body>
                          {probe.sampleHits.map((hit, index) => (
                            <Table.Row key={index}>
                              {columnPaths.map((path) => {
                                const value = getPathValue(hit, path)
                                const display = valueToText(value)
                                return (
                                  <Table.Cell key={path} className="max-w-64 truncate text-xs font-mono">
                                    {onAddRuleFromField ? (
                                      <button
                                        type="button"
                                        className="inline-flex max-w-full items-center gap-1 truncate text-left hover:text-primary hover:underline"
                                        title="Add equality check with this value"
                                        onClick={() => onAddRuleFromField(path, display === "—" ? undefined : display)}
                                      >
                                        <span className="truncate">{display}</span>
                                        {display !== "—" ? <Plus className="size-3 shrink-0" /> : null}
                                      </button>
                                    ) : (
                                      display
                                    )}
                                  </Table.Cell>
                                )
                              })}
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Content>
                    </Table.ScrollContainer>
                  </Table>
                ) : (
                  <Description className="text-xs">No fields match the current filter.</Description>
                )}
              </div>
            ) : (
              <Description className="text-xs">No document hits in this window.</Description>
            )}
          </Tabs.Panel>
          <Tabs.Panel id="fields" className="pt-3">
            {fields.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {fields.map((field) => (
                  <button
                    key={field.path}
                    type="button"
                    className="rounded-md border bg-background p-3 text-left text-xs hover:border-primary"
                    onClick={() => onAddRuleFromField?.(field.path, field.sampleValues?.[0])}
                  >
                    <div className="truncate font-mono font-semibold">{field.path}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {field.valueType ? <Chip size="sm" variant="secondary"><Chip.Label>{field.valueType}</Chip.Label></Chip> : null}
                      {field.suggestedRole ? <Chip size="sm" variant="secondary"><Chip.Label>{field.suggestedRole}</Chip.Label></Chip> : null}
                    </div>
                    {field.sampleValues?.length ? (
                      <div className="mt-2 truncate text-muted-foreground">{field.sampleValues.join(" · ")}</div>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <Description className="text-xs">No fields discovered yet.</Description>
            )}
          </Tabs.Panel>
          <Tabs.Panel id="aggregations" className="pt-3">
            {probe.aggregations && Object.keys(probe.aggregations).length > 0 ? (
              <pre className="max-h-64 overflow-auto rounded-md border bg-muted/10 p-3 font-mono text-[11px]">
                {JSON.stringify(probe.aggregations, null, 2)}
              </pre>
            ) : (
              <Description className="text-xs">No aggregations in the response.</Description>
            )}
          </Tabs.Panel>
          <Tabs.Panel id="raw" className="pt-3">
            <div className="flex justify-end pb-2">{jsonText ? <CopyButton text={jsonText} /> : null}</div>
            <pre className="max-h-[min(50vh,480px)] overflow-auto rounded-md border bg-muted/10 p-3 font-mono text-[11px]">
              {jsonText || "{}"}
            </pre>
          </Tabs.Panel>
          <Tabs.Panel id="curl" className="pt-3">
            {probe.curl ? (
              <div className="space-y-2">
                <CopyButton text={probe.curl} />
                <pre className="overflow-x-auto rounded-md border bg-muted/10 p-3 font-mono text-[11px]">{probe.curl}</pre>
              </div>
            ) : (
              <Description className="text-xs">No curl available.</Description>
            )}
          </Tabs.Panel>
        </Tabs>
      </Card.Content>
    </Card>
  )
}

function collectLeafPaths(value: unknown, prefix: string, paths: Set<string>) {
  if (value == null) return
  if (Array.isArray(value)) {
    if (prefix) paths.add(prefix)
    return
  }
  if (typeof value !== "object") {
    if (prefix) paths.add(prefix)
    return
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (!entries.length && prefix) {
    paths.add(prefix)
    return
  }
  for (const [key, child] of entries) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === "object" && !Array.isArray(child)) {
      collectLeafPaths(child, path, paths)
    } else {
      paths.add(path)
    }
  }
}

function pinnedRank(path: string, fields: ElfInferredField[]) {
  const roleIndex = PINNED_ROLE_ORDER.indexOf(path)
  if (roleIndex !== -1) return roleIndex
  const descriptor = fields.find((field) => field.path === path)
  if (!descriptor) return 1_000
  if (descriptor.isTimeField) return 0
  if (descriptor.suggestedRole) {
    const suggestedRoleIndex = PINNED_ROLE_ORDER.indexOf(descriptor.suggestedRole)
    return suggestedRoleIndex === -1 ? 100 : suggestedRoleIndex
  }
  return 1_000
}

function isPinnedPath(path: string, fields: ElfInferredField[]) {
  return pinnedRank(path, fields) < 1_000
}

function getPathValue(source: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".")
  let current: unknown = source
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function valueToText(value: unknown) {
  if (value == null || value === "") return "—"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export function InferredFieldsList({ fields }: { fields?: ElfInferredField[] }) {
  if (!fields?.length) return null
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">Inferred fields</div>
      <div className="max-h-48 space-y-1 overflow-auto rounded-md border bg-muted/5 p-2">
        {fields.slice(0, 12).map((field) => (
          <div key={field.path} className="flex items-center justify-between gap-2 text-xs">
            <span className="font-mono">{field.path}</span>
            {field.suggestedRole ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{field.suggestedRole}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
