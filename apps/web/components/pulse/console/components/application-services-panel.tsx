"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus, Server, Trash2 } from "lucide-react"
import { Button, Card as HeroCard, Checkbox, Description, Input, Label, Modal, Table, TextField } from "@workspace/ui/components/ui"
import { pulseClient } from "@/lib/pulse-client/http-client"
import type { Application, ApplicationService, ApplicationServiceInput } from "@/lib/pulse-types"

const EMPTY_SERVICE: ApplicationServiceInput = {
  name: "",
  logServiceName: "",
  squad: "",
  owner: "",
  environment: "",
  elfAppId: "",
  indexPathTemplate: "",
  isActive: true,
}

export function ApplicationServicesPanel({ application }: { application: Application }) {
  const [services, setServices] = useState<ApplicationService[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ApplicationService | null>(null)
  const [draft, setDraft] = useState<ApplicationServiceInput>(EMPTY_SERVICE)
  const [saving, setSaving] = useState(false)

  const loadServices = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await pulseClient.listApplicationServices(application.id)
      setServices(rows)
    } finally {
      setLoading(false)
    }
  }, [application.id])

  useEffect(() => {
    void loadServices()
  }, [loadServices])

  function openCreate() {
    setEditing(null)
    setDraft({
      ...EMPTY_SERVICE,
      environment: application.environment || "",
      owner: application.owner || "",
    })
    setFormOpen(true)
  }

  function openEdit(service: ApplicationService) {
    setEditing(service)
    setDraft({
      name: service.name,
      logServiceName: service.logServiceName,
      squad: service.squad || "",
      owner: service.owner || "",
      environment: service.environment || "",
      elfAppId: service.elfAppId || "",
      indexPathTemplate: service.indexPathTemplate || "",
      isActive: service.isActive,
    })
    setFormOpen(true)
  }

  async function saveService() {
    if (!draft.name.trim() || !draft.logServiceName.trim() || saving) return
    setSaving(true)
    try {
      await pulseClient.saveApplicationService(application.id, editing?.id || null, draft)
      setFormOpen(false)
      await loadServices()
    } finally {
      setSaving(false)
    }
  }

  async function deleteService(service: ApplicationService) {
    await pulseClient.deleteApplicationService(application.id, service.id)
    await loadServices()
  }

  return (
    <HeroCard>
      <HeroCard.Header className="flex flex-row items-center justify-between border-b">
        <div>
          <HeroCard.Title className="text-sm font-semibold">Services</HeroCard.Title>
          <Description>Map ELF log service names to squads for scoped observability gates.</Description>
        </div>
        <Button size="sm" className="gap-1.5" onPress={openCreate}>
          <Plus className="size-3.5" />
          Add service
        </Button>
      </HeroCard.Header>
      <HeroCard.Content className="pt-4">
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading services…</p>
        ) : services.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/10 p-6 text-center text-xs text-muted-foreground">
            <Server className="mx-auto mb-2 size-5 opacity-60" />
            Register services like <code className="text-[10px]">payment-api</code> to scope post-deploy log signals.
          </div>
        ) : (
          <Table aria-label="Application services">
            <Table.ScrollContainer>
              <Table.Content className="min-w-[640px]">
                <Table.Header>
                  <Table.Column isRowHeader>Name</Table.Column>
                  <Table.Column>Log service</Table.Column>
                  <Table.Column>Squad</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column className="text-end">Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {services.map((service) => (
                    <Table.Row key={service.id}>
                      <Table.Cell className="font-semibold text-sm">{service.name}</Table.Cell>
                      <Table.Cell className="font-mono text-xs">{service.logServiceName}</Table.Cell>
                      <Table.Cell className="text-xs">{service.squad || service.owner || "—"}</Table.Cell>
                      <Table.Cell className="text-xs capitalize">{service.isActive ? "active" : "disabled"}</Table.Cell>
                      <Table.Cell className="text-end">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onPress={() => openEdit(service)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="secondary" onPress={() => void deleteService(service)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        )}
      </HeroCard.Content>

      <Modal isOpen={formOpen} onOpenChange={setFormOpen}>
        <Modal.Backdrop>
          <Modal.Container size="lg">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>{editing ? "Edit service" : "Add service"}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="grid gap-3 sm:grid-cols-2">
                <TextField className="sm:col-span-2" name="serviceName" isRequired>
                  <Label>Display name</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </TextField>
                <TextField className="sm:col-span-2" name="logServiceName" isRequired>
                  <Label>ELF log service name</Label>
                  <Input
                    value={draft.logServiceName}
                    onChange={(e) => setDraft({ ...draft, logServiceName: e.target.value })}
                    placeholder="payment-api"
                  />
                </TextField>
                <TextField name="squad">
                  <Label>Squad</Label>
                  <Input value={draft.squad || ""} onChange={(e) => setDraft({ ...draft, squad: e.target.value })} />
                </TextField>
                <TextField name="owner">
                  <Label>Owner</Label>
                  <Input value={draft.owner || ""} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} />
                </TextField>
                <TextField name="environment">
                  <Label>Environment filter</Label>
                  <Input value={draft.environment || ""} onChange={(e) => setDraft({ ...draft, environment: e.target.value })} />
                </TextField>
                <TextField name="indexPathTemplate" className="sm:col-span-2">
                  <Label>Index pattern override</Label>
                  <Input
                    value={draft.indexPathTemplate || ""}
                    onChange={(e) => setDraft({ ...draft, indexPathTemplate: e.target.value })}
                    placeholder="e.g. app-logs-*"
                  />
                </TextField>
                <TextField name="elfAppId">
                  <Label>ELF app ID (optional)</Label>
                  <Input value={draft.elfAppId || ""} onChange={(e) => setDraft({ ...draft, elfAppId: e.target.value })} />
                </TextField>
                <Checkbox isSelected={draft.isActive !== false} onChange={(checked) => setDraft({ ...draft, isActive: checked })}>
                  <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                  <Checkbox.Content><span className="text-xs font-semibold">Active</span></Checkbox.Content>
                </Checkbox>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" slot="close">Cancel</Button>
                <Button onPress={() => void saveService()} isDisabled={saving}>
                  {saving ? "Saving…" : "Save service"}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </HeroCard>
  )
}
