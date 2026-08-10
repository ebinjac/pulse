"use client"

import Link from "next/link"
import { Eye, Plus } from "lucide-react"
import type { Application, DeploymentValidation, Monitor } from "@/lib/pulse-types"
import { formatDate } from "@/components/pulse/console-shared"
import { Button, Card, EmptyState, Table } from "@workspace/ui/components/ui"
import { validationStatusLabel } from "../utils/console-utils"
import { ValidationResultPill } from "./validation-result-pill"

export function DeploymentValidationPanel({
  application,
  validations,
}: {
  application: Application
  monitors: Monitor[]
  validations: DeploymentValidation[]
}) {
  return (
    <Card>
      <Card.Header className="border-b pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <Card.Title className="text-sm font-semibold">Deployment checks</Card.Title>
            <Card.Description>Compare historical baseline metrics against sampled post-deploy checks.</Card.Description>
          </div>
          <Link href={`/deployments/create?applicationId=${application.id}`}>
            <Button size="sm" className="h-8 gap-2">
              <Plus className="size-3.5" />
              New deployment check
            </Button>
          </Link>
        </div>
      </Card.Header>
      <Card.Content className="pt-4">
        {validations.length === 0 ? (
          <div className="rounded-md border border-dashed bg-default/30 p-4 text-xs text-muted-foreground">
            No deployment checks yet. Create one before your next release to compare baseline and post-deploy behavior.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table aria-label="Deployment checks">
              <Table.ScrollContainer>
                <Table.Content className="min-w-[640px]">
                  <Table.Header>
                    <Table.Column isRowHeader className="text-xs">
                      Check
                    </Table.Column>
                    <Table.Column className="text-xs">Status</Table.Column>
                    <Table.Column className="text-xs">Report</Table.Column>
                    <Table.Column className="text-xs">Created</Table.Column>
                    <Table.Column className="text-end text-xs">Action</Table.Column>
                  </Table.Header>
                  <Table.Body
                    renderEmptyState={() => (
                      <EmptyState className="flex h-24 w-full items-center justify-center text-xs text-muted-foreground">
                        No deployment checks yet.
                      </EmptyState>
                    )}
                  >
                    {validations.slice(0, 5).map((validation) => (
                      <Table.Row key={validation.id} id={validation.id}>
                        <Table.Cell>
                          <div className="text-sm font-semibold">{validation.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {[validation.environment, validation.version, validation.buildId].filter(Boolean).join(" · ") || `CAR ${validation.carId}`}
                          </div>
                        </Table.Cell>
                        <Table.Cell className="text-xs font-semibold capitalize">{validationStatusLabel(validation.status)}</Table.Cell>
                        <Table.Cell>
                          <ValidationResultPill status={validation.report?.status || "incomplete"} />
                        </Table.Cell>
                        <Table.Cell className="text-xs text-muted-foreground">{formatDate(validation.createdAt)}</Table.Cell>
                        <Table.Cell className="text-end">
                          <Link href={`/deployments/${validation.id}`}>
                            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                              <Eye className="size-3" />
                              Open
                            </Button>
                          </Link>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
        )}
      </Card.Content>
    </Card>
  )
}
