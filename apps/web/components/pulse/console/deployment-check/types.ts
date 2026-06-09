export type DeploymentCheckDraft = {
  name: string
  version: string
  buildId: string
  environment: string
  deploymentStartedAt: string
  baselineWindowHours: number
  baselineRunCount: number
  sampleCount: number
  intervalSeconds: number
  autoRunLogCheck: boolean
  observabilityProfile: string
}

export type WizardStep = 1 | 2 | 3 | 4

export const WIZARD_STEPS: { step: WizardStep; title: string; subtitle: string }[] = [
  { step: 1, title: "Deployment details", subtitle: "Application, environment, version, and deploy time" },
  { step: 2, title: "Monitor checks", subtitle: "Select synthetic monitors to compare" },
  { step: 3, title: "Log checks", subtitle: "Optional OpenSearch / ELF gates" },
  { step: 4, title: "Review & create", subtitle: "Confirm scope, sampling, and create" },
]
