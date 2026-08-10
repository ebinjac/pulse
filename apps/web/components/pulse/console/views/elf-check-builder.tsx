"use client"

import { useMemo, useState } from "react"
import { Button, Description, Input, Label, ListBox, Select, TextField } from "@workspace/ui/components/ui"
import type {
  ElfCheckConfig,
  ElfInferredField,
  ElfPassCriteria,
  ElfQueryProbeResult,
  LogFieldMapping,
} from "@/lib/pulse-types"

const CHECK_KINDS = [
  { id: "new_terms", label: "New error / exception terms" },
  { id: "delta_pct", label: "Count or metric spike" },
  { id: "threshold", label: "Latency percentile threshold" },
  { id: "hit_count", label: "Hit count limit" },
  { id: "message_match", label: "Message contains" },
  { id: "raw", label: "Raw query only" },
] as const

export type CheckBuilderDraft = {
  checkKind: string
  checkConfig: ElfCheckConfig
  passCriteria: ElfPassCriteria
  facetField: string
}

export function ElfCheckBuilder({
  probe,
  mapping,
  inferredFields,
  initial,
  onSave,
  saving,
}: {
  probe: ElfQueryProbeResult | null
  mapping: LogFieldMapping
  inferredFields?: ElfInferredField[]
  initial?: Partial<CheckBuilderDraft>
  onSave: (draft: CheckBuilderDraft) => Promise<void>
  saving?: boolean
}) {
  const [checkKind, setCheckKind] = useState(initial?.checkKind || "new_terms")
  const [facetField, setFacetField] = useState(
    initial?.facetField || initial?.checkConfig?.facetField || mapping.exceptionType || "exceptionType",
  )
  const [pattern, setPattern] = useState(initial?.checkConfig?.pattern || "")
  const [baselineOffsetMins, setBaselineOffsetMins] = useState(initial?.checkConfig?.baselineOffsetMins || 30)
  const [deltaPctMax, setDeltaPctMax] = useState(initial?.checkConfig?.deltaPctMax || 50)
  const [threshold, setThreshold] = useState(initial?.checkConfig?.threshold || 500)
  const [maxHits, setMaxHits] = useState(initial?.checkConfig?.maxHits || 0)

  const fieldOptions = useMemo(() => {
    const paths = new Set<string>()
    inferredFields?.forEach((field) => paths.add(field.path))
    Object.values(mapping).forEach((path) => {
      if (path) paths.add(path)
    })
    return Array.from(paths)
  }, [inferredFields, mapping])

  if (!probe || probe.errorMessage) {
    return (
      <div className="rounded-md border border-dashed bg-muted/5 p-4 text-sm text-muted-foreground">
        Run a probe first to see logs and build a check.
      </div>
    )
  }

  async function handleSave() {
    const checkConfig: ElfCheckConfig = {
      facetField,
      pattern,
      baselineOffsetMins,
      deltaPctMax,
      threshold,
      maxHits,
    }
    let passCriteria: ElfPassCriteria = { type: "max_hits", threshold: maxHits }
    if (checkKind === "new_terms") {
      passCriteria = { type: "new_terms", threshold: 1, name: "by_facet" }
    } else if (checkKind === "delta_pct") {
      passCriteria = { type: "delta_pct", threshold: deltaPctMax, operator: "gt", name: "metric_value" }
    } else if (checkKind === "threshold") {
      passCriteria = { type: "percentile_regression", threshold, operator: "gt", name: "metric_value" }
    } else if (checkKind === "message_match") {
      passCriteria = { type: "max_hits", threshold: 0 }
    }

    await onSave({ checkKind, checkConfig, passCriteria, facetField })
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Check builder</div>
        <Description className="text-xs">Turn probe insights into a reusable deployment gate.</Description>
      </div>

      <Select selectedKey={checkKind} onSelectionChange={(key) => setCheckKind(String(key))}>
        <Label>Signal type</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {CHECK_KINDS.map((kind) => (
              <ListBox.Item key={kind.id} id={kind.id} textValue={kind.label}>
                {kind.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {checkKind !== "raw" && checkKind !== "hit_count" && checkKind !== "message_match" ? (
        <Select selectedKey={facetField} onSelectionChange={(key) => setFacetField(String(key))}>
          <Label>Facet field</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {fieldOptions.map((path) => (
                <ListBox.Item key={path} id={path} textValue={path}>
                  {path}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      ) : null}

      {checkKind === "message_match" ? (
        <TextField className="w-full">
          <Label>Message pattern</Label>
          <Input variant="secondary" fullWidth value={pattern} onChange={(e) => setPattern(e.target.value)} />
        </TextField>
      ) : null}

      {checkKind === "new_terms" || checkKind === "delta_pct" ? (
        <TextField className="w-full">
          <Label>Baseline offset (minutes before post window)</Label>
          <Input
            variant="secondary"
            fullWidth
            type="number"
            value={String(baselineOffsetMins)}
            onChange={(e) => setBaselineOffsetMins(Number(e.target.value) || 30)}
          />
        </TextField>
      ) : null}

      {checkKind === "delta_pct" ? (
        <TextField className="w-full">
          <Label>Max delta %</Label>
          <Input
            variant="secondary"
            fullWidth
            type="number"
            value={String(deltaPctMax)}
            onChange={(e) => setDeltaPctMax(Number(e.target.value) || 50)}
          />
        </TextField>
      ) : null}

      {checkKind === "threshold" ? (
        <TextField className="w-full">
          <Label>Max P95 latency (ms)</Label>
          <Input
            variant="secondary"
            fullWidth
            type="number"
            value={String(threshold)}
            onChange={(e) => setThreshold(Number(e.target.value) || 500)}
          />
        </TextField>
      ) : null}

      {checkKind === "hit_count" ? (
        <TextField className="w-full">
          <Label>Max hits allowed</Label>
          <Input
            variant="secondary"
            fullWidth
            type="number"
            value={String(maxHits)}
            onChange={(e) => setMaxHits(Number(e.target.value) || 0)}
          />
        </TextField>
      ) : null}

      <Button className="w-full" onPress={() => void handleSave()} isDisabled={saving}>
        {saving ? "Saving check…" : "Save check on query"}
      </Button>
    </div>
  )
}

export function checkKindLabel(kind?: string) {
  return CHECK_KINDS.find((item) => item.id === kind)?.label || kind || "Raw"
}
