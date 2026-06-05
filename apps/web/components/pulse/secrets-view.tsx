"use client"

import { useMemo, useState } from "react"
import { KeyRound, MoreHorizontal, Pencil, Plus, RotateCw, ShieldCheck, TestTube2, Trash2 } from "lucide-react"
import type { SecretReference } from "@/lib/pulse-types"
import {
  Alert,
  AlertDialog,
  Button,
  Card,
  Checkbox,
  Drawer,
  Dropdown,
  EmptyState,
  Input,
  Label,
  Table,
  TextArea,
  TextField,
} from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"
import { PageShell } from "./console-shared"

export interface SecretInput {
  name: string
  alias: string
  description: string
  value: string
  isActive: boolean
}

export const emptySecretInput: SecretInput = {
  name: "",
  alias: "",
  description: "",
  value: "",
  isActive: true,
}

export function secretIsActive(secret: SecretReference) {
  return secret.isActive ?? secret.status === "active"
}

export function secretInputFrom(secret: SecretReference | null): SecretInput {
  if (!secret) return emptySecretInput

  return {
    name: secret.name,
    alias: secret.alias,
    description: secret.description ?? "",
    value: "",
    isActive: secretIsActive(secret),
  }
}

export function SecretForm({
  mode,
  value,
  onChange,
  onSubmit,
  saving,
  error,
}: {
  mode: "create" | "edit"
  value: SecretInput
  onChange: (value: SecretInput) => void
  onSubmit: () => void
  saving: boolean
  error: string
}) {
  const update = (patch: Partial<SecretInput>) => onChange({ ...value, ...patch })

  return (
    <>
      <Drawer.CloseTrigger />
      <Drawer.Header>
        <Drawer.Heading>{mode === "create" ? "New encrypted secret" : "Edit encrypted secret"}</Drawer.Heading>
      </Drawer.Header>
      <Drawer.Body>
        <form
          id="secret-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <p className="text-sm text-muted">
            Values are encrypted before storage and never returned by the API. Leave value blank while editing to keep
            the current ciphertext.
          </p>
          <TextField className="w-full" name="name" type="text">
            <Label>Name</Label>
            <Input
              placeholder="Partner API token"
              variant="secondary"
              value={value.name}
              onChange={(event) => update({ name: event.target.value })}
            />
          </TextField>
          <TextField className="w-full" name="alias" type="text">
            <Label>Alias</Label>
            <Input
              placeholder="partnerApiToken"
              variant="secondary"
              value={value.alias}
              onChange={(event) => update({ alias: event.target.value })}
            />
          </TextField>
          <TextField className="w-full" name="description">
            <Label>Description</Label>
            <TextArea
              placeholder="Used by synthetic monitor pre-request scripts"
              variant="secondary"
              fullWidth
              className="min-h-20"
              value={value.description}
              onChange={(event) => update({ description: event.target.value })}
            />
          </TextField>
          <TextField className="w-full" name="value" type="password">
            <Label>Secret value</Label>
            <Input
              type="password"
              placeholder={mode === "edit" ? "Leave blank to keep existing value" : "Paste secret value"}
              variant="secondary"
              value={value.value}
              onChange={(event) => update({ value: event.target.value })}
            />
          </TextField>
          <div className="flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <Checkbox isSelected={value.isActive} onChange={(checked) => update({ isActive: !!checked })}>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
            </Checkbox>
            <span className="text-foreground">Active and available to monitor execution</span>
          </div>
          {error ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
        </form>
      </Drawer.Body>
      <Drawer.Footer>
        <Button variant="secondary" slot="close" isDisabled={saving}>
          Cancel
        </Button>
        <Button onPress={onSubmit} isDisabled={saving} className="gap-2">
          {saving ? <RotateCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {mode === "create" ? "Create secret" : "Save secret"}
        </Button>
      </Drawer.Footer>
    </>
  )
}

export function Secrets({
  secrets,
  onSave,
  onTest,
  onDelete,
}: {
  secrets: SecretReference[]
  onSave: (secret: SecretReference | null, input: SecretInput) => Promise<void>
  onTest: (secret: SecretReference) => Promise<boolean>
  onDelete?: (secretId: string) => Promise<void>
}) {
  const [editing, setEditing] = useState<SecretReference | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<SecretInput>(emptySecretInput)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [confirmDelete, setConfirmDelete] = useState<SecretReference | null>(null)

  const filteredSecrets = useMemo(() => {
    return secrets.filter((s) => {
      const q = searchQuery.toLowerCase()
      return (
        (s.name || "").toLowerCase().includes(q) ||
        (s.alias || "").toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q)
      )
    })
  }, [secrets, searchQuery])

  const openCreate = () => {
    setEditing(null)
    setForm(emptySecretInput)
    setMessage("")
    setError("")
    setOpen(true)
  }

  const openEdit = (secret: SecretReference) => {
    setEditing(secret)
    setForm(secretInputFrom(secret))
    setMessage("")
    setError("")
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim() || !form.alias.trim()) {
      setError("Name and alias are required.")
      return
    }
    if (!editing && !form.value.trim()) {
      setError("Secret value is required for new secrets.")
      return
    }

    setSaving(true)
    setError("")
    setMessage("")
    try {
      await onSave(editing, form)
      setOpen(false)
      setMessage(editing ? "Secret updated." : "Secret created.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save secret.")
    } finally {
      setSaving(false)
    }
  }

  const test = async (secret: SecretReference) => {
    setTestingId(secret.id)
    setMessage("")
    setError("")
    try {
      const ok = await onTest(secret)
      setMessage(ok ? `${secret.alias} decrypted successfully.` : `${secret.alias} could not be decrypted.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to test secret.")
    } finally {
      setTestingId(null)
    }
  }

  return (
    <PageShell
      eyebrow="Encrypted storage"
      title="Secret references"
      action={
        <Button size="sm" onPress={openCreate} className="gap-2">
          <Plus className="size-4" />
          New secret
        </Button>
      }
    >
      <Drawer isOpen={open} onOpenChange={setOpen}>
        <Drawer.Backdrop>
          <Drawer.Content placement="right">
            <Drawer.Dialog>
              <SecretForm
                mode={editing ? "edit" : "create"}
                value={form}
                onChange={setForm}
                onSubmit={save}
                saving={saving}
                error={error}
              />
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>

      {message ? (
        <Alert status="success" className="mb-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {error && !open ? (
        <Alert status="danger" className="mb-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <Card className="w-full">
        <Card.Header className="flex flex-row items-center justify-between pb-4">
          <div>
            <Card.Title className="text-base font-semibold">Secrets Inventory</Card.Title>
            <Card.Description>
              Reference encrypted variables and secure tokens in your monitoring requests.
            </Card.Description>
          </div>
          <TextField className="w-[300px]">
            <Input
              placeholder="Search secrets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9"
              fullWidth
            />
          </TextField>
        </Card.Header>
        <Card.Content>
          <div className="overflow-hidden">
            <Table aria-label="Secrets">
              <Table.ScrollContainer>
                <Table.Content className="min-w-[860px]">
                  <Table.Header>
                    <Table.Column isRowHeader className="px-4 font-semibold">
                      Name
                    </Table.Column>
                    <Table.Column className="px-4 font-semibold">Alias</Table.Column>
                    <Table.Column className="px-4 font-semibold">Provider</Table.Column>
                    <Table.Column className="px-4 font-semibold">Status</Table.Column>
                    <Table.Column className="px-4 font-semibold">Value</Table.Column>
                    <Table.Column className="px-4 font-semibold">Description</Table.Column>
                    <Table.Column className="px-4 pr-6 text-end font-semibold">Actions</Table.Column>
                  </Table.Header>
                  <Table.Body
                    renderEmptyState={() => (
                      <EmptyState className="flex h-48 w-full flex-col items-center justify-center gap-2 border-0 bg-transparent">
                        <KeyRound className="size-6 text-muted" />
                        <p className="font-semibold text-foreground">No secrets found</p>
                        <p className="text-sm text-muted">
                          Create a secret to store API tokens or auth credentials securely.
                        </p>
                      </EmptyState>
                    )}
                  >
                    {filteredSecrets.map((secret) => (
                      <Table.Row key={secret.id} id={secret.id} className="hover:bg-default/40">
                        <Table.Cell className="px-4 align-middle font-semibold text-foreground">
                          <div className="flex items-center gap-2">
                            <KeyRound className="size-4 shrink-0 text-muted" />
                            <span>{secret.name}</span>
                          </div>
                        </Table.Cell>
                        <Table.Cell className="px-4 align-middle font-mono text-xs">
                          <code className="rounded border bg-default px-1.5 py-0.5 text-[11px] font-semibold">
                            {`{{secrets.${secret.alias}}}`}
                          </code>
                        </Table.Cell>
                        <Table.Cell className="px-4 align-middle text-xs text-muted">
                          {secret.provider === "encrypted-db" ? "Encrypted DB" : "Vault"}
                        </Table.Cell>
                        <Table.Cell className="px-4 align-middle">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                              secretIsActive(secret)
                                ? "border-emerald-200/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
                                : "border-border bg-default text-muted"
                            )}
                          >
                            <span
                              className={cn("size-1.5 rounded-full", secretIsActive(secret) ? "bg-emerald-500" : "bg-muted")}
                            />
                            {secretIsActive(secret) ? "active" : "inactive"}
                          </span>
                        </Table.Cell>
                        <Table.Cell className="px-4 align-middle font-mono text-xs tracking-widest text-muted">
                          ••••••••
                        </Table.Cell>
                        <Table.Cell className="max-w-[200px] truncate px-4 align-middle text-xs text-muted">
                          <span title={secret.description}>{secret.description || "—"}</span>
                        </Table.Cell>
                        <Table.Cell className="px-4 pr-6 text-end align-middle">
                          <div className="flex items-center justify-end">
                            <Dropdown>
                              <Button variant="ghost" size="sm" isIconOnly aria-label="Open menu">
                                <MoreHorizontal className="size-4" />
                              </Button>
                              <Dropdown.Popover>
                                <Dropdown.Menu
                                  onAction={(key) => {
                                    if (key === "edit") openEdit(secret)
                                    if (key === "test") test(secret)
                                    if (key === "delete") setConfirmDelete(secret)
                                  }}
                                >
                                  <Dropdown.Item id="edit" textValue="Edit" className="gap-2">
                                    <Pencil className="size-3.5 text-muted" />
                                    Edit
                                  </Dropdown.Item>
                                  <Dropdown.Item
                                    id="test"
                                    textValue="Test"
                                    isDisabled={testingId === secret.id}
                                    className="gap-2"
                                  >
                                    {testingId === secret.id ? (
                                      <RotateCw className="size-3.5 animate-spin text-muted" />
                                    ) : (
                                      <TestTube2 className="size-3.5 text-muted" />
                                    )}
                                    Test
                                  </Dropdown.Item>
                                  {onDelete ? (
                                    <Dropdown.Item id="delete" textValue="Delete" className="gap-2 text-danger">
                                      <Trash2 className="size-3.5" />
                                      Delete
                                    </Dropdown.Item>
                                  ) : null}
                                </Dropdown.Menu>
                              </Dropdown.Popover>
                            </Dropdown>
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
        </Card.Content>
      </Card>

      <AlertDialog.Backdrop
        isOpen={confirmDelete !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfirmDelete(null)
        }}
      >
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete secret?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="text-left text-sm text-muted">
              Are you sure you want to permanently delete the secret{" "}
              <strong className="text-foreground">{confirmDelete?.name}</strong>? Any active monitors referencing this
              secret via the alias{" "}
              <code className="rounded border border-danger/10 bg-danger/5 px-1 py-0.5 font-mono text-[11px] font-semibold text-danger">
                {`{{secrets.${confirmDelete?.alias}}}`}
              </code>{" "}
              will fail to resolve.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="secondary" slot="close">
                Cancel
              </Button>
              <Button
                variant="danger"
                onPress={async () => {
                  if (confirmDelete && onDelete) {
                    try {
                      await onDelete(confirmDelete.id)
                      setMessage(`Secret "${confirmDelete.name}" deleted.`)
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed to delete secret.")
                    }
                  }
                  setConfirmDelete(null)
                }}
              >
                Delete secret
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </PageShell>
  )
}
