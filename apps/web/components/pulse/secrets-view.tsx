"use client"

import { useMemo, useState } from "react"
import { KeyRound, Pencil, Plus, RotateCw, ShieldCheck, TestTube2, Trash2 } from "lucide-react"
import type { SecretReference } from "@/lib/pulse-types"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@workspace/ui/components/empty"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"
import { PageShell } from "./console-shared"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"


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
  onCancel,
  onSubmit,
  saving,
  error,
}: {
  mode: "create" | "edit"
  value: SecretInput
  onChange: (value: SecretInput) => void
  onCancel: () => void
  onSubmit: () => void
  saving: boolean
  error: string
}) {
  const update = (patch: Partial<SecretInput>) => onChange({ ...value, ...patch })

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle>{mode === "create" ? "New encrypted secret" : "Edit encrypted secret"}</SheetTitle>
        <SheetDescription>
          Values are encrypted before storage and never returned by the API. Leave value blank while editing to keep the current ciphertext.
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-4 overflow-auto px-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Name</span>
          <Input value={value.name} onChange={(event) => update({ name: event.target.value })} placeholder="Partner API token" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Alias</span>
          <Input value={value.alias} onChange={(event) => update({ alias: event.target.value })} placeholder="partnerApiToken" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Description</span>
          <textarea
            className="min-h-20 w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={value.description}
            onChange={(event) => update({ description: event.target.value })}
            placeholder="Used by synthetic monitor pre-request scripts"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Secret value</span>
          <Input
            type="password"
            value={value.value}
            onChange={(event) => update({ value: event.target.value })}
            placeholder={mode === "edit" ? "Leave blank to keep existing value" : "Paste secret value"}
          />
        </label>
        <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={value.isActive}
            onChange={(event) => update({ isActive: event.target.checked })}
            className="size-4 accent-primary"
          />
          Active and available to monitor execution
        </label>
        {error ? <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      </div>
      <SheetFooter className="border-t">
        <Button onClick={onSubmit} disabled={saving}>
          {saving ? <RotateCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {mode === "create" ? "Create secret" : "Save secret"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      </SheetFooter>
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
    <PageShell eyebrow="Encrypted storage" title="Secret references" action={<Button size="sm" onClick={openCreate}><Plus className="size-4" /> New secret</Button>}>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md">
          <SecretForm
            mode={editing ? "edit" : "create"}
            value={form}
            onChange={setForm}
            onCancel={() => setOpen(false)}
            onSubmit={save}
            saving={saving}
            error={error}
          />
        </SheetContent>
      </Sheet>
      {message ? <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">{message}</p> : null}
      {error && !open ? <p className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      
      <Card className="w-full">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-base font-semibold">Secrets Inventory</CardTitle>
            <CardDescription>
              Reference encrypted variables and secure tokens in your monitoring requests.
            </CardDescription>
          </div>
          <div className="w-[300px]">
            <Input
              placeholder="Search secrets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 font-semibold">Name</TableHead>
                  <TableHead className="px-4 font-semibold">Alias</TableHead>
                  <TableHead className="px-4 font-semibold">Provider</TableHead>
                  <TableHead className="px-4 font-semibold">Status</TableHead>
                  <TableHead className="px-4 font-semibold">Value</TableHead>
                  <TableHead className="px-4 font-semibold">Description</TableHead>
                  <TableHead className="px-4 font-semibold text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSecrets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center align-middle">
                      <Empty className="border-0 bg-transparent py-6">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <KeyRound className="size-5 text-muted-foreground" />
                          </EmptyMedia>
                          <EmptyTitle>No secrets found</EmptyTitle>
                          <EmptyDescription>
                            Create a secret to store API tokens or auth credentials securely.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSecrets.map((secret) => (
                    <TableRow key={secret.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="px-4 font-semibold text-foreground align-middle">
                        <div className="flex items-center gap-2">
                          <KeyRound className="size-4 text-muted-foreground shrink-0" />
                          <span>{secret.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 font-mono text-xs align-middle">
                        <code className="bg-muted px-1.5 py-0.5 rounded border text-[11px] font-semibold">
                          {`{{secrets.${secret.alias}}}`}
                        </code>
                      </TableCell>
                      <TableCell className="px-4 text-muted-foreground text-xs align-middle">
                        {secret.provider === "encrypted-db" ? "Encrypted DB" : "Vault"}
                      </TableCell>
                      <TableCell className="px-4 align-middle">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                          secretIsActive(secret)
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200/50 dark:bg-emerald-950/20 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground border-border"
                        )}>
                          <span className={cn("size-1.5 rounded-full", secretIsActive(secret) ? "bg-emerald-500" : "bg-muted-foreground")} />
                          {secretIsActive(secret) ? "active" : "inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 font-mono text-xs text-muted-foreground tracking-widest align-middle">
                        ••••••••
                      </TableCell>
                      <TableCell className="px-4 text-muted-foreground text-xs truncate max-w-[200px] align-middle" title={secret.description}>
                        {secret.description || "—"}
                      </TableCell>
                      <TableCell className="px-4 text-right pr-6 align-middle">
                        <div className="flex items-center justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger render={
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="sr-only">Open menu</span>
                                <span className="font-bold text-sm tracking-widest leading-none">...</span>
                              </Button>
                            } />
                            <DropdownMenuContent align="end" className="w-36">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEdit(secret)
                                }}
                                className="cursor-pointer gap-2"
                              >
                                <Pencil className="size-3.5 text-muted-foreground" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  test(secret)
                                }}
                                disabled={testingId === secret.id}
                                className="cursor-pointer gap-2"
                              >
                                {testingId === secret.id ? (
                                  <RotateCw className="size-3.5 animate-spin text-muted-foreground" />
                                ) : (
                                  <TestTube2 className="size-3.5 text-muted-foreground" />
                                )}
                                Test
                              </DropdownMenuItem>
                              {onDelete && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmDelete(secret)
                                  }}
                                  className="text-rose-600 dark:text-rose-400 font-semibold border-t border-border/40 mt-1 cursor-pointer focus:bg-rose-50 dark:focus:bg-rose-950/20 gap-2"
                                >
                                  <Trash2 className="size-3.5" />
                                  Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Secret?</AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              Are you sure you want to permanently delete the secret{" "}
              <strong className="text-foreground">"{confirmDelete?.name}"</strong>? Any active monitors referencing this secret via the alias{" "}
              <code className="font-mono text-[11px] font-semibold text-rose-500 bg-rose-500/5 px-1 py-0.5 rounded border border-rose-500/10">{`{{secrets.${confirmDelete?.alias}}}`}</code> will fail to resolve.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="cursor-pointer"
              onClick={async () => {
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
              Delete Secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
