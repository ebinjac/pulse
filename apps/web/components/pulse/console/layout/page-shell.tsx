"use client"

import { Activity } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { Card as HeroCard, Description, Header, Separator } from "@heroui/react"
import { AppShellTrigger } from "@/components/pulse/app-shell"

export function PageShell({
  children,
  eyebrow,
  title,
  description,
  action,
}: {
  children: React.ReactNode
  eyebrow?: string
  title: React.ReactNode
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <Header className="flex h-16 shrink-0 items-center justify-between border-b border-separator gap-3 bg-background text-foreground px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <AppShellTrigger />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <div className="min-w-0">
            {eyebrow ? (
              <Description className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                {eyebrow}
              </Description>
            ) : null}
            <h1 className="font-heading truncate text-lg font-bold leading-tight tracking-tight text-foreground">
              {title}
            </h1>
            {description ? (
              <Description className="mt-0.5 hidden truncate text-xs font-medium md:block">{description}</Description>
            ) : null}
          </div>
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </Header>
      <div className="flex-1 overflow-auto px-4 py-6 lg:px-8">{children}</div>
    </div>
  )
}

const STAT_ICON_TONE = {
  default: "bg-default text-default-foreground",
  accent: "bg-accent/15 text-accent",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
} as const

export function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default",
  trend,
  className,
  onClick,
}: {
  label: string
  value: string
  detail: string
  icon: typeof Activity
  tone?: keyof typeof STAT_ICON_TONE
  trend?: { text: string; positive: boolean }
  className?: string
  onClick?: () => void
}) {
  return (
    <HeroCard
      className={cn(className, onClick && "cursor-pointer transition-colors select-none hover:bg-muted/30")}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="font-heading text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <HeroCard.Description>
            {trend && (
              <span
                className={cn(
                  "mr-1.5 font-semibold",
                  trend.positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                )}
              >
                {trend.text}
              </span>
            )}
            {detail}
          </HeroCard.Description>
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", STAT_ICON_TONE[tone])}>
          <Icon className="size-4" aria-hidden />
        </div>
      </div>
    </HeroCard>
  )
}

export function Section({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: React.ReactNode }) {
  return (
    <HeroCard>
      <HeroCard.Header>
        <HeroCard.Title className="font-heading flex items-center gap-2 text-base font-semibold">
          <Icon className="size-4" />
          {title}
        </HeroCard.Title>
      </HeroCard.Header>
      <HeroCard.Content className="space-y-2">
        {children}
      </HeroCard.Content>
    </HeroCard>
  )
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/5 p-3">
      <Description className="text-xs">{label}</Description>
      <div className="mt-1 break-words text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}
