"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Card as HeroCard, Chip, Description, Table } from "@heroui/react"
import type { DeploymentValidationReport, ElfFacetBucket, ElfQueryComparison } from "@/lib/pulse-types"
import { ValidationResultPill } from "./validation-result-pill"
import { checkKindLabel } from "../views/elf-expression-builder"

function FacetTable({ title, buckets }: { title: string; buckets?: ElfFacetBucket[] }) {
  if (!buckets?.length) return null
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="rounded-md border bg-muted/5">
        {buckets.slice(0, 5).map((bucket) => (
          <div key={bucket.key} className="flex items-center justify-between border-b px-3 py-1.5 text-xs last:border-b-0">
            <span className="truncate font-medium">{bucket.key}</span>
            <span className="font-mono text-muted-foreground">{bucket.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HowItRanPanel({ comparison }: { comparison: ElfQueryComparison }) {
  const meta = comparison.runMeta
  if (!meta) return null

  return (
    <div className="space-y-2 rounded-md border bg-background/70 p-3 text-xs">
      <div className="font-semibold">How this check ran</div>
      {meta.checkKind ? (
        <div>
          <span className="text-muted-foreground">Check: </span>
          {checkKindLabel(meta.checkKind, meta.checkConfig?.rules?.length)}
        </div>
      ) : null}
      {meta.checkConfig?.rules?.length ? (
        <div className="space-y-1">
          <div className="text-muted-foreground">Rules</div>
          {meta.checkConfig.rules.map((rule, index) => (
            <div key={rule.id || index} className="font-mono text-[11px]">
              {rule.field} {rule.operator} {rule.value != null ? String(rule.value) : ""}
            </div>
          ))}
        </div>
      ) : null}
      {meta.fieldSchemaUsed?.fields?.length ? (
        <div className="grid gap-1 sm:grid-cols-2">
          {meta.fieldSchemaUsed.fields.slice(0, 6).map((field) => (
            <div key={field.path}>
              <span className="text-muted-foreground">{field.label || field.path}: </span>
              <span className="font-mono">{field.path}</span>
            </div>
          ))}
        </div>
      ) : null}
      {meta.postWindow?.gte ? (
        <div className="font-mono text-[11px]">
          Post window: {meta.postWindow.gte} → {meta.postWindow.lte}
        </div>
      ) : null}
      {meta.baselineWindow?.gte ? (
        <div className="font-mono text-[11px]">
          Baseline: {meta.baselineWindow.gte} → {meta.baselineWindow.lte}
        </div>
      ) : null}
      {meta.resolvedIndexPattern ? (
        <div className="truncate font-mono text-[11px]">{meta.resolvedIndexPattern}</div>
      ) : null}
      {meta.curl ? (
        <pre className="max-h-32 overflow-auto rounded border bg-muted/10 p-2 font-mono text-[10px]">{meta.curl}</pre>
      ) : null}
      {meta.fieldMappingUsed ? (
        <div className="grid gap-1 sm:grid-cols-2">
          {Object.entries(meta.fieldMappingUsed)
            .filter(([, value]) => value)
            .slice(0, 6)
            .map(([role, path]) => (
              <div key={role}>
                <span className="text-muted-foreground">{role}: </span>
                <span className="font-mono">{path}</span>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  )
}

function SignalRow({ comparison }: { comparison: ElfQueryComparison }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="space-y-3 rounded-lg border bg-muted/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{comparison.queryName}</div>
          {comparison.signalType ? (
            <Description className="text-[11px] capitalize">{comparison.signalType.replace(/_/g, " ")}</Description>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="secondary" className="capitalize">
            <Chip.Label>{comparison.gateMode}</Chip.Label>
          </Chip>
          <ValidationResultPill status={comparison.result} />
        </div>
      </div>

      {(comparison.baselineValue != null || comparison.postValue != null) && (
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-md border bg-background/60 px-3 py-2">
            <div className="text-[10px] uppercase text-muted-foreground">Baseline</div>
            <div className="font-mono font-semibold">{comparison.baselineValue ?? 0}</div>
          </div>
          <div className="rounded-md border bg-background/60 px-3 py-2">
            <div className="text-[10px] uppercase text-muted-foreground">Post-deploy</div>
            <div className="font-mono font-semibold">{comparison.postValue ?? comparison.hitCount}</div>
          </div>
          <div className="rounded-md border bg-background/60 px-3 py-2">
            <div className="text-[10px] uppercase text-muted-foreground">Delta</div>
            <div className="font-mono font-semibold">{comparison.deltaPct != null ? `${comparison.deltaPct}%` : "—"}</div>
          </div>
        </div>
      )}

      {comparison.reason ? <p className="text-xs text-muted-foreground">{comparison.reason}</p> : null}

      {comparison.runMeta ? (
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-semibold text-primary"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          How this check ran
        </button>
      ) : null}
      {expanded ? <HowItRanPanel comparison={comparison} /> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <FacetTable title="Top exceptions" buckets={comparison.facets?.topExceptions || comparison.facets?.newTerms} />
        <FacetTable title="Top endpoints" buckets={comparison.facets?.topEndpoints} />
      </div>

      {comparison.structuredSamples?.length ? (
        <Table aria-label="Sample hits">
          <Table.ScrollContainer>
            <Table.Content className="min-w-[520px]">
              <Table.Header>
                <Table.Column isRowHeader>Endpoint</Table.Column>
                <Table.Column>Exception</Table.Column>
                <Table.Column>Trace</Table.Column>
              </Table.Header>
              <Table.Body>
                {comparison.structuredSamples.slice(0, 3).map((sample, index) => (
                  <Table.Row key={`${sample.traceId || sample.endpoint}-${index}`}>
                    <Table.Cell className="text-xs">{sample.endpoint || sample.service || "—"}</Table.Cell>
                    <Table.Cell className="text-xs">{sample.exceptionType || "—"}</Table.Cell>
                    <Table.Cell className="font-mono text-[10px]">{sample.traceId || "—"}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      ) : null}
    </div>
  )
}

export function ObservabilityFindings({ report }: { report?: DeploymentValidationReport }) {
  const byService = report?.elfObservability?.byService
  const serviceKeys = byService ? Object.keys(byService) : []
  const hasStructured = serviceKeys.length > 0

  if (!hasStructured && !(report?.elfComparisons?.length)) {
    return null
  }

  if (!hasStructured) {
    return null
  }

  return (
    <HeroCard>
      <HeroCard.Header>
        <div className="space-y-1">
          <HeroCard.Title className="text-sm font-semibold">Observability findings</HeroCard.Title>
          <Description>Baseline vs post-deploy ELF signals grouped by service.</Description>
        </div>
      </HeroCard.Header>
      <HeroCard.Content className="space-y-6 pt-4">
        {serviceKeys.map((serviceKey) => (
          <div key={serviceKey} className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{serviceKey}</div>
            {(byService?.[serviceKey] || []).map((comparison) => (
              <SignalRow key={`${serviceKey}-${comparison.queryId}`} comparison={comparison} />
            ))}
          </div>
        ))}
      </HeroCard.Content>
    </HeroCard>
  )
}
