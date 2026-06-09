"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Button, Disclosure } from "@heroui/react"

const PHASES = [
  {
    id: "baseline",
    title: "Baseline",
    description: "Collect historical monitor data before deploy time.",
  },
  {
    id: "deploy",
    title: "Deploy",
    description: "Use the selected deployment time as the cutoff.",
  },
  {
    id: "post",
    title: "Post samples",
    description: "Collect fresh samples after release.",
  },
  {
    id: "logs",
    title: "Log checks",
    description: "Optionally scan OpenSearch logs via ELF gates.",
  },
  {
    id: "report",
    title: "Report",
    description: "Generate pass/fail validation report.",
  },
] as const

export function DeploymentCheckTimelineContent() {
  return (
    <ol className="space-y-4">
      {PHASES.map((phase, index) => (
        <li key={phase.id} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {index + 1}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{phase.title}</div>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{phase.description}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function DeploymentCheckTimelineCollapsible({
  defaultExpanded = false,
}: {
  defaultExpanded?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={setIsExpanded}>
      <Disclosure.Heading>
        <Button slot="trigger" variant="secondary" className="h-10 w-full justify-between gap-2">
          <span className="text-sm font-semibold">How a deployment check works</span>
          <ChevronDown className="size-4 opacity-60 [[data-expanded=true]_&]:rotate-180 transition-transform" />
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="rounded-xl border border-border/50 bg-muted/5 p-4 shadow-sm">
          <DeploymentCheckTimelineContent />
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  )
}
