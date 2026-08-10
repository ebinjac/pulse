"use client"

import type { MonitorStep } from "@/lib/pulse-types"
import { Input, ListBox, Select } from "@workspace/ui/components/ui"

const labelClass = "text-xs font-semibold uppercase text-muted-foreground"

function configString(step: MonitorStep, key: string) {
  const value = step.config?.[key]
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value)
}

function updateConfig(step: MonitorStep, onUpdate: (patch: Partial<MonitorStep>) => void, key: string, value: string) {
  onUpdate({
    config: {
      ...step.config,
      [key]: value,
    },
  })
}

export function SyntheticStepEditor({
  step,
  onUpdate,
}: {
  step: MonitorStep
  onUpdate: (patch: Partial<MonitorStep>) => void
}) {
  if (!["dns", "tcp", "tls", "delay"].includes(step.type)) {
    return null
  }

  if (step.type === "delay") {
    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Delay (ms)</span>
          <Input
            type="number"
            min={0}
            value={configString(step, "delayMs") || String(step.timeoutMs || 1000)}
            onChange={(event) => {
              const delayMs = event.target.value
              updateConfig(step, onUpdate, "delayMs", delayMs)
              onUpdate({ timeoutMs: Number(delayMs) || 1000 })
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Host</span>
        <Input
          value={configString(step, "host") || step.url || ""}
          placeholder="api.example.com"
          onChange={(event) => updateConfig(step, onUpdate, "host", event.target.value)}
        />
      </div>
      {step.type === "dns" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Record type</span>
            <Select
              className="w-full"
              selectedKey={configString(step, "recordType") || "A"}
              onSelectionChange={(key) => {
                if (key != null) updateConfig(step, onUpdate, "recordType", String(key))
              }}
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="A" textValue="A">A</ListBox.Item>
                  <ListBox.Item id="AAAA" textValue="AAAA">AAAA</ListBox.Item>
                  <ListBox.Item id="CNAME" textValue="CNAME">CNAME</ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Expected record (optional)</span>
            <Input
              value={configString(step, "expected")}
              placeholder="1.2.3.4 or cname.target.example"
              onChange={(event) => updateConfig(step, onUpdate, "expected", event.target.value)}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>Port</span>
          <Input
            type="number"
            min={1}
            max={65535}
            value={configString(step, "port") || "443"}
            onChange={(event) => updateConfig(step, onUpdate, "port", event.target.value)}
          />
        </div>
      )}
      {step.type === "tls" ? (
        <p className="text-xs text-muted-foreground rounded-md border bg-muted/10 p-3">
          Add a <strong>certExpiryDays</strong> assertion under Tests (for example greaterThan 30) to alert before certificate expiry.
        </p>
      ) : null}
    </div>
  )
}
