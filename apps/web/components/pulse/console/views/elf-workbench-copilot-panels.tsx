"use client"

import { useState } from "react"
import { Brain, ChevronDown, ChevronRight, Sparkles, Wand2 } from "lucide-react"
import { Button, Card, Description, Label, TextArea, TextField } from "@heroui/react"
import type { ElfCopilotQueryRepair, ElfCopilotResultExplanation, ElfCopilotSummary } from "@/lib/pulse-types"
import { Field } from "@/components/pulse/console-shared"

export function displayAIValue(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map(displayAIValue).filter(Boolean).join(", ")
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    const preferred =
      record.summary || record.description || record.message || record.label || record.name || record.field || record.query || record.risk
    if (preferred) {
      const rest = Object.entries(record)
        .filter(([key]) => !["summary", "description", "message", "label", "name", "field", "query", "risk"].includes(key))
        .map(([key, child]) => `${key}: ${displayAIValue(child)}`)
        .filter((item) => item.trim() !== `${item.split(":")[0]}:`)
      const head = displayAIValue(preferred)
      return rest.length ? `${head} (${rest.join("; ")})` : head
    }
    return Object.entries(record)
      .map(([key, child]) => `${key}: ${displayAIValue(child)}`)
      .join("; ")
  }
  return String(value)
}

function toAIList(value: unknown): unknown[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function CompactList({ title, items, tone }: { title: string; items?: unknown[]; tone?: "warning" }) {
  if (!items?.length) {
    return (
      <div>
        <Description className="text-xs font-semibold">{title}</Description>
        <Description className="mt-1 text-xs">None detected</Description>
      </div>
    )
  }
  return (
    <div>
      <Description className="text-xs font-semibold">{title}</Description>
      <div className="mt-2 space-y-1">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className={`rounded-md border px-2 py-1 text-xs ${tone === "warning" ? "bg-warning/10" : "bg-muted/5"}`}>
            {displayAIValue(item)}
          </div>
        ))}
      </div>
    </div>
  )
}

function CollapsibleCopilotCard({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: typeof Brain
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card>
      <Card.Header className="border-b pb-3">
        <Button variant="ghost" className="h-auto w-full justify-between gap-2 px-0" onPress={() => setOpen((value) => !value)}>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="size-4 text-primary" />
            {title}
          </span>
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </Button>
      </Card.Header>
      {open ? <Card.Content className="space-y-4 pt-4">{children}</Card.Content> : null}
    </Card>
  )
}

export function ExploreCopilotSection({
  summary,
  repair,
  onExplainProbe,
  onRepairQuery,
  explainBusy,
  repairBusy,
  canExplain,
}: {
  summary: ElfCopilotSummary | null
  repair: ElfCopilotQueryRepair | null
  onExplainProbe: () => void
  onRepairQuery: () => void
  explainBusy: boolean
  repairBusy: boolean
  canExplain: boolean
}) {
  return (
    <CollapsibleCopilotCard title="Copilot — explore" icon={Sparkles}>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="gap-2" onPress={onExplainProbe} isDisabled={!canExplain || explainBusy || repairBusy}>
          <Brain className="size-4" />
          Explain probe
        </Button>
        <Button variant="secondary" className="gap-2" onPress={onRepairQuery} isDisabled={explainBusy || repairBusy}>
          <Wand2 className="size-4" />
          Fix query with AI
        </Button>
      </div>
      {summary ? (
        <div className="space-y-3">
          {summary.summary ? <Description className="text-sm">{displayAIValue(summary.summary)}</Description> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <CompactList title="Top patterns" items={toAIList(summary.topPatterns)} />
            <CompactList title="Risky services" items={toAIList(summary.riskyServices)} />
            <CompactList title="Recommended fields" items={toAIList(summary.recommendedFields)} />
            <CompactList title="Warnings" items={toAIList(summary.warnings)} tone="warning" />
          </div>
        </div>
      ) : (
        <Description className="text-sm">Summarize probe hits, risky patterns, and field recommendations.</Description>
      )}
      {repair ? (
        <div className="space-y-2 rounded-lg border bg-muted/5 p-3">
          <Description className="text-sm font-semibold">Query repair suggestion</Description>
          {repair.likelyCause ? <Description className="text-sm">{displayAIValue(repair.likelyCause)}</Description> : null}
          {repair.explanation ? <Description className="text-sm">{displayAIValue(repair.explanation)}</Description> : null}
          {repair.correctedSearchBody ? (
            <pre className="max-h-48 overflow-auto rounded-md border bg-background p-3 font-mono text-[11px]">
              {JSON.stringify(repair.correctedSearchBody, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </CollapsibleCopilotCard>
  )
}

export function CheckCopilotSection({
  explanation,
  onExplainResult,
  explainBusy,
  canExplain,
}: {
  explanation: ElfCopilotResultExplanation | null
  onExplainResult: () => void
  explainBusy: boolean
  canExplain: boolean
}) {
  return (
    <CollapsibleCopilotCard title="Copilot — check result" icon={Sparkles}>
      <Button variant="secondary" className="gap-2" onPress={onExplainResult} isDisabled={!canExplain || explainBusy}>
        <Brain className="size-4" />
        Explain test result
      </Button>
      {explanation ? (
        <div className="space-y-3">
          {explanation.summary ? <Description className="text-sm">{displayAIValue(explanation.summary)}</Description> : null}
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Recommendation" value={displayAIValue(explanation.recommendation || "No recommendation")} />
            <Field label="Gate mode" value={displayAIValue(explanation.gateModeRecommendation || "No change")} />
            <Field label="Threshold" value={displayAIValue(explanation.thresholdRecommendation || "No change")} />
          </div>
          {toAIList(explanation.nextActions).length ? (
            <CompactList title="Next SRE actions" items={toAIList(explanation.nextActions)} />
          ) : null}
        </div>
      ) : (
        <Description className="text-sm">Run a check test first, then ask Copilot to explain pass/fail reasoning.</Description>
      )}
    </CollapsibleCopilotCard>
  )
}

export function NaturalLanguageCheckInput({
  value,
  onChange,
  onGenerate,
  busy,
}: {
  value: string
  onChange: (value: string) => void
  onGenerate: () => void
  busy: boolean
}) {
  return (
    <Card>
      <Card.Header>
        <Card.Title className="flex items-center gap-2 text-sm font-semibold">
          <Brain className="size-4" />
          Describe the check
        </Card.Title>
        <Description>Example: Fail if login has any 5xx after deployment, or warn if response time is over 2 seconds.</Description>
      </Card.Header>
      <Card.Content className="grid gap-3 pt-0 md:grid-cols-[minmax(0,1fr)_auto]">
        <TextField className="w-full">
          <Label className="sr-only">Check description</Label>
          <TextArea
            variant="secondary"
            fullWidth
            className="min-h-20"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Describe what you want to catch..."
          />
        </TextField>
        <Button className="gap-2 self-end" onPress={onGenerate} isDisabled={busy || !value.trim()}>
          <Sparkles className="size-4" />
          Generate and test
        </Button>
      </Card.Content>
    </Card>
  )
}
