"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ShieldAlert } from "lucide-react"
import { formatDate, Metric } from "@/components/pulse/console-shared"
import type { DeploymentValidation, DeploymentValidationReport, ElfQueryComparison } from "@/lib/pulse-types"
import { Card, Chip, Description, EmptyState, Table } from "@heroui/react"
import { ValidationResultPill } from "../components/validation-result-pill"
import { checkKindLabel } from "../views/elf-expression-builder"
import { buildLogCheckRows, type LogCheckRow } from "./deployment-detail-utils"

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
    </div>
  )
}

function LogCheckExpandableRow({
  row,
  reportComparison,
}: {
  row: LogCheckRow
  reportComparison?: ElfQueryComparison
}) {
  const [expanded, setExpanded] = useState(false)
  const result = row.elfResult
  const samples = result?.structuredSamples || []
  const delta =
    typeof row.baselineValue === "number" && typeof row.postValue === "number"
      ? row.postValue - row.baselineValue
      : undefined
  const reason = row.reason || fallbackLogReason(row)

  return (
    <>
      <Table.Row>
        <Table.Cell className="max-w-[200px] px-4 py-3 align-top">
          <div className="text-sm font-semibold">{row.name}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {row.gateMode ? (
              <Chip size="sm" variant="soft" className="capitalize">
                <Chip.Label>{row.gateMode}</Chip.Label>
              </Chip>
            ) : null}
            {row.signalType ? (
              <Chip size="sm" variant="secondary" className="capitalize">
                <Chip.Label>{row.signalType.replace(/_/g, " ")}</Chip.Label>
              </Chip>
            ) : null}
          </div>
          {row.signalType ? (
            <Description className="text-[11px] capitalize">{row.signalType.replace(/_/g, " ")}</Description>
          ) : null}
          <Description className="mt-1 line-clamp-2 text-[11px]">{reason}</Description>
        </Table.Cell>
        <Table.Cell className="px-3 py-3 align-top text-xs text-muted-foreground">
          {row.ranAt ? formatDate(row.ranAt) : row.status === "running" ? "Running…" : "Not run yet"}
        </Table.Cell>
        <Table.Cell className="px-3 py-3 align-top text-xs font-mono">
          {row.durationMs != null ? `${row.durationMs}ms` : "—"}
        </Table.Cell>
        <Table.Cell className="px-3 py-3 align-top text-xs font-mono">{row.baselineValue ?? "—"}</Table.Cell>
        <Table.Cell className="px-3 py-3 align-top text-xs font-mono">
          {row.postValue ?? row.hitCount ?? "—"}
        </Table.Cell>
        <Table.Cell className="px-3 py-3 align-top text-xs font-mono">
          {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
        </Table.Cell>
        <Table.Cell className="px-3 py-3 align-top">
          {row.result ? (
            <ValidationResultPill status={row.result} />
          ) : (
            <Chip size="sm" variant="secondary" className="capitalize">
              <Chip.Label>{row.status}</Chip.Label>
            </Chip>
          )}
        </Table.Cell>
        <Table.Cell className="px-3 py-3 align-top">
          {(result?.sampleHits?.length || samples.length || reportComparison?.runMeta) ? (
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-semibold text-primary"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              Details
            </button>
          ) : null}
        </Table.Cell>
      </Table.Row>
      {expanded ? (
        <Table.Row>
          <Table.Cell colSpan={8} className="bg-muted/5 px-4 py-3">
            <div className="space-y-3">
              {row.reason ? <p className="text-xs text-muted-foreground">{row.reason}</p> : null}
              {reportComparison ? <HowItRanPanel comparison={reportComparison} /> : null}
              {result?.sampleHits?.length ? (
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Sample hits</div>
                  {result.sampleHits.slice(0, 5).map((hit, index) => (
                    <div key={index} className="rounded border bg-background/60 px-2 py-1 font-mono text-[10px]">
                      {hit}
                    </div>
                  ))}
                </div>
              ) : null}
              {samples.length > 0 ? (
                <Table aria-label="Structured samples">
                  <Table.ScrollContainer>
                    <Table.Content className="min-w-[480px]">
                      <Table.Header>
                        <Table.Column>Endpoint</Table.Column>
                        <Table.Column>Exception</Table.Column>
                        <Table.Column>Trace</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {samples.slice(0, 5).map((sample, index) => (
                          <Table.Row key={index}>
                            <Table.Cell className="text-xs">
                              {sample.endpoint || sample.service || "—"}
                            </Table.Cell>
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
          </Table.Cell>
        </Table.Row>
      ) : null}
    </>
  )
}

export function DeploymentLogChecksTab({
  validation,
  report,
}: {
  validation: DeploymentValidation
  report?: DeploymentValidationReport
}) {
  const rows = buildLogCheckRows(validation)
    .sort((a, b) => logRowPriority(a) - logRowPriority(b))
  const comparisonMap = new Map((report?.elfComparisons || []).map((c) => [c.queryId, c]))
  const doneRows = rows.filter((row) => row.status === "done")
  const blockingIssues = rows.filter((row) => row.gateMode === "blocking" && (row.result === "fail" || row.result === "warning")).length
  const advisoryWarnings = rows.filter((row) => row.gateMode !== "blocking" && (row.result === "fail" || row.result === "warning")).length

  if (rows.length === 0) {
    return (
      <EmptyState className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/10 py-10 text-center">
        <p className="text-sm font-semibold">No log checks configured</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Select ELF log queries when creating the deployment check to enable post-deploy log gates.
        </p>
      </EmptyState>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="ELF checks" value={`${doneRows.length}/${rows.length}`} icon={CheckCircle2} detail="Completed gates" tone="accent" />
        <Metric label="Blocking findings" value={String(blockingIssues)} icon={ShieldAlert} detail="Release blockers" tone={blockingIssues ? "danger" : "success"} />
        <Metric label="Advisory warnings" value={String(advisoryWarnings)} icon={AlertTriangle} detail="Non-blocking signals" tone={advisoryWarnings ? "warning" : "success"} />
      </div>

      <Card className="border-border/40 bg-muted/5 p-4">
        <Description className="text-sm">
          Each row is an OpenSearch log check run against the ELF proxy. Baseline and post-deploy hit
          counts are compared to detect regressions.
        </Description>
      </Card>

      <Card className="gap-0 p-0">
        <Card.Content className="p-0">
          <Table aria-label="Log check execution log">
            <Table.ScrollContainer>
              <Table.Content className="min-w-[900px]">
                <Table.Header>
                  <Table.Column isRowHeader className="px-4">Query / signal</Table.Column>
                  <Table.Column className="px-3">Ran at</Table.Column>
                  <Table.Column className="px-3">Duration</Table.Column>
                  <Table.Column className="px-3">Baseline</Table.Column>
                  <Table.Column className="px-3">Post</Table.Column>
	                  <Table.Column className="px-3">Delta</Table.Column>
                  <Table.Column className="px-3">Result</Table.Column>
                  <Table.Column className="px-3">Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {rows.map((row) => (
                    <LogCheckExpandableRow
                      key={row.id}
                      row={row}
                      reportComparison={comparisonMap.get(row.id)}
                    />
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Card.Content>
      </Card>
    </div>
  )
}

function logRowPriority(row: LogCheckRow) {
  if (row.gateMode === "blocking" && row.result === "fail") return 0
  if (row.result === "fail" || row.result === "warning") return 1
  if (row.status === "running") return 2
  if (row.status === "pending") return 3
  return 4
}

function fallbackLogReason(row: LogCheckRow) {
  if (row.status === "pending") return "This ELF gate has not run for the deployment yet."
  if (row.status === "running") return "Pulse is querying ELF/OpenSearch for this gate."
  if (row.result === "fail") return "Post-deploy logs crossed this gate threshold."
  if (row.result === "warning") return "Post-deploy logs produced a warning signal."
  return "No concerning post-deploy log signal was detected."
}
