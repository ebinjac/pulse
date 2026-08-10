"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button, Chip, Description, Input, Label, ListBox, Select, TextField } from "@workspace/ui/components/ui"
import type { ElfFieldDescriptor, ElfFieldSchema } from "@/lib/pulse-types"

function mergeSchemas(base: ElfFieldSchema, discovered?: ElfFieldSchema): ElfFieldSchema {
  const byPath = new Map<string, ElfFieldDescriptor>()
  for (const field of base.fields || []) {
    byPath.set(field.path, field)
  }
  for (const field of discovered?.fields || []) {
    const existing = byPath.get(field.path)
    byPath.set(field.path, existing ? { ...existing, ...field, label: existing.label || field.label } : field)
  }
  return {
    timeField: base.timeField || discovered?.timeField,
    fields: Array.from(byPath.values()).sort((a, b) => b.path.length - a.path.length),
    discoveredAt: discovered?.discoveredAt || base.discoveredAt,
  }
}

export function ElfFieldCatalog({
  schema,
  discoveredSchema,
  onChange,
  onAddToCheck,
}: {
  schema: ElfFieldSchema
  discoveredSchema?: ElfFieldSchema
  onChange: (next: ElfFieldSchema) => void
  onAddToCheck?: (field: ElfFieldDescriptor) => void
}) {
  const [customPath, setCustomPath] = useState("")
  const [customLabel, setCustomLabel] = useState("")
  const [filter, setFilter] = useState("")

  const effective = useMemo(() => mergeSchemas(schema, discoveredSchema), [schema, discoveredSchema])
  const timeFieldOptions = effective.fields?.filter((f) => f.isTimeField || f.valueType === "date") || []
  const visibleFields = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return effective.fields || []
    return (effective.fields || []).filter((field) =>
      [field.path, field.label, field.valueType, field.suggestedRole, field.source, ...(field.sampleValues || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    )
  }, [effective.fields, filter])

  function updateField(path: string, patch: Partial<ElfFieldDescriptor>) {
    const fields = (effective.fields || []).map((field) => (field.path === path ? { ...field, ...patch } : field))
    onChange({ ...effective, fields })
  }

  function removeField(path: string) {
    onChange({ ...effective, fields: (effective.fields || []).filter((field) => field.path !== path) })
  }

  function addCustomField() {
    const path = customPath.trim()
    if (!path) return
    const fields = [...(effective.fields || [])]
    if (!fields.some((field) => field.path === path)) {
      fields.push({
        path,
        label: customLabel.trim() || undefined,
        valueType: "string",
        source: "custom",
      })
    }
    onChange({ ...effective, fields })
    setCustomPath("")
    setCustomLabel("")
  }

  if (!effective.fields?.length) {
    return (
      <div className="rounded-md border border-dashed bg-muted/5 p-4 text-sm text-muted-foreground">
        Run a probe to discover fields from log hits.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Description className="text-xs">
        Fields are discovered from probe hits. Add custom paths any time a new tag appears in your logs.
      </Description>

      <TextField className="w-full">
        <Label>Search fields</Label>
        <Input
          variant="secondary"
          fullWidth
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="level, responseBody.success, exception..."
        />
      </TextField>

      <Select
        selectedKey={effective.timeField || ""}
        onSelectionChange={(key) => onChange({ ...effective, timeField: String(key) })}
      >
        <Label>Time field</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {(timeFieldOptions.length ? timeFieldOptions : effective.fields).map((field) => (
              <ListBox.Item key={field.path} id={field.path} textValue={field.path}>
                {field.path}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <div className="max-h-72 space-y-2 overflow-auto rounded-md border bg-muted/5 p-2">
        {visibleFields.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">No fields match this filter.</div>
        ) : null}
        {visibleFields.map((field) => (
          <div key={field.path} className="rounded-md border bg-background/80 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs font-semibold">{field.path}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {field.valueType ? (
                    <Chip size="sm" variant="secondary">
                      <Chip.Label>{field.valueType}</Chip.Label>
                    </Chip>
                  ) : null}
                  {field.suggestedRole ? (
                    <Chip size="sm" variant="secondary">
                      <Chip.Label>{field.suggestedRole}</Chip.Label>
                    </Chip>
                  ) : null}
                  {field.source ? (
                    <Chip size="sm" variant="secondary">
                      <Chip.Label>{field.source}</Chip.Label>
                    </Chip>
                  ) : null}
                </div>
                {field.sampleValues?.length ? (
                  <div className="mt-1 truncate text-[10px] text-muted-foreground">{field.sampleValues.join(" · ")}</div>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                {onAddToCheck ? (
                  <Button size="sm" variant="secondary" className="h-7 text-[10px]" onPress={() => onAddToCheck(field)}>
                    Check
                  </Button>
                ) : null}
                {field.source === "custom" ? (
                  <Button size="sm" variant="secondary" className="h-7 w-7 min-w-7 p-0" onPress={() => removeField(field.path)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
            <TextField className="mt-2 w-full">
              <Label className="text-[10px]">Label (optional)</Label>
              <Input
                variant="secondary"
                fullWidth
                value={field.label || ""}
                onChange={(e) => updateField(field.path, { label: e.target.value })}
              />
            </TextField>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <div className="text-xs font-semibold">Add custom field</div>
        <TextField className="w-full">
          <Label>Document path</Label>
          <Input variant="secondary" fullWidth value={customPath} onChange={(e) => setCustomPath(e.target.value)} placeholder="kubernetes.labels.app" />
        </TextField>
        <TextField className="w-full">
          <Label>Label (optional)</Label>
          <Input variant="secondary" fullWidth value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} />
        </TextField>
        <Button size="sm" className="h-8 gap-1" onPress={addCustomField}>
          <Plus className="size-3.5" />
          Add field
        </Button>
      </div>
    </div>
  )
}

export function descriptorsFromProbe(probeFields?: ElfFieldDescriptor[]): ElfFieldSchema {
  return {
    fields: probeFields || [],
    discoveredAt: new Date().toISOString(),
  }
}

export function inferredToDescriptors(inferred?: Array<{
  path: string
  label?: string
  valueType?: string
  sampleValues?: string[]
  suggestedRole?: string
  isTimeField?: boolean
  source?: string
}>): ElfFieldDescriptor[] {
  return (inferred || []).map((field) => ({
    path: field.path,
    label: field.label,
    valueType: (field.valueType as ElfFieldDescriptor["valueType"]) || "unknown",
    sampleValues: field.sampleValues,
    suggestedRole: field.suggestedRole,
    isTimeField: field.isTimeField,
    source: field.source || "discovered",
  }))
}
