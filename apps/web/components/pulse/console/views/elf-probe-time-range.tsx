"use client"

import { Button, Description, Input, Label, TextField } from "@workspace/ui/components/ui"

function toLocalInputValue(iso?: string) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInputValue(value: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString()
}

function presetRange(minutes: number) {
  const lte = new Date()
  const gte = new Date(lte.getTime() - minutes * 60_000)
  return { gte: gte.toISOString(), lte: lte.toISOString() }
}

export function ElfProbeTimeRange({
  gte,
  lte,
  timeField,
  onChange,
}: {
  gte: string
  lte: string
  timeField: string
  onChange: (next: { gte: string; lte: string; field: string }) => void
}) {
  const invalidRange = gte && lte && new Date(gte).getTime() >= new Date(lte).getTime()

  return (
    <div className="space-y-3">
      <TextField className="w-full">
        <Label>Time field</Label>
        <Input
          variant="secondary"
          fullWidth
          value={timeField}
          onChange={(e) => onChange({ gte, lte, field: e.target.value })}
          placeholder="@timestamp"
        />
      </TextField>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField className="w-full">
          <Label>From (gte)</Label>
          <Input
            variant="secondary"
            fullWidth
            type="datetime-local"
            value={toLocalInputValue(gte)}
            onChange={(e) => onChange({ gte: fromLocalInputValue(e.target.value), lte, field: timeField })}
          />
        </TextField>
        <TextField className="w-full">
          <Label>To (lte)</Label>
          <Input
            variant="secondary"
            fullWidth
            type="datetime-local"
            value={toLocalInputValue(lte)}
            onChange={(e) => onChange({ gte, lte: fromLocalInputValue(e.target.value), field: timeField })}
          />
        </TextField>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Last 5m", minutes: 5 },
          { label: "Last 15m", minutes: 15 },
          { label: "Last 1h", minutes: 60 },
        ].map((preset) => (
          <Button
            key={preset.label}
            size="sm"
            variant="secondary"
            className="h-7"
            onPress={() => {
              const range = presetRange(preset.minutes)
              onChange({ ...range, field: timeField })
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      {invalidRange ? (
        <Description className="text-xs text-danger">Start time must be before end time.</Description>
      ) : (
        <Description className="text-xs">Injected into the search body range filter on the time field above.</Description>
      )}
    </div>
  )
}
