"use client"

import { BuilderWorkbench } from "@/components/pulse/builder"
import { PageShell } from "@/components/pulse/console-shared"
import type {
  Application,
  CertificateProfile,
  Monitor,
} from "@/lib/pulse-types"

export function Builder({
  monitor,
  applications,
  certificateProfiles,
}: {
  monitor: Monitor
  applications: Application[]
  certificateProfiles: CertificateProfile[]
}) {
  return (
    <PageShell
      eyebrow="Monitor builder"
      title={monitor.id ? `Edit ${monitor.name}` : "Create monitor"}
      description="Configure steps, variables, scheduling, and alerting before saving or publishing the monitor."
    >
      <BuilderWorkbench
        monitor={monitor}
        applications={applications}
        certificateProfiles={certificateProfiles}
      />
    </PageShell>
  )
}
