"use client"

import { ClipboardCheck, Database, Gauge, ShieldAlert } from "lucide-react"
import type { ElfQuery, ElfQueryProbeResult, ElfQueryValidateCheckResult } from "@/lib/pulse-types"
import { checkKindLabel } from "@/lib/pulse-elf-rules"
import { Metric } from "@/components/pulse/console-shared"
import type { DraftCheck } from "./elf-check-draft-builder"
import { hasCheckCondition } from "./elf-check-draft-builder"

export function ElfWorkbenchMetrics({
  query,
  probe,
  resolvedIndex,
  draft,
  validateResult,
}: {
  query: ElfQuery
  probe: ElfQueryProbeResult | null
  resolvedIndex: string
  draft: DraftCheck
  validateResult: ElfQueryValidateCheckResult | null
}) {
  const lastProbeHits = probe
    ? `${probe.hitCount ?? 0} hits`
    : query.lastProbeSummary?.hitCount != null
      ? `${query.lastProbeSummary.hitCount} hits`
      : "Not run"
  const lastProbeDetail = probe
    ? `${probe.durationMs ?? 0}ms`
    : query.lastProbeSummary?.durationMs
      ? `${query.lastProbeSummary.durationMs}ms`
      : "Run a probe to discover fields"

  const checkDraftValue = hasCheckCondition(draft)
    ? draft.matchMode === "total_hits"
      ? "Total hits check"
      : `${draft.rules.length} rule${draft.rules.length === 1 ? "" : "s"}`
    : "Not configured"
  const checkDraftDetail = validateResult?.gateResult === "pass"
    ? "Last test passed"
    : validateResult?.gateResult
      ? `Last test: ${validateResult.gateResult}`
      : "Test on Deployment check tab"

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Metric
        label="Gate"
        value={query.gateMode}
        detail={checkKindLabel(query.checkKind, query.checkConfig?.rules?.length)}
        icon={ShieldAlert}
        tone={query.gateMode === "blocking" ? "warning" : "default"}
      />
      <Metric label="Index" value={resolvedIndex} detail="Resolved search target" icon={Database} />
      <Metric label="Last probe" value={lastProbeHits} detail={lastProbeDetail} icon={Gauge} tone={probe && !probe.errorMessage ? "accent" : "default"} />
      <Metric
        label="Check draft"
        value={checkDraftValue}
        detail={checkDraftDetail}
        icon={ClipboardCheck}
        tone={validateResult?.gateResult === "pass" ? "success" : "default"}
      />
    </div>
  )
}
