"use client"

import type { ComponentProps, ComponentType } from "react"
import { CheckCircle2, SlidersHorizontal, XCircle } from "lucide-react"
import type { MonitorStatus } from "@/lib/pulse-types"
import { Alert, Card, Checkbox, Input, Label, Select, TextArea, TextField } from "@workspace/ui/components/ui"
import { cn } from "@workspace/ui/lib/utils"

export const builderControlClass = "h-9 text-xs"

export const methodColors: Record<string, string> = {
  GET: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  POST: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
  PUT: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
  PATCH: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20",
  DELETE: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20",
  HEAD: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
  OPTIONS: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
}

export const methodChipFallback = "bg-muted/10 text-muted-foreground border-border/40"

export function BuilderInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input variant="secondary" fullWidth className={cn("min-h-9", className)} {...props} />
}

export function BuilderTextArea({ className, ...props }: ComponentProps<typeof TextArea>) {
  return <TextArea variant="secondary" fullWidth className={cn(className)} {...props} />
}

export function BuilderField({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <TextField className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}>
      <Label className="text-xs font-medium text-muted">{label}</Label>
      {children}
    </TextField>
  )
}

export function BuilderSelect({
  label,
  ariaLabel,
  selectedKey,
  onSelectionChange,
  className,
  children,
}: {
  label?: string
  ariaLabel: string
  selectedKey: string
  onSelectionChange: (key: string) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <Select
      aria-label={ariaLabel}
      className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}
      variant="secondary"
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        if (key != null) onSelectionChange(String(key))
      }}
    >
      {label ? <Label className="text-xs font-medium text-muted">{label}</Label> : null}
      <Select.Trigger className={cn("w-full", builderControlClass)}>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>{children}</Select.Popover>
    </Select>
  )
}

export function BuilderCheckboxField({
  label,
  ariaLabel,
  isSelected,
  onChange,
  className,
}: {
  label: string
  ariaLabel: string
  isSelected: boolean
  onChange: (checked: boolean) => void
  className?: string
}) {
  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-1.5", className)}>
      <Label className="text-xs font-medium text-muted">{label}</Label>
      <div className={cn("flex items-center", builderControlClass)}>
        <Checkbox isSelected={isSelected} onChange={onChange} aria-label={ariaLabel}>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
        </Checkbox>
      </div>
    </div>
  )
}

export function Section({
  children,
  title,
  icon: Icon,
}: {
  children: React.ReactNode
  title: string
  icon: typeof SlidersHorizontal
}) {
  return (
    <Card>
      <Card.Header className="gap-1.5 pb-4">
        <Card.Title className="flex items-center gap-2 text-base font-semibold">
          <Icon className="size-4 text-accent" />
          {title}
        </Card.Title>
      </Card.Header>
      <Card.Content className="gap-4">{children}</Card.Content>
    </Card>
  )
}

export function StatusPill({ status }: { status: MonitorStatus }) {
  const norm = (status || "skipped").toLowerCase() as MonitorStatus
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium capitalize",
        norm === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300"
      )}
    >
      {norm === "success" ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
      {norm}
    </span>
  )
}

export function JsonStatus({ errors, parseError }: { errors: string[]; parseError: string | null }) {
  if (parseError) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{parseError}</Alert.Description>
        </Alert.Content>
      </Alert>
    )
  }

  if (errors.length) {
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{errors.join(" ")}</Alert.Description>
        </Alert.Content>
      </Alert>
    )
  }

  return (
    <Alert status="success">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>Config is valid for local execution.</Alert.Description>
      </Alert.Content>
    </Alert>
  )
}