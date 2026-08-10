"use client"

import { RotateCw, Save } from "lucide-react"
import { Button, Card, Description, Label, ListBox, Select } from "@workspace/ui/components/ui"
import type { Application, ApplicationService, ElfCopilotQueryRepair, ElfCopilotSummary, ElfQuery, ElfQueryProbeResult } from "@/lib/pulse-types"
import { Field } from "@/components/pulse/console-shared"
import { ElfProbeTimeRange } from "./elf-probe-time-range"
import { ElfResponseViewer } from "./elf-response-viewer"
import { ExploreCopilotSection } from "./elf-workbench-copilot-panels"

export function ElfWorkbenchExploreTab({
  query,
  application,
  services,
  serviceId,
  onServiceChange,
  resolvedIndex,
  timeRange,
  onTimeRangeChange,
  probe,
  savingContext,
  onSaveContext,
  onAddRuleFromField,
  aiSummary,
  repairResult,
  onExplainProbe,
  onRepairQuery,
  copilotBusy,
}: {
  query: ElfQuery
  application?: Application
  services: ApplicationService[]
  serviceId: string
  onServiceChange: (serviceId: string) => void
  resolvedIndex: string
  timeRange: { gte: string; lte: string; field: string }
  onTimeRangeChange: (next: { gte: string; lte: string; field: string }) => void
  probe: ElfQueryProbeResult | null
  savingContext: boolean
  onSaveContext: () => void
  onAddRuleFromField: (path: string, value?: string) => void
  aiSummary: ElfCopilotSummary | null
  repairResult: ElfCopilotQueryRepair | null
  onExplainProbe: () => void
  onRepairQuery: () => void
  copilotBusy: string | null
}) {
  return (
    <div className="space-y-4">
      <Card>
        <Card.Header>
          <Card.Title className="text-base font-semibold">Context</Card.Title>
          <Description>Where this query runs and which time window to use for discovery.</Description>
        </Card.Header>
        <Card.Content className="space-y-4 pt-0">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Application" value={application?.name || "No application linked"} />
            <Select selectedKey={serviceId || ""} onSelectionChange={(key) => onServiceChange(String(key))}>
              <Label>Service scope</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="" textValue="All services">
                    All services
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  {services.map((service) => (
                    <ListBox.Item key={service.id} id={service.id} textValue={service.name}>
                      {service.name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <Field label="ELF app ID" value={query.elfAppId || application?.elfAppId || "Resolved from application"} />
            <Field label="Index pattern" value={resolvedIndex} />
          </div>
          <ElfProbeTimeRange gte={timeRange.gte} lte={timeRange.lte} timeField={timeRange.field} onChange={onTimeRangeChange} />
          <div className="flex justify-end">
            <Button className="gap-2" onPress={onSaveContext} isDisabled={savingContext}>
              {savingContext ? <RotateCw className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save context
            </Button>
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title className="text-base font-semibold">Probe results</Card.Title>
          <Description>Runs your saved search body with the time window above.</Description>
        </Card.Header>
        <Card.Content className="pt-0">
          <ElfResponseViewer probe={probe} onAddRuleFromField={onAddRuleFromField} />
        </Card.Content>
      </Card>

      <ExploreCopilotSection
        summary={aiSummary}
        repair={repairResult}
        onExplainProbe={onExplainProbe}
        onRepairQuery={onRepairQuery}
        explainBusy={copilotBusy === "explain-probe"}
        repairBusy={copilotBusy === "repair-query"}
        canExplain={!!probe && !probe.errorMessage}
      />
    </div>
  )
}
