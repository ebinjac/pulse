"use client"

import * as React from "react"
import {
  AlertDialog as BaseAlertDialog,
  Checkbox as BaseCheckbox,
  Dialog as BaseDialog,
  Menu as BaseMenu,
  Select as BaseSelect,
  Switch as BaseSwitch,
  Tabs as BaseTabs,
  Tooltip as BaseTooltip,
} from "@base-ui/react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

type AnyProps = Record<string, any> & {
  children?: any
  className?: string
  onChange?: (value: any) => void
  onSelectionChange?: (value: any) => void
  onOpenChange?: (value: boolean) => void
  onAction?: (value: any) => void
  onPress?: (value: any) => void
  onClick?: (event: React.MouseEvent<any>) => void
  onKeyUp?: (event: React.KeyboardEvent<any>) => void
}
const clean = (props: AnyProps) => {
  const { onPress, isDisabled, isIconOnly, isRequired, isInvalid, slot, textValue, ...rest } = props
  return { ...rest, onClick: props.onClick ?? onPress, disabled: props.disabled ?? isDisabled }
}

const styles = {
  focus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
  field: "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground hover:border-primary/45 disabled:cursor-not-allowed disabled:opacity-50",
}

export function Button({ variant = "primary", size = "md", isIconOnly, className, ...props }: AnyProps) {
  return <button className={cn("inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50", styles.focus,
    variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
    variant === "secondary" && "bg-secondary text-secondary-foreground hover:bg-secondary/75",
    variant === "ghost" && "hover:bg-accent hover:text-accent-foreground",
    variant === "outline" && "border border-input bg-background hover:bg-accent",
    variant === "danger" && "bg-destructive text-white hover:bg-destructive/90",
    size === "sm" ? "h-8 px-3 text-xs" : size === "lg" ? "h-11 px-6 text-sm" : "h-9 px-4 text-sm",
    isIconOnly && (size === "sm" ? "w-8 px-0" : "w-9 px-0"), className)} {...clean(props)} />
}

export function Input(props: AnyProps) { return <input {...clean(props)} className={cn(styles.field, styles.focus, props.className)} required={props.isRequired} aria-invalid={props.isInvalid || undefined} /> }
export function TextArea(props: AnyProps) { return <textarea {...clean(props)} className={cn(styles.field, "min-h-24 resize-y", styles.focus, props.className)} required={props.isRequired} /> }
export function Label(props: AnyProps) { return <label {...clean(props)} className={cn("text-sm font-medium leading-none text-foreground", props.className)} /> }
export function Description(props: AnyProps) { return <p {...clean(props)} className={cn("text-sm leading-relaxed text-muted-foreground", props.className)} /> }
export function Header(props: AnyProps) { return <header {...clean(props)} /> }
export function Separator(props: AnyProps) { return <div role="separator" {...clean(props)} className={cn("h-px w-full bg-border", props.className)} /> }
export function Spinner({ className }: AnyProps) { return <span className={cn("size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-label="Loading" /> }

const CardRoot = (props: AnyProps) => <section {...clean(props)} className={cn("rounded-lg border border-border bg-card text-card-foreground", props.className)} />
export const Card = Object.assign(CardRoot, {
  Header: (p: AnyProps) => <div {...clean(p)} className={cn("flex flex-col gap-1.5 p-5", p.className)} />,
  Title: (p: AnyProps) => <h3 {...clean(p)} className={cn("font-semibold leading-none tracking-tight", p.className)} />,
  Description,
  Content: (p: AnyProps) => <div {...clean(p)} className={cn("p-5 pt-0", p.className)} />,
  Footer: (p: AnyProps) => <div {...clean(p)} className={cn("flex items-center p-5 pt-0", p.className)} />,
})

export const Chip = Object.assign((p: AnyProps) => <span {...clean(p)} className={cn("inline-flex h-6 items-center gap-1 rounded-full bg-secondary px-2.5 text-xs font-medium text-secondary-foreground", p.variant === "danger" && "bg-destructive/10 text-destructive", p.className)} />, { Label: (p: AnyProps) => <span {...clean(p)} /> })
export const Alert = Object.assign((p: AnyProps) => <div role="alert" {...clean(p)} className={cn("rounded-md border border-border bg-muted/45 p-4 text-sm", p.status === "danger" && "border-destructive/30 bg-destructive/5 text-destructive", p.className)} />, { Content: (p: AnyProps) => <div {...clean(p)} />, Title: (p: AnyProps) => <h4 {...clean(p)} className={cn("font-semibold", p.className)} />, Description, Indicator: () => null })
export function EmptyState(p: AnyProps) { return <div {...clean(p)} className={cn("flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center text-muted-foreground", p.className)} /> }

const TextFieldRoot = (p: AnyProps) => <div {...clean(p)} className={cn("flex flex-col gap-2", p.className)} />
export const TextField = TextFieldRoot
const SearchRoot = ({ value, onChange, ...p }: AnyProps) => <div {...clean(p)} data-value={value} className={cn("relative", p.className)} />
export const SearchField = Object.assign(SearchRoot, {
  Group: (p: AnyProps) => <div {...clean(p)} className={cn("relative flex items-center", p.className)} />,
  SearchIcon: () => <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />,
  Input: (p: AnyProps) => <Input {...p} className={cn("pl-9 pr-9", p.className)} />,
  ClearButton: (p: AnyProps) => <button type="button" aria-label="Clear search" {...clean(p)} className="absolute right-2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>,
})

export const Checkbox = Object.assign((p: AnyProps) => <BaseCheckbox.Root checked={p.isSelected ?? p.checked} onCheckedChange={p.onChange} disabled={p.isDisabled} className={cn("inline-flex items-center gap-2", p.className)}>{p.children}</BaseCheckbox.Root>, {
  Control: (p: AnyProps) => <span className={cn("flex size-4 items-center justify-center rounded border border-input bg-background data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground", p.className)} {...p}><BaseCheckbox.Indicator><Check className="size-3" /></BaseCheckbox.Indicator></span>,
  Indicator: (p: AnyProps) => <Check {...clean(p)} className={cn("size-3", p.className)} />,
  Content: (p: AnyProps) => <span {...clean(p)} />,
})
export const CheckboxGroup = (p: AnyProps) => <div {...clean(p)} className={cn("flex flex-col gap-2", p.className)} />
export const Switch = Object.assign((p: AnyProps) => <BaseSwitch.Root checked={p.isSelected ?? p.checked} onCheckedChange={p.onChange} disabled={p.isDisabled} className={cn("inline-flex items-center gap-2", p.className)}>{p.children}</BaseSwitch.Root>, { Control: (p: AnyProps) => <span {...p} className={cn("relative h-5 w-9 rounded-full bg-input transition-colors data-[checked]:bg-primary", p.className)} />, Thumb: () => <BaseSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white transition-transform data-[checked]:translate-x-[18px]" />, Content: (p: AnyProps) => <span {...clean(p)} /> })

const SelectRoot = ({ selectedKey, onSelectionChange, ...p }: AnyProps) => <BaseSelect.Root value={selectedKey == null ? undefined : String(selectedKey)} onValueChange={(v) => onSelectionChange?.(v)} disabled={p.isDisabled}>{p.children}</BaseSelect.Root>
export const Select = Object.assign(SelectRoot, {
  Trigger: (p: AnyProps) => <BaseSelect.Trigger {...clean(p)} className={cn(styles.field, "justify-between", styles.focus, p.className)} />,
  Value: (p: AnyProps) => <BaseSelect.Value {...p} />,
  Indicator: () => <BaseSelect.Icon><ChevronDown className="size-4 opacity-60" /></BaseSelect.Icon>,
  Popover: (p: AnyProps) => <BaseSelect.Portal><BaseSelect.Positioner className="z-50"><BaseSelect.Popup {...clean(p)} className={cn("max-h-72 min-w-[var(--anchor-width)] overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md", p.className)} /></BaseSelect.Positioner></BaseSelect.Portal>,
})
export const ListBox = Object.assign((p: AnyProps) => <div {...clean(p)} className={cn("flex flex-col", p.className)} />, {
  Item: (p: AnyProps) => <BaseSelect.Item value={String(p.id ?? p.value ?? "")} disabled={p.isDisabled} className={cn("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50", p.className)}>{p.children}</BaseSelect.Item>,
  ItemIndicator: () => <BaseSelect.ItemIndicator className="ml-auto"><Check className="size-4" /></BaseSelect.ItemIndicator>,
})

const TabsRoot = ({ selectedKey, onSelectionChange, ...p }: AnyProps) => <BaseTabs.Root value={selectedKey} onValueChange={onSelectionChange} {...clean(p)} />
export const Tabs = Object.assign(TabsRoot, { ListContainer: (p: AnyProps) => <div {...clean(p)} />, List: (p: AnyProps) => <BaseTabs.List {...clean(p)} className={cn("inline-flex h-9 items-center gap-1 rounded-md bg-muted p-1", p.className)} />, Tab: (p: AnyProps) => <BaseTabs.Tab value={String(p.id)} {...clean(p)} className={cn("inline-flex h-7 items-center justify-center rounded px-3 text-sm font-medium text-muted-foreground data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-sm", styles.focus, p.className)} />, Indicator: (_p: AnyProps) => null, Panel: (p: AnyProps) => <BaseTabs.Panel value={String(p.id)} {...clean(p)} /> })

// HeroUI-compatible surface: call sites use Modal.Backdrop / AlertDialog.Backdrop as the
// controlled root with isOpen/onOpenChange. Base UI requires Dialog.Root for context, so
// Backdrop owns Root + Portal + Backdrop + Popup.
const DialogCloseContext = React.createContext<() => void>(() => undefined)

type DialogKit = {
  Root: React.ComponentType<AnyProps>
  Portal: React.ComponentType<AnyProps>
  Backdrop: React.ComponentType<AnyProps>
  Popup: React.ComponentType<AnyProps>
  Close: React.ComponentType<AnyProps>
  Title: React.ComponentType<AnyProps>
}

function createDialogSurface(A: DialogKit) {
  function Backdrop({ isOpen, onOpenChange, className, children, ...p }: AnyProps) {
    const actionsRef = React.useRef<{ close: () => void; unmount: () => void } | null>(null)
    const close = React.useCallback(() => {
      actionsRef.current?.close()
      onOpenChange?.(false)
    }, [onOpenChange])

    return (
      <A.Root
        open={Boolean(isOpen)}
        onOpenChange={(open: boolean) => onOpenChange?.(open)}
        actionsRef={actionsRef}
      >
        <A.Portal>
          <A.Backdrop className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]" />
          <A.Popup
            {...clean(p)}
            className={cn(
              "fixed left-1/2 top-1/2 z-50 max-h-[90svh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl bg-background shadow-2xl",
              className,
            )}
          >
            <DialogCloseContext.Provider value={close}>{children}</DialogCloseContext.Provider>
          </A.Popup>
        </A.Portal>
      </A.Root>
    )
  }

  function Dialog({ children, ...p }: AnyProps) {
    const close = React.useContext(DialogCloseContext)
    return (
      <div {...clean(p)}>
        {typeof children === "function" ? children({ close }) : children}
      </div>
    )
  }

  return {
    Backdrop,
    Container: (p: AnyProps) => (
      <div {...clean(p)} className={cn(p.size === "full" && "max-w-[calc(100vw-2rem)]", p.className)} />
    ),
    Dialog,
    Content: (p: AnyProps) => <div {...clean(p)} />,
    CloseTrigger: (p: AnyProps) => (
      <A.Close
        className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        {...clean(p)}
      >
        <X className="size-4" />
      </A.Close>
    ),
    Header: (p: AnyProps) => <div {...clean(p)} className={cn("border-b border-border px-6 py-5", p.className)} />,
    Heading: (p: AnyProps) => <A.Title {...clean(p)} className={cn("text-lg font-semibold", p.className)} />,
    Body: (p: AnyProps) => <div {...clean(p)} className={cn("px-6 py-5", p.className)} />,
    Footer: (p: AnyProps) => (
      <div {...clean(p)} className={cn("flex justify-end gap-2 border-t border-border px-6 py-4", p.className)} />
    ),
    Icon: (_p: AnyProps) => null,
  }
}

const ModalRoot = ({ isOpen, onOpenChange, ...p }: AnyProps) => (
  <BaseDialog.Root open={isOpen} onOpenChange={onOpenChange} {...p} />
)
export const Modal = Object.assign(ModalRoot, createDialogSurface(BaseDialog as unknown as DialogKit))
const AlertRoot = ({ isOpen, onOpenChange, ...p }: AnyProps) => (
  <BaseAlertDialog.Root open={isOpen} onOpenChange={onOpenChange} {...p} />
)
export const AlertDialog = Object.assign(
  AlertRoot,
  createDialogSurface(BaseAlertDialog as unknown as DialogKit),
)
export const Drawer = Modal

const DropdownActionContext = React.createContext<((value: any) => void) | undefined>(undefined)
function DropdownRoot(p: AnyProps) {
  const children = React.Children.toArray(p.children)
  const trigger = children.shift()
  return <BaseMenu.Root><BaseMenu.Trigger render={trigger as React.ReactElement} />{children}</BaseMenu.Root>
}
function DropdownMenu({ onAction, ...p }: AnyProps) {
  return <DropdownActionContext.Provider value={onAction}><div {...clean(p)} /></DropdownActionContext.Provider>
}
function DropdownItem(p: AnyProps) {
  const onAction = React.useContext(DropdownActionContext)
  return <BaseMenu.Item {...clean(p)} onClick={(event) => { p.onClick?.(event); onAction?.(p.id) }} className={cn("flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent", p.variant === "danger" && "text-destructive", p.className)} />
}
export const Dropdown = Object.assign(DropdownRoot, {
  Popover: (p: AnyProps) => <BaseMenu.Portal><BaseMenu.Positioner className="z-50"><BaseMenu.Popup {...clean(p)} className={cn("min-w-44 rounded-md border border-border bg-popover p-1 shadow-md", p.className)} /></BaseMenu.Positioner></BaseMenu.Portal>,
  Menu: DropdownMenu,
  Item: DropdownItem,
})

export const Table = Object.assign((p: AnyProps) => <div {...clean(p)} />, { ScrollContainer: (p: AnyProps) => <div {...clean(p)} className={cn("w-full overflow-auto", p.className)} />, Content: (p: AnyProps) => <table {...clean(p)} className={cn("w-full caption-bottom text-sm", p.className)} />, Header: (p: AnyProps) => <thead {...clean(p)} className={cn("border-b border-border", p.className)} />, Column: (p: AnyProps) => <th {...clean(p)} className={cn("h-10 px-4 text-left align-middle text-xs font-medium text-muted-foreground", p.className)} />, Body: (p: AnyProps) => <tbody {...clean(p)} className={cn("divide-y divide-border", p.className)} />, Row: (p: AnyProps) => <tr {...clean(p)} className={cn("transition-colors hover:bg-muted/45", p.className)} />, Cell: (p: AnyProps) => <td {...clean(p)} className={cn("p-4 align-middle", p.className)} /> })

export const Tooltip = Object.assign((p: AnyProps) => <BaseTooltip.Root {...p} />, { Trigger: (p: AnyProps) => <BaseTooltip.Trigger {...p} />, Content: (p: AnyProps) => <BaseTooltip.Portal><BaseTooltip.Positioner><BaseTooltip.Popup {...clean(p)} className={cn("z-50 rounded-md bg-foreground px-2 py-1 text-xs text-background", p.className)} /></BaseTooltip.Positioner></BaseTooltip.Portal> })
export const Disclosure = Object.assign((p: AnyProps) => <details {...clean(p)} />, { Heading: (p: AnyProps) => <summary {...clean(p)} />, Body: (p: AnyProps) => <div {...clean(p)} />, Content: (p: AnyProps) => <div {...clean(p)} /> })

// Date/time controls retain the existing value contract while the visual layer is migrated.
export type TimeValue = any
export const DateField = Object.assign((p: AnyProps) => <div {...clean(p)} />, { Group: (p: AnyProps) => <div {...clean(p)} className={cn(styles.field, p.className)} />, Input: (p: AnyProps) => <input type="datetime-local" {...clean(p)} />, Segment: (p: AnyProps) => <span {...clean(p)} />, Suffix: (p: AnyProps) => <span {...clean(p)} /> })
export const TimeField = Object.assign((p: AnyProps) => <div {...clean(p)} />, { Group: (p: AnyProps) => <div {...clean(p)} className={cn(styles.field, p.className)} />, Input: (p: AnyProps) => <input type="time" {...clean(p)} />, Segment: (p: AnyProps) => <span {...clean(p)} /> })
export const DatePicker = Object.assign((p: AnyProps) => <div {...clean(p)} />, { Trigger: Button, TriggerIndicator: () => <ChevronDown className="size-4" />, Popover: (p: AnyProps) => <div {...clean(p)} /> })
export const Calendar = Object.assign((p: AnyProps) => <div {...clean(p)} />, { Header: (p: AnyProps) => <div {...clean(p)} />, NavButton: Button, Grid: (p: AnyProps) => <table {...clean(p)} />, GridHeader: (p: AnyProps) => <thead {...clean(p)} />, HeaderCell: (p: AnyProps) => <th {...clean(p)} />, GridBody: (p: AnyProps) => <tbody {...clean(p)} />, Cell: (p: AnyProps) => <td {...clean(p)} />, YearPickerTrigger: Button, YearPickerTriggerHeading: (p: AnyProps) => <span {...clean(p)} />, YearPickerTriggerIndicator: () => <ChevronDown className="size-4" />, YearPickerGrid: (p: AnyProps) => <table {...clean(p)} />, YearPickerGridBody: (p: AnyProps) => <tbody {...clean(p)} />, YearPickerCell: (p: AnyProps) => <td {...clean(p)} /> })
