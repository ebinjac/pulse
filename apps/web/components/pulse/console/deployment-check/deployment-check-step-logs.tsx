"use client"

import type { ApplicationService, ElfQuery } from "@/lib/pulse-types"
import { Button, Card, Checkbox, CheckboxGroup, Chip, Description, EmptyState, Label } from "@workspace/ui/components/ui"
import Link from "next/link"
import { AlertTriangle, ExternalLink, Info } from "lucide-react"
import type { DeploymentCheckDraft } from "./types"
import { elfQueryPreview, gateModeDisplay } from "./deployment-check-wizard-models"
import { cn } from "@workspace/ui/lib/utils"

export function DeploymentCheckStepLogs({
  draft,
  onDraftChange,
  applicationServices,
  selectedServiceIds,
  onSelectedServiceIdsChange,
  scopedElfQueries,
  selectedElfQueryIds,
  onSelectedElfQueryIdsChange,
  samplingLocked,
}: {
  draft: DeploymentCheckDraft
  onDraftChange: (patch: Partial<DeploymentCheckDraft>) => void
  applicationServices: ApplicationService[]
  selectedServiceIds: string[]
  onSelectedServiceIdsChange: (ids: string[]) => void
  scopedElfQueries: ElfQuery[]
  selectedElfQueryIds: string[]
  onSelectedElfQueryIdsChange: (ids: string[]) => void
  samplingLocked: boolean
}) {
  const hasServices = applicationServices.length > 0

  return (
    <div className="space-y-5">
      <Card className="rounded-xl border-primary/20 bg-primary/5 p-4 shadow-sm">
        <div className="flex gap-3">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-foreground">Log checks are optional</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Use ELF gates to scan OpenSearch logs after deployment. These checks can fail the
              deployment validation even when monitors are healthy.
            </p>
          </div>
        </div>
      </Card>

      <div className={hasServices ? "grid gap-5 lg:grid-cols-2" : "space-y-5"}>
        {hasServices ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Services in scope</Label>
              <span className="text-xs font-semibold text-muted-foreground">
                {selectedServiceIds.length} selected
              </span>
            </div>
            <Description>Log services included when running ELF queries.</Description>
            <div className="max-h-52 overflow-auto rounded-xl border border-border/50 bg-background p-2 shadow-sm">
              <CheckboxGroup
                aria-label="Services in scope"
                value={selectedServiceIds}
                onChange={onSelectedServiceIdsChange}
                isDisabled={samplingLocked}
              >
                {applicationServices.map((service) => (
                  <Checkbox
                    key={service.id}
                    value={service.id}
                    className="w-full rounded-lg px-2 py-2 hover:bg-muted/30"
                  >
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Checkbox.Content>
                      <span className="text-sm font-semibold">{service.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {service.logServiceName}
                      </span>
                    </Checkbox.Content>
                  </Checkbox>
                ))}
              </CheckboxGroup>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>ELF log queries</Label>
            <span className="text-xs font-semibold text-muted-foreground">
              {selectedElfQueryIds.length} selected
            </span>
          </div>
          <Description>Saved log gates evaluated against OpenSearch after deploy.</Description>
          <div className="overflow-hidden rounded-xl border border-border/50 bg-background shadow-sm">
            <div className="max-h-64 overflow-auto p-2">
              {scopedElfQueries.length === 0 ? (
                <EmptyState className="flex flex-col items-center justify-center gap-2 border-0 bg-transparent p-8 text-center">
                  <p className="text-sm font-semibold text-foreground">No saved log checks</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Create a saved ELF gate to enable log-based validation.
                  </p>
                  <Link href="/elf-queries">
                    <Button size="sm" variant="secondary" className="h-9">
                      Create or manage ELF queries
                    </Button>
                  </Link>
                </EmptyState>
              ) : (
                <CheckboxGroup
                  aria-label="ELF log queries"
                  value={selectedElfQueryIds}
                  onChange={onSelectedElfQueryIdsChange}
                  isDisabled={samplingLocked}
                  className="gap-2"
                >
                  {scopedElfQueries.map((query) => {
                    const gate = gateModeDisplay(query.gateMode)
                    const preview = elfQueryPreview(query)
                    const serviceName =
                      applicationServices.find((s) => s.id === query.serviceId)?.name ||
                      query.signalType?.replace(/_/g, " ") ||
                      "OpenSearch / ELF"

                    return (
                      <Checkbox
                        key={query.id}
                        value={query.id}
                        className="w-full items-start rounded-lg border border-border/30 px-3 py-3 hover:bg-muted/20 data-[selected=true]:border-primary/20 data-[selected=true]:bg-primary/5"
                      >
                        <Checkbox.Control className="mt-1">
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <Checkbox.Content className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-semibold">{query.name}</span>
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                                    gate.className,
                                  )}
                                >
                                  {gate.label}
                                </span>
                              </div>
                              <div className="space-y-1 text-xs text-muted-foreground">
                                <div>
                                  <span className="font-medium text-foreground">Query: </span>
                                  <span className="font-mono">{preview}</span>
                                </div>
                                <div>
                                  <span className="font-medium text-foreground">Source: </span>
                                  OpenSearch / ELF · {serviceName}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="font-medium text-foreground">Impact: </span>
                                  {query.gateMode === "blocking" ? (
                                    <>
                                      <AlertTriangle className="size-3 text-danger" />
                                      Blocking — can fail the validation report
                                    </>
                                  ) : (
                                    "Advisory — surfaced in report, does not block alone"
                                  )}
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              className="shrink-0"
                              aria-label={`Explore ${query.name}`}
                              onPress={() =>
                                window.open(`/elf-queries/${query.id}`, "_blank", "noopener,noreferrer")
                              }
                            >
                              <ExternalLink className="size-3.5" />
                            </Button>
                          </div>
                        </Checkbox.Content>
                      </Checkbox>
                    )
                  })}
                </CheckboxGroup>
              )}
            </div>

            {selectedElfQueryIds.length > 0 ? (
              <div className="border-t border-border/40 bg-muted/10 p-3">
                <Checkbox
                  isSelected={draft.autoRunLogCheck}
                  onChange={(checked) => onDraftChange({ autoRunLogCheck: checked })}
                  isDisabled={samplingLocked}
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Content>
                    <span className="text-sm font-semibold">
                      Run log checks automatically after post-deploy sampling
                    </span>
                    <Description className="text-xs">
                      Log checks start as soon as post-deploy monitor samples finish.
                    </Description>
                  </Checkbox.Content>
                </Checkbox>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
