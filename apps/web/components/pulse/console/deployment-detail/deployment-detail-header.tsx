"use client"

import Link from "next/link"
import {
  MoreHorizontal,
  Pencil,
  Play,
  RotateCw,
} from "lucide-react"
import type { DeploymentValidation } from "@/lib/pulse-types"
import { Button, Dropdown } from "@workspace/ui/components/ui"
import { logsConfigured } from "./deployment-detail-utils"

export function DeploymentDetailActions({
  validation,
  isDraft,
  isBusy,
  running,
  runningLogsOnly,
  generatingAI,
  canGenerateAI,
  onRunFullCheck,
  onRunMonitorsOnly,
  onRunLogsOnly,
  onGenerateAIReport,
  onNavigate,
}: {
  validation: DeploymentValidation
  isDraft: boolean
  isBusy: boolean
  running: boolean
  runningMonitorsOnly: boolean
  runningLogsOnly: boolean
  generatingAI: boolean
  canGenerateAI: boolean
  onRunFullCheck: () => void
  onRunMonitorsOnly: () => void
  onRunLogsOnly: () => void
  onGenerateAIReport: () => void
  onNavigate?: (path: string) => void
}) {
  const report = validation.report
  const logsDisabled = runningLogsOnly || !logsConfigured(validation)
  const primaryLabel =
    validation.status === "draft"
      ? "Start deployment check"
      : validation.status === "post_running"
        ? "Collecting samples"
        : validation.status === "log_running"
          ? "Running log checks"
          : report?.status && report.status !== "incomplete"
            ? "Run again"
            : "Run deployment check"

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onPress={onRunFullCheck} isDisabled={isBusy} className="h-9 gap-2">
        {running || validation.status === "post_running" || validation.status === "log_running" ? (
          <RotateCw className="size-4 animate-spin" />
        ) : (
          <Play className="size-4" />
        )}
        {primaryLabel}
      </Button>

      <Dropdown>
        <Button variant="secondary" isIconOnly aria-label="More actions" className="h-9 w-9">
          <MoreHorizontal className="size-4" />
        </Button>
        <Dropdown.Popover>
          <Dropdown.Menu
            onAction={(key) => {
              if (key === "monitors") onRunMonitorsOnly()
              if (key === "logs") onRunLogsOnly()
              if (key === "ai") onGenerateAIReport()
              if (key === "edit") onNavigate?.(`/deployments/${validation.id}/edit`)
              if (key === "list") onNavigate?.("/deployments")
            }}
          >
            <Dropdown.Item id="monitors" textValue="Run monitors only" isDisabled={isBusy}>
              Run monitors only
            </Dropdown.Item>
            <Dropdown.Item id="logs" textValue="Run logs only" isDisabled={logsDisabled}>
              Run logs only
            </Dropdown.Item>
            <Dropdown.Item id="ai" textValue="AI report" isDisabled={generatingAI || !canGenerateAI}>
              AI report
            </Dropdown.Item>
            {isDraft ? (
              <Dropdown.Item id="edit" textValue="Edit configuration">
                Edit configuration
              </Dropdown.Item>
            ) : null}
            <Dropdown.Item id="list" textValue="All deployments">
              All deployments
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      {isDraft ? (
        <Link href={`/deployments/${validation.id}/edit`}>
          <Button variant="secondary" className="h-9 gap-2">
            <Pencil className="size-4" />
            Edit
          </Button>
        </Link>
      ) : null}
    </div>
  )
}
