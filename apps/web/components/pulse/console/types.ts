import type { ConsoleView } from "@/components/pulse/console-shared"

export interface PulseConsoleProps {
  view?: ConsoleView
  applicationId?: string
  monitorId?: string
  runId?: string
  alertId?: string
  validationId?: string
}

export type DeploymentValidationCreateInput = {
  applicationId: string
  name: string
  version: string
  buildId: string
  environment: string
  monitorIds: string[]
  sampleCount: number
  intervalSeconds: number
  deploymentStartedAt: string
  baselineWindowHours: number
  baselineRunCount: number
}
