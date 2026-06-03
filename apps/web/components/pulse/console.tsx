"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  Bell,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DatabaseZap,
  Eye,
  KeyRound,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  TestTube2,
  TerminalSquare,
  Timer,
  Workflow,
  XCircle,
} from "lucide-react"
import { useTheme } from "next-themes"

import { BuilderWorkbench } from "@/components/pulse/builder-workbench"
import type { AlertEvent, Monitor, MonitorRun, MonitorStatus, SecretReference } from "@/lib/pulse-types"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@workspace/ui/components/table"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "@workspace/ui/components/empty"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  SidebarGroup,
  SidebarGroupContent,
} from "@workspace/ui/components/sidebar"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@workspace/ui/components/chart"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts"

type ConsoleView = "dashboard" | "monitors" | "builder" | "runs" | "run-detail" | "secrets" | "settings"

interface PulseConsoleProps {
  view?: ConsoleView
  monitorId?: string
  runId?: string
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/monitors", label: "Monitors", icon: Workflow },
  { href: "/secrets", label: "Secrets", icon: KeyRound },
  { href: "/settings", label: "Settings", icon: Settings },
]

const statusTone: Record<MonitorStatus, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300",
  failed: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300",
  timeout: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300",
  error: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300",
  skipped: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300",
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value))
  } catch {
    return "Never"
  }
}

function StatusPill({ status }: { status: MonitorStatus }) {
  const norm = (status || "skipped").toLowerCase() as MonitorStatus
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium capitalize", statusTone[norm] || statusTone.skipped)}>
      {norm === "success" ? <CheckCircle2 className="size-3" /> : norm === "failed" ? <XCircle className="size-3" /> : <Clock className="size-3" />}
      {norm}
    </span>
  )
}

function PageShell({ 
  children, 
  eyebrow, 
  title, 
  description, 
  action 
}: { 
  children: React.ReactNode
  eyebrow: string
  title: string
  description?: string
  action?: React.ReactNode 
}) {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4 border-b">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md shrink-0">
              <Activity className="size-4" />
            </span>
            <div className="min-w-0">
              <span className="font-heading block text-sm font-semibold truncate text-foreground">Pulse</span>
              <span className="text-muted-foreground/60 text-[9px] block truncate font-semibold tracking-wider uppercase">Synthetic Monitors</span>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent className="p-2">
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton render={<Link href={item.href} />}>
                      <item.icon className="size-4 shrink-0 text-muted-foreground group-data-[active=true]/menu-button:text-primary" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3 border-t bg-muted/5 space-y-3">
          <div className="flex gap-2 items-start text-muted-foreground text-left">
            <ShieldCheck className="text-emerald-600 size-4 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground block">Secrets protected</span>
              <span className="text-[9px] text-muted-foreground/80 block mt-0.5 font-medium leading-3">Values are masked in execution logs</span>
            </div>
          </div>
          <div className="border-t border-border/60 pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start h-8 px-2 text-xs font-semibold gap-2 hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              {mounted && resolvedTheme === "dark" ? (
                <>
                  <Sun className="size-3.5 text-amber-500" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="size-3.5 text-blue-500" />
                  <span>Dark Mode</span>
                </>
              )}
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="flex flex-col min-w-0">
        <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 lg:px-8 gap-3 bg-background">
          <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">{eyebrow}</p>
              <h1 className="font-heading text-lg font-bold tracking-tight truncate leading-tight">{title}</h1>
              {description && <p className="text-muted-foreground text-xs font-medium mt-0.5 truncate hidden md:block">{description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {action}
          </div>
        </header>
        <div className="flex-1 overflow-auto px-4 py-6 lg:px-8 bg-muted/10">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function Metric({ 
  label, 
  value, 
  icon: Icon, 
  detail, 
  trend,
  className,
  onClick
}: { 
  label: string; 
  value: string; 
  detail: string; 
  icon: typeof Activity;
  trend?: { text: string; positive: boolean };
  className?: string;
  onClick?: () => void
}) {
  return (
    <Card 
      className={cn(className, onClick && "cursor-pointer hover:bg-muted/10 transition-colors select-none")}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-semibold text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-heading">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {trend && (
            <span className={cn("font-semibold mr-1.5", trend.positive ? "text-emerald-600" : "text-rose-600")}>
              {trend.text}
            </span>
          )}
          {detail}
        </p>
      </CardContent>
    </Card>
  )
}

const chartConfig = {
  duration: {
    label: "Latency (ms)",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig

function LatencyChart({ runs }: { runs: MonitorRun[] }) {
  const chartData = useMemo(() => {
    // Take last 12 runs, reverse so they are chronological, and map to name/value format
    return [...runs]
      .slice(0, 12)
      .reverse()
      .map((run) => ({
        time: formatDate(run.startedAt),
        duration: run.durationMs,
        name: run.monitorName,
      }))
  }, [runs])

  if (chartData.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[240px] items-center justify-center p-6">
          <Empty className="border-0 bg-transparent py-4">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-semibold">No data points available</EmptyTitle>
              <EmptyDescription className="text-xs">
                Run monitor checks to populate response time trends.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold">Response Time Trend</CardTitle>
          <CardDescription>Response time of consecutive manual & scheduled executions</CardDescription>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-semibold shrink-0 mt-1">
          <span className="size-2 rounded-full bg-primary" />
          <span>Response time</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[180px] w-full mt-2">
          <ChartContainer config={chartConfig} className="h-full w-full">
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{
                left: -10,
                right: 5,
                top: 5,
                bottom: 5,
              }}
            >
              <CartesianGrid vertical={false} className="stroke-border/50" />
              <XAxis
                dataKey="time"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => {
                  const parts = value.split(",")
                  return parts.length > 1 ? parts[1].trim() : value
                }}
              />
              <YAxis
                type="number"
                domain={[0, "auto"]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => `${value}ms`}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <defs>
                <linearGradient id="fillDuration" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-duration)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-duration)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <Area
                dataKey="duration"
                type="natural"
                fill="url(#fillDuration)"
                fillOpacity={0.4}
                stroke="var(--color-duration)"
                strokeWidth={2}
                stackId="a"
              />
            </AreaChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  )
}

interface MonitorTableProps {
  monitors: Monitor[]
  onRunNow: (monitorId: string) => Promise<any> | any
  onToggleActive: (monitorId: string, currentActive: boolean) => void
  onDeleteMonitor?: (monitorId: string) => void
}

function MonitorTable({ monitors, onRunNow, onToggleActive, onDeleteMonitor }: MonitorTableProps) {
  const [runningIds, setRunningIds] = useState<string[]>([])

  const handleRunClick = async (monitorId: string) => {
    if (runningIds.includes(monitorId)) return
    setRunningIds((prev) => [...prev, monitorId])
    try {
      await onRunNow(monitorId)
    } catch (err) {
      console.error("Failed to run monitor:", err)
    } finally {
      setRunningIds((prev) => prev.filter((id) => id !== monitorId))
    }
  }

  return (
    <Card className="overflow-hidden pt-2 pb-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[30%] text-xs ">Monitor</TableHead>
            <TableHead className="w-[12%] text-xs ">Status</TableHead>
            <TableHead className="w-[15%] text-xs ">Schedule</TableHead>
            <TableHead className="w-[18%] text-xs ">Last execution</TableHead>
            <TableHead className="w-[10%] text-xs ">State</TableHead>
            <TableHead className="text-right w-[15%] pr-6 text-xs ">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {monitors.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-48 text-center align-middle">
                <Empty className="border-0 bg-transparent py-6">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Activity className="size-5 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>No monitors found</EmptyTitle>
                    <EmptyDescription>
                      Create your first monitor to start tracking endpoint availability.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          ) : (
            monitors.map((monitor) => {
              const isRunning = runningIds.includes(monitor.id)
              return (
                <TableRow key={monitor.id} className="group hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium align-middle">
                    <div className="min-w-0 pr-2">
                      <Link href={`/monitors/${monitor.id}/runs`} className="font-semibold text-foreground hover:text-primary transition-colors hover:underline text-sm block">
                        {monitor.name}
                      </Link>
                      <p className="text-muted-foreground/80 truncate text-xs mt-0.5 font-medium">{monitor.description || "No description provided."}</p>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle">
                    <StatusPill status={monitor.status} />
                  </TableCell>
                  <TableCell className="align-middle">
                    <span className="text-muted-foreground font-medium text-[11px] bg-muted px-2 py-0.5 rounded border border-border/50 w-fit">
                      {monitor.scheduleLabel || "Manual check"}
                    </span>
                  </TableCell>
                  <TableCell className="align-middle text-muted-foreground text-xs font-medium">
                    {monitor.lastRunAt ? formatDate(monitor.lastRunAt) : "Never"}
                  </TableCell>
                  <TableCell className="align-middle">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border",
                      monitor.isActive 
                        ? "border-emerald-200/50 bg-emerald-500/10 text-emerald-600 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400" 
                        : "border-border/50 bg-muted text-muted-foreground"
                    )}>
                      <span className={cn("size-1.5 rounded-full", monitor.isActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground")} />
                      {monitor.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right pr-6 align-middle">
                    <div className="flex items-center justify-end gap-2 relative">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className={cn(
                          "h-8 text-xs font-semibold gap-1 hover:bg-primary/5 hover:text-primary min-w-[75px] justify-center",
                          isRunning && "opacity-80 cursor-not-allowed"
                        )}
                        disabled={isRunning}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRunClick(monitor.id)
                        }}
                      >
                        {isRunning ? (
                          <>
                            <RotateCw className="size-3 animate-spin" /> Running...
                          </>
                        ) : (
                          <>
                            <Play className="size-3" /> Run
                          </>
                        )}
                      </Button>

                      <Link href={`/monitors/${monitor.id}/runs`} onClick={(e) => e.stopPropagation()}>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-xs font-semibold gap-1 hover:bg-primary/5 hover:text-primary"
                        >
                          <Eye className="size-3" /> History
                        </Button>
                      </Link>

                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="sr-only">Open menu</span>
                            <span className="font-bold text-sm tracking-widest leading-none">...</span>
                          </Button>
                        } />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={
                            <Link 
                              href={`/monitors/${monitor.id}/edit`}
                              className="w-full h-full"
                              onClick={(e) => e.stopPropagation()}
                            />
                          }>
                            Edit monitor
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              onToggleActive(monitor.id, monitor.isActive)
                            }}
                          >
                            {monitor.isActive ? "Disable" : "Enable"}
                          </DropdownMenuItem>
                          {onDeleteMonitor && (
                            <DropdownMenuItem
                              className="text-rose-600 dark:text-rose-400 font-semibold border-t border-border/40 mt-1 focus:bg-red-700 dark:focus:bg-rose-950/20"
                              onClick={(e) => {
                                e.stopPropagation()
                                onDeleteMonitor(monitor.id)
                              }}
                            >
                              Delete monitor
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </Card>
  )
}

function SchedulerStatusCard({ monitors }: { monitors: Monitor[] }) {
  const activeCount = monitors.filter((m) => m.isActive && m.scheduleMode !== "manual").length

  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
            </span>
            <span className="text-sm font-medium">Scheduler Status</span>
          </div>
          <p className="text-muted-foreground text-xs">
            {activeCount} active scheduled monitor{activeCount === 1 ? "" : "s"}
          </p>
        </div>
        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 rounded-full border border-emerald-200/30">
          HEALTHY
        </span>
      </CardContent>
    </Card>
  )
}

interface DashboardProps {
  monitors: Monitor[]
  runs: MonitorRun[]
  alerts: AlertEvent[]
  onRunNow: (monitorId: string) => void
  onToggleActive: (monitorId: string, currentActive: boolean) => void
  onDeleteMonitor?: (monitorId: string) => void
}

function AlertFeed({ alerts }: { alerts: AlertEvent[] }) {
  const latestAlerts = alerts.slice(0, 5)

  return (
    <Card>
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-xs uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
          <Bell className="size-3.5 text-primary" />
          Alert Events
        </CardTitle>
        <CardDescription className="text-xs">
          Persisted delivery lifecycle from monitor failures, cooldowns, and recoveries.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 text-xs font-semibold text-foreground space-y-3">
        {latestAlerts.length === 0 ? (
          <Empty className="border-0 bg-transparent py-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bell className="size-5 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-semibold">No alert events yet</EmptyTitle>
              <EmptyDescription className="text-xs">
                Alerts appear after a monitor crosses its failure threshold.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          latestAlerts.map((alert) => {
            const latestDelivery = alert.deliveries?.[0]
            return (
              <div key={alert.id} className="border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-foreground">{alert.title}</p>
                    <p className="mt-0.5 truncate text-[11px] font-normal text-muted-foreground" title={alert.description}>
                      {alert.description || "Monitor run did not complete successfully."}
                    </p>
                  </div>
                  <span className={cn(
                    "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase",
                    alert.status === "open"
                      ? "border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-300"
                      : alert.status === "resolved"
                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300"
                        : "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300"
                  )}>
                    {alert.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-muted-foreground">
                  <span>{formatDate(alert.lastTriggeredAt)}</span>
                  <span>Channels: {alert.channels?.length ? alert.channels.join(", ") : "none"}</span>
                  {latestDelivery ? <span>Delivery: {latestDelivery.channel} {latestDelivery.status}</span> : null}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function Dashboard({ monitors, runs, alerts, onRunNow, onToggleActive, onDeleteMonitor }: DashboardProps) {
  const [activeTab, setActiveTab] = useState("overview")
  const [monitorSearch, setMonitorSearch] = useState("")
  const [monitorStatusFilter, setMonitorStatusFilter] = useState<"all" | "active" | "inactive" | "failed" | "healthy">("all")
  const [monitorScheduleFilter, setMonitorScheduleFilter] = useState<"all" | "scheduled" | "manual">("all")
  const [historyExpandedRowId, setHistoryExpandedRowId] = useState<string | null>(null)

  const failing = monitors.filter((monitor) => (monitor.status || "").toLowerCase() === "failed").length
  const active = monitors.filter((monitor) => monitor.isActive).length
  const averageResponse = Math.round(
    monitors.reduce((sum, monitor) => sum + (monitor.lastDurationMs || 0), 0) /
      Math.max(monitors.length, 1)
  )

  const systemHealthStatus = failing > 0 ? "Needs review" : "Fully operational"
  const systemHealthColor = failing > 0 
    ? "text-rose-700 bg-rose-500/5 border-rose-200/60 dark:text-rose-300 dark:border-rose-900/40 dark:bg-rose-950/20" 
    : "text-emerald-700 bg-emerald-500/5 border-emerald-200/60 dark:text-emerald-300 dark:border-emerald-900/40 dark:bg-emerald-950/20"

  const recentFailures = useMemo(() => {
    return [...monitors]
      .filter((m) => (m.status || "").toLowerCase() === "failed")
      .sort((a, b) => new Date(b.lastRunAt || 0).getTime() - new Date(a.lastRunAt || 0).getTime())
      .slice(0, 3)
  }, [monitors])

  const getMonitorFailureDetails = useCallback((monitorId: string) => {
    const monitorRuns = runs.filter((r) => r.monitorId === monitorId)
    const lastFailed = monitorRuns.find((r) => r.status === "failed")
    if (!lastFailed) return "Check execution failed"
    const failedStep = lastFailed.steps?.find((s) => s.status === "failed")
    return `${failedStep ? `[${failedStep.stepName}] ` : ""}${lastFailed.failureReason || "Assertion check failed"}`
  }, [runs])

  const slowestMonitors = useMemo(() => {
    return [...monitors]
      .filter((m) => m.isActive && (m.lastDurationMs || 0) > 0)
      .sort((a, b) => (b.lastDurationMs || 0) - (a.lastDurationMs || 0))
      .slice(0, 3)
  }, [monitors])

  const filteredMonitors = useMemo(() => {
    return monitors.filter((m) => {
      const q = monitorSearch.toLowerCase()
      const matchesSearch = !monitorSearch || 
        m.name.toLowerCase().includes(q) || 
        (m.description || "").toLowerCase().includes(q)

      const matchesStatus = 
        monitorStatusFilter === "all" ||
        (monitorStatusFilter === "active" && m.isActive) ||
        (monitorStatusFilter === "inactive" && !m.isActive) ||
        (monitorStatusFilter === "failed" && (m.status || "").toLowerCase() === "failed") ||
        (monitorStatusFilter === "healthy" && (m.status || "").toLowerCase() !== "failed")

      const matchesSchedule = 
        monitorScheduleFilter === "all" ||
        (monitorScheduleFilter === "scheduled" && m.scheduleMode !== "manual") ||
        (monitorScheduleFilter === "manual" && m.scheduleMode === "manual")

      return matchesSearch && matchesStatus && matchesSchedule
    })
  }, [monitors, monitorSearch, monitorStatusFilter, monitorScheduleFilter])

  const lastTickTime = useMemo(() => {
    const firstRun = runs[0]
    if (!firstRun) return "Never"
    try {
      const latestDate = new Date(firstRun.startedAt)
      return latestDate.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })
    } catch {
      return "10:17 AM"
    }
  }, [runs])

  return (
    <PageShell
      eyebrow="Pulse / Monitors"
      title="Synthetic monitors"
      description="Track endpoint health, response time, and recent failures."
      action={
        <Link href="/monitors/create" className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-xs font-semibold shadow-sm tracking-normal">
          <Plus className="size-4" />
          New Monitor
        </Link>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList variant="line" className="border-b w-full justify-start rounded-none h-10 px-0 gap-6">
          <TabsTrigger value="overview" className="data-active:after:bg-primary py-2 px-1 text-sm font-medium">Overview</TabsTrigger>
          <TabsTrigger value="inventory" className="data-active:after:bg-primary py-2 px-1 text-sm font-medium">Monitors ({monitors.length})</TabsTrigger>
          <TabsTrigger value="history" className="data-active:after:bg-primary py-2 px-1 text-sm font-medium">Run History ({runs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 outline-none">
          {/* Health Summary Banner */}
          <div className={cn("p-3.5 border rounded-lg flex items-center justify-between gap-4 text-xs font-semibold shadow-xs", systemHealthColor)}>
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", failing > 0 ? "bg-rose-400" : "bg-emerald-400")}></span>
                <span className={cn("relative inline-flex rounded-full size-2", failing > 0 ? "bg-rose-500" : "bg-emerald-500")}></span>
              </span>
              <span>System health: <span className="">{systemHealthStatus}</span></span>
            </div>
            <div className="text-muted-foreground font-medium text-[11px]">
              {failing} failing monitor{failing === 1 ? "" : "s"} · {active} active · {averageResponse}ms average response
            </div>
          </div>

          {/* Metrics Cards */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric 
              label="Total monitors" 
              value={String(monitors.length)} 
              detail="Active and manual checks" 
              icon={Workflow} 
              trend={{ text: `${monitors.length} configured`, positive: true }}
            />
            <Metric 
              label="Active monitors" 
              value={String(active)} 
              detail="Running background checks" 
              icon={Play} 
              trend={{ text: `${Math.round((active/Math.max(monitors.length, 1)) * 100)}% active`, positive: active > 0 }}
              onClick={() => {
                setMonitorStatusFilter("active")
                setActiveTab("inventory")
              }}
            />
            <Metric 
              label="Failing monitors" 
              value={String(failing)} 
              detail="Outage occurrences" 
              icon={AlertTriangle} 
              trend={failing > 0 ? { text: "Needs review", positive: false } : { text: "System healthy", positive: true }}
              className={cn(failing > 0 ? "border-rose-500/20 bg-rose-500/5 dark:bg-rose-950/10" : "")}
              onClick={() => {
                setMonitorStatusFilter("failed")
                setActiveTab("inventory")
              }}
            />
            <Metric 
              label="Average response" 
              value={`${averageResponse}ms`} 
              detail="Based on latest samples" 
              icon={Timer} 
            />
          </div>

          {/* Response Time Trend Chart */}
          <div className="w-full">
            <LatencyChart runs={runs} />
          </div>

          {/* Failures & Slowest Monitors Columns */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Recent Failures */}
            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-xs uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 text-rose-500" />
                  Recent Failures
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 text-xs font-semibold text-foreground space-y-3">
                {recentFailures.length === 0 ? (
                  <Empty className="border-0 bg-transparent py-4">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CheckCircle2 className="size-5 text-emerald-500" />
                      </EmptyMedia>
                      <EmptyTitle className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">All endpoints healthy</EmptyTitle>
                      <EmptyDescription className="text-xs">
                        No recent failures recorded for active monitors.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  recentFailures.map((m) => (
                    <div key={m.id} className="flex flex-col gap-1 border-b border-border/40 pb-2.5 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/monitors/${m.id}/runs`} className="hover:underline font-bold text-foreground hover:text-primary transition-colors truncate max-w-[200px]">
                          {m.name}
                        </Link>
                        <span className="text-[10px] text-rose-500 font-semibold bg-rose-500/5 border border-rose-500/20 px-1.5 py-0.5 rounded">
                          Failed
                        </span>
                      </div>
                      <p className="text-rose-600 dark:text-rose-300 font-normal leading-4 mt-0.5 text-[11px] truncate" title={getMonitorFailureDetails(m.id)}>
                        {getMonitorFailureDetails(m.id)}
                      </p>
                      <span className="text-[10px] text-muted-foreground font-medium mt-0.5">
                        Last run: {m.lastRunAt ? formatDate(m.lastRunAt) : "Never"}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Slowest Monitors */}
            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-xs uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <Timer className="size-3.5 text-amber-500" />
                  Slowest Monitors
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 text-xs font-semibold text-foreground space-y-3">
                {slowestMonitors.length === 0 ? (
                  <Empty className="border-0 bg-transparent py-4">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Timer className="size-5 text-muted-foreground" />
                      </EmptyMedia>
                      <EmptyTitle className="text-sm font-semibold">No latency stats available</EmptyTitle>
                      <EmptyDescription className="text-xs">
                        Run checks to compile response duration metrics.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  slowestMonitors.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 border-b border-border/40 pb-2.5 last:border-b-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <Link href={`/monitors/${m.id}/runs`} className="hover:underline font-bold text-foreground hover:text-primary transition-colors block truncate">
                          {m.name}
                        </Link>
                        <span className="text-[10px] text-muted-foreground font-medium block mt-0.5">
                          {m.scheduleLabel || "Manual"} · {m.timezone}
                        </span>
                      </div>
                      <span className={cn(
                        "text-xs font-bold font-heading px-2 py-0.5 rounded border",
                        m.alertPolicy?.responseTimeMs && (m.lastDurationMs || 0) > m.alertPolicy.responseTimeMs
                          ? "bg-rose-500/5 border-rose-500/20 text-rose-600 dark:text-rose-400"
                          : "bg-muted border-border/50 text-foreground"
                      )}>
                        {m.lastDurationMs || 0}ms
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <AlertFeed alerts={alerts} />
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4 outline-none">
          {/* Search Toolbar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-muted/10 p-3 rounded-lg border border-border/60">
            <div className="relative flex-1 w-full">
              <Input
                placeholder="Search monitors by name or description..."
                value={monitorSearch}
                onChange={(e) => setMonitorSearch(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-between sm:justify-start">
              <div className="space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">Status</span>
                <NativeSelect
                  size="sm"
                  value={monitorStatusFilter}
                  onChange={(e: any) => setMonitorStatusFilter(e.target.value)}
                  className="w-[110px]"
                >
                  <NativeSelectOption value="all">All</NativeSelectOption>
                  <NativeSelectOption value="active">Active</NativeSelectOption>
                  <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
                  <NativeSelectOption value="healthy">Healthy</NativeSelectOption>
                  <NativeSelectOption value="failed">Failed</NativeSelectOption>
                </NativeSelect>
              </div>

              <div className="space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">Schedule</span>
                <NativeSelect
                  size="sm"
                  value={monitorScheduleFilter}
                  onChange={(e: any) => setMonitorScheduleFilter(e.target.value)}
                  className="w-[110px]"
                >
                  <NativeSelectOption value="all">All</NativeSelectOption>
                  <NativeSelectOption value="scheduled">Scheduled</NativeSelectOption>
                  <NativeSelectOption value="manual">Manual only</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
          </div>

          <MonitorTable 
            monitors={filteredMonitors} 
            onRunNow={onRunNow} 
            onToggleActive={onToggleActive} 
            onDeleteMonitor={onDeleteMonitor}
          />
        </TabsContent>

        <TabsContent value="history" className="outline-none">
          <div className="grid gap-6 xl:grid-cols-[300px_1fr] w-full">
            <div className="space-y-4 min-w-0">
              {/* Execution Status Card */}
              <Card>
                <CardHeader className="pb-3 bg-muted/10 border-b">
                  <CardTitle className="text-xs uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                    <Play className="size-3.5" />
                    Execution Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3 text-xs font-semibold text-foreground">
                  <div className="flex justify-between border-b pb-2.5">
                    <span className="text-muted-foreground font-medium">Scheduler</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <span className="size-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      Healthy
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-2.5">
                    <span className="text-muted-foreground font-medium">Active Monitors</span>
                    <span>{active} configured</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-medium">Last Tick</span>
                    <span className="font-mono text-muted-foreground font-bold">{lastTickTime}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Alert Policy Config */}
              <Card>
                <CardHeader className="pb-3 bg-muted/10 border-b">
                  <CardTitle className="text-xs uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                    <Bell className="size-3.5" />
                    Alert Policy
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3 text-xs font-semibold text-foreground">
                  <div className="flex justify-between border-b pb-2.5">
                    <span className="text-muted-foreground font-medium">Channels</span>
                    <span>Email + Slack</span>
                  </div>
                  <div className="flex justify-between border-b pb-2.5">
                    <span className="text-muted-foreground font-medium">Threshold</span>
                    <span>3 failures</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-medium">Cooldown</span>
                    <span>30 minutes</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Run History Tab Logs Table */}
            <div className="space-y-4 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-heading text-sm font-semibold tracking-tight text-foreground">Latest Execution Logs</h3>
                  <p className="text-muted-foreground text-xs font-medium">Click any row to expand details, steps, and assertions logs.</p>
                </div>
              </div>
              <Card className="overflow-x-auto min-w-0">
                <div className="min-w-[800px] p-2">
                  <div className="grid grid-cols-[85px_150px_1.5fr_90px_100px_140px] gap-3 px-4 py-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider border-b">
                    <span>Status</span>
                    <span>Run ID</span>
                    <span>Monitor</span>
                    <span>Duration</span>
                    <span>Trigger</span>
                    <span>Time</span>
                  </div>
                  <div className="divide-y divide-border/40 text-xs font-medium">
                    {runs.length === 0 ? (
                      <Empty className="border-0 bg-transparent py-8">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Workflow className="size-5 text-muted-foreground" />
                          </EmptyMedia>
                          <EmptyTitle className="text-sm font-semibold">No execution runs</EmptyTitle>
                          <EmptyDescription className="text-xs">
                            Trigger a monitor run manually or wait for the scheduler check.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      runs.slice(0, 10).map((run) => {
                        const isRowExpanded = historyExpandedRowId === run.id
                        const firstFailedStep = run.steps?.find((s) => s.status === "failed")
                        return (
                          <div key={run.id} className="transition-colors hover:bg-muted/5">
                            {/* Clickable Header Row */}
                            <div 
                              onClick={() => setHistoryExpandedRowId(isRowExpanded ? null : run.id)}
                              className="grid grid-cols-[85px_150px_1.5fr_90px_100px_140px] items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20"
                            >
                              <div>
                                <StatusPill status={run.status} />
                              </div>
                              <div className="font-mono text-muted-foreground/80 font-semibold select-all truncate" title={run.id}>
                                {run.id}
                              </div>
                              <span className="font-bold text-foreground truncate">{run.monitorName}</span>
                              <span className="font-semibold font-heading text-foreground">{run.durationMs}ms</span>
                              <span className="capitalize text-muted-foreground font-medium">{run.triggeredBy}</span>
                              <span className="text-muted-foreground font-medium text-[11px]">{formatDate(run.startedAt)}</span>
                            </div>

                            {/* Expandable step logs block */}
                            {isRowExpanded && (
                              <div className="px-4 pb-4 pt-2 bg-muted/5 border-t border-border/20 space-y-4">
                                {run.failureReason && (
                                  <div className="rounded-lg border border-rose-200/60 bg-rose-500/5 p-3.5 font-mono text-[11px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                                    <div className="font-bold text-[9px] uppercase tracking-wider text-rose-500 mb-1 flex items-center gap-1">
                                      <AlertTriangle className="size-3" />
                                      Outage Category: {run.failureCategory || "ERROR"}
                                    </div>
                                    <p className="whitespace-pre-wrap leading-5 mt-1">{run.failureReason}</p>
                                  </div>
                                )}
                                
                                <div className="space-y-2">
                                  <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1 block">Execution Steps</div>
                                  {(run.steps || []).map((step) => (
                                    <div key={step.id} className="grid grid-cols-[150px_1fr_90px] gap-4 rounded-lg bg-muted/20 border border-border/30 p-3 items-center">
                                      <div>
                                        <div className="font-semibold text-foreground truncate" title={step.stepName}>{step.stepName}</div>
                                        <div className="text-[9px] uppercase font-bold text-muted-foreground mt-0.5">{step.type}</div>
                                      </div>
                                      <div className="text-muted-foreground font-mono text-[11px] truncate leading-5" title={step.responseSummary}>{step.responseSummary}</div>
                                      <div className="text-right flex flex-col items-end gap-1">
                                        <span className="scale-90 origin-right"><StatusPill status={step.status} /></span>
                                        <span className="text-[10px] text-muted-foreground font-semibold mt-0.5">{step.latencyMs}ms</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="flex justify-end pt-1">
                                  <Link 
                                    href={`/runs/${run.id}`}
                                    className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-3 text-[11px] font-semibold hover:bg-muted transition-colors text-foreground gap-1"
                                  >
                                    View Diagnostic Details
                                  </Link>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}

function Builder({ monitor }: { monitor: Monitor }) {
  return (
    <PageShell
      eyebrow="Monitor builder"
      title={monitor.id ? `Edit ${monitor.name}` : "Create monitor"}
    >
      <BuilderWorkbench monitor={monitor} />
    </PageShell>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: React.ReactNode }) {
  return (
    <section className="border-border bg-card rounded-md border p-4">
      <h2 className="font-heading mb-4 flex items-center gap-2 text-base font-semibold">
        <Icon className="size-4" />
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  )
}

interface RunsProps {
  monitor: Monitor
  runs: MonitorRun[]
  onRefresh: () => void
  onRunNow?: (monitorId: string) => void
}

function Runs({ monitor, runs, onRefresh, onRunNow }: RunsProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed">("all")
  const [triggerFilter, setTriggerFilter] = useState<"all" | "manual" | "scheduled">("all")
  const [minLatency, setMinLatency] = useState<string>("")
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  const monitorRuns = useMemo(() => {
    return runs.filter((run) => run.monitorId === monitor.id)
  }, [runs, monitor.id])

  const stats = useMemo(() => {
    const total = monitorRuns.length
    const success = monitorRuns.filter((r) => r.status === "success").length
    const rate = total > 0 ? Math.round((success / total) * 100) : 100
    const avg = total > 0 ? Math.round(monitorRuns.reduce((sum, r) => sum + r.durationMs, 0) / total) : 0
    const peak = total > 0 ? Math.max(...monitorRuns.map((r) => r.durationMs)) : 0
    return { total, rate, avg, peak }
  }, [monitorRuns])

  const filteredRuns = useMemo(() => {
    return monitorRuns.filter((run) => {
      const q = searchQuery.toLowerCase()
      const matchesSearch =
        !searchQuery ||
        (run.id || "").toLowerCase().includes(q) ||
        (run.failureReason || "").toLowerCase().includes(q) ||
        (run.triggeredBy || "").toLowerCase().includes(q)

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "success" && run.status === "success") ||
        (statusFilter === "failed" && run.status !== "success")

      const matchesTrigger =
        triggerFilter === "all" ||
        (triggerFilter === "manual" && run.triggeredBy === "manual") ||
        (triggerFilter === "scheduled" && run.triggeredBy !== "manual")

      const matchesLatency =
        !minLatency ||
        run.durationMs >= parseInt(minLatency, 10)

      return matchesSearch && matchesStatus && matchesTrigger && matchesLatency
    })
  }, [monitorRuns, searchQuery, statusFilter, triggerFilter, minLatency])

  const lastRun = useMemo(() => {
    if (monitorRuns.length === 0) return null
    return [...monitorRuns].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]
  }, [monitorRuns])

  const lastFailedRun = useMemo(() => {
    const sorted = [...monitorRuns].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    return sorted.find((r) => r.status === "failed")
  }, [monitorRuns])

  const failedStep = useMemo(() => {
    return lastFailedRun?.steps?.find((s) => s.status === "failed")
  }, [lastFailedRun])

  return (
    <PageShell
      eyebrow="Monitor detail"
      title={monitor.name}
      action={
        <div className="flex items-center gap-2">
          {onRunNow && (
            <Button 
              size="sm" 
              onClick={() => onRunNow(monitor.id)}
              className="gap-1 font-semibold"
            >
              <Play className="size-3.5" /> Run Now
            </Button>
          )}
          <Link 
            href={`/monitors/${monitor.id}/edit`}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-muted transition-colors text-foreground"
          >
            Edit Monitor
          </Link>
          <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1 h-8 text-xs font-semibold">
            <RotateCw className="size-3.5" /> Refresh
          </Button>
        </div>
      }
    >
      <div className="space-y-6 min-w-0">
        {/* Compact Metadata Banner */}
        <div className="pb-4 border-b border-border/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-heading text-lg font-bold tracking-tight text-foreground">{monitor.name}</h2>
              <StatusPill status={monitor.status} />
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              {monitor.scheduleLabel || "Manual checks"} · {monitor.alertPolicy?.enabled ? "Alert enabled" : "Alert disabled"} · Threshold: {monitor.failureThreshold} failures
            </p>
            {lastRun && (
              <p className="text-[11px] text-muted-foreground/80 font-medium">
                Last run: <span className="text-foreground font-semibold">{lastRun.durationMs}ms</span> · {lastRun.status === "success" ? "Passed" : "Failed"} at {formatDate(lastRun.startedAt)}
              </p>
            )}
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full space-y-6">
          <TabsList variant="line" className="border-b w-full justify-start rounded-none h-10 px-0 gap-6">
            <TabsTrigger value="overview" className="data-active:after:bg-primary py-2 px-1 text-sm font-medium">Overview</TabsTrigger>
            <TabsTrigger value="runs" className="data-active:after:bg-primary py-2 px-1 text-sm font-medium">Runs ({monitorRuns.length})</TabsTrigger>
            <TabsTrigger value="steps" className="data-active:after:bg-primary py-2 px-1 text-sm font-medium">Steps ({monitor.steps?.length || 0})</TabsTrigger>
            <TabsTrigger value="alerts" className="data-active:after:bg-primary py-2 px-1 text-sm font-medium">Alerts</TabsTrigger>
            <TabsTrigger value="settings" className="data-active:after:bg-primary py-2 px-1 text-sm font-medium">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 outline-none">
            {/* Last Failure Card */}
            {lastFailedRun && (
              <Card className="border-rose-200/60 bg-rose-500/5 dark:border-rose-900/40 dark:bg-rose-950/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase font-bold text-rose-500 tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5" />
                    Last Failure
                  </CardTitle>
                  <CardDescription className="text-rose-600/90 dark:text-rose-300/90 text-[11px]">
                    Detailed diagnosis of the most recent failing run.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 font-mono text-xs">
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-rose-200/20 pb-2">
                    <span className="text-muted-foreground font-semibold">Failed Step:</span>
                    <span className="text-foreground font-bold">{failedStep?.stepName || "Unknown Step"}</span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-rose-200/20 pb-2">
                    <span className="text-muted-foreground font-semibold">Error Reason:</span>
                    <span className="text-rose-600 dark:text-rose-300 font-bold whitespace-pre-wrap leading-5">{lastFailedRun.failureReason || failedStep?.errorMessage || "Assertion error"}</span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2">
                    <span className="text-muted-foreground font-semibold">Time:</span>
                    <span className="text-foreground">{formatDate(lastFailedRun.startedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Slim Metrics Strip */}
            <Card className="bg-card">
              <CardContent className="p-2 flex flex-wrap md:flex-nowrap items-center divide-y md:divide-y-0 md:divide-x divide-border/60 text-xs font-semibold text-foreground">
                <div className="flex-1 min-w-[120px] p-2 md:px-4 text-center md:text-left">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Total Runs</span>
                  <span className="text-sm font-bold font-heading block mt-0.5">{stats.total}</span>
                </div>
                <div className="flex-1 min-w-[120px] p-2 md:px-4 text-center md:text-left">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Success Rate</span>
                  <span className="text-sm font-bold font-heading block mt-0.5 text-emerald-600 dark:text-emerald-400">{stats.rate}%</span>
                </div>
                <div className="flex-1 min-w-[120px] p-2 md:px-4 text-center md:text-left">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Avg Latency</span>
                  <span className="text-sm font-bold font-heading block mt-0.5">{stats.avg}ms</span>
                </div>
                <div className="flex-1 min-w-[120px] p-2 md:px-4 text-center md:text-left">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Peak Latency</span>
                  <span className={cn(
                    "text-sm font-bold font-heading block mt-0.5",
                    monitor.alertPolicy?.responseTimeMs && stats.peak > monitor.alertPolicy.responseTimeMs
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-foreground"
                  )}>
                    {stats.peak}ms
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Recent execution runs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-sm font-semibold tracking-tight text-foreground">Recent execution runs</h3>
                <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">showing last 5</span>
              </div>
              <div className="space-y-3">
                {monitorRuns.slice(0, 5).map((run) => (
                  <RunTimeline key={run.id} run={run} />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="runs" className="space-y-4 outline-none">
            {/* Collapsible Filters */}
            <div className="flex flex-col gap-3 bg-muted/10 p-3 rounded-lg border border-border/60">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Input
                    placeholder="Search runs by ID, trigger, failure reason..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="flex bg-muted p-0.5 rounded-md h-9 shrink-0">
                  {(["all", "success", "failed"] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={cn(
                        "px-3 text-[11px] font-semibold capitalize rounded-md transition-all cursor-pointer",
                        statusFilter === status
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  className="h-9 text-xs gap-1 shrink-0 font-medium"
                >
                  Filters
                  <span className="text-[10px] text-muted-foreground">
                    {advancedOpen ? "▲" : "▼"}
                  </span>
                </Button>
              </div>

              {advancedOpen && (
                <div className="grid gap-3 md:grid-cols-2 pt-2 border-t border-border/40">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Trigger Source</span>
                    <div className="flex bg-muted p-0.5 rounded-md h-8 w-fit">
                      {(["all", "manual", "scheduled"] as const).map((trigger) => (
                        <button
                          key={trigger}
                          onClick={() => setTriggerFilter(trigger)}
                          className={cn(
                            "px-3 text-[10px] font-semibold capitalize rounded-md transition-all cursor-pointer",
                            triggerFilter === trigger
                              ? "bg-background text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {trigger === "scheduled" ? "Cron" : trigger}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Minimum Latency (ms)</span>
                    <Input
                      type="number"
                      placeholder="e.g. 500"
                      value={minLatency}
                      onChange={(e) => setMinLatency(e.target.value)}
                      className="h-8 text-xs max-w-[200px]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Run History Table */}
            <Card className="overflow-x-auto min-w-0">
              <div className="min-w-[800px] p-2">
                <div className="grid grid-cols-[85px_170px_100px_90px_140px_1fr] gap-3 px-4 py-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider border-b">
                  <span>Status</span>
                  <span>Run ID</span>
                  <span>Trigger</span>
                  <span>Duration</span>
                  <span>Started At</span>
                  <span>Failure Details</span>
                </div>
                <div className="divide-y divide-border/40 text-xs">
                  {filteredRuns.length === 0 ? (
                    <Empty className="border-0 bg-transparent py-8">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Workflow className="size-5 text-muted-foreground" />
                        </EmptyMedia>
                        <EmptyTitle className="text-sm font-semibold">No matching logs</EmptyTitle>
                        <EmptyDescription className="text-xs">
                          Try adjusting search query or active filter settings.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    filteredRuns.map((run) => {
                      const isRowExpanded = expandedRowId === run.id
                      const firstFailedStep = run.steps?.find((s) => s.status === "failed")
                      return (
                        <div key={run.id} className="transition-colors hover:bg-muted/5">
                          {/* Clickable Header Row */}
                          <div 
                            onClick={() => setExpandedRowId(isRowExpanded ? null : run.id)}
                            className="grid grid-cols-[85px_170px_100px_90px_140px_1fr] items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20"
                          >
                            <div>
                              <StatusPill status={run.status} />
                            </div>
                            <div className="font-mono text-muted-foreground/80 font-semibold select-all truncate" title={run.id}>
                              {run.id}
                            </div>
                            <span className="capitalize font-medium text-foreground">{run.triggeredBy}</span>
                            <span className="font-semibold font-heading text-foreground">{run.durationMs}ms</span>
                            <span className="text-muted-foreground font-medium text-[11px]">{formatDate(run.startedAt)}</span>
                            <div className="truncate text-muted-foreground pr-2 text-[11px]" title={run.failureReason}>
                              {run.status === "failed" ? (
                                <span className="text-rose-500 font-semibold">
                                  {firstFailedStep ? `[${firstFailedStep.stepName}] ` : ""}
                                  {run.failureReason || firstFailedStep?.errorMessage || "Outage"}
                                </span>
                              ) : (
                                <span className="text-emerald-600 font-medium">Completed successfully</span>
                              )}
                            </div>
                          </div>

                          {/* Expandable step logs block */}
                          {isRowExpanded && (
                            <div className="px-4 pb-4 pt-2 bg-muted/5 border-t border-border/20 space-y-4">
                              {run.failureReason && (
                                <div className="rounded-lg border border-rose-200/60 bg-rose-500/5 p-3.5 font-mono text-[11px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                                  <div className="font-bold text-[9px] uppercase tracking-wider text-rose-500 mb-1 flex items-center gap-1">
                                    <AlertTriangle className="size-3" />
                                    Outage Category: {run.failureCategory || "ERROR"}
                                  </div>
                                  <p className="whitespace-pre-wrap leading-5 mt-1">{run.failureReason}</p>
                                </div>
                              )}
                              
                              <div className="space-y-2">
                                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1 block">Execution Steps</div>
                                {(run.steps || []).map((step) => (
                                  <div key={step.id} className="grid grid-cols-[150px_1fr_90px] gap-4 rounded-lg bg-muted/20 border border-border/30 p-3 items-center">
                                    <div>
                                      <div className="font-semibold text-foreground truncate" title={step.stepName}>{step.stepName}</div>
                                      <div className="text-[9px] uppercase font-bold text-muted-foreground mt-0.5">{step.type}</div>
                                    </div>
                                    <div className="text-muted-foreground font-mono text-[11px] truncate leading-5" title={step.responseSummary}>{step.responseSummary}</div>
                                    <div className="text-right flex flex-col items-end gap-1">
                                      <span className="scale-90 origin-right"><StatusPill status={step.status} /></span>
                                      <span className="text-[10px] text-muted-foreground font-semibold mt-0.5">{step.latencyMs}ms</span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="flex justify-end pt-1">
                                <Link 
                                  href={`/runs/${run.id}`}
                                  className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-3 text-[11px] font-semibold hover:bg-muted transition-colors text-foreground gap-1"
                                >
                                  View Diagnostic Details
                                </Link>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="steps" className="space-y-4 outline-none">
            <div className="space-y-4">
              <div>
                <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">Configured Steps</h3>
                <p className="text-muted-foreground text-xs font-medium">Steps executed sequentially in this synthetic monitoring pipeline.</p>
              </div>

              {(!monitor.steps || monitor.steps.length === 0) ? (
                <Card>
                  <CardContent className="py-6">
                    <Empty className="border-0 bg-transparent py-4">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Braces className="size-5 text-muted-foreground" />
                        </EmptyMedia>
                        <EmptyTitle className="text-sm font-semibold">No steps configured</EmptyTitle>
                        <EmptyDescription className="text-xs">
                          Add HTTP check requests or script steps in the editor.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </CardContent>
                </Card>
              ) : (
                monitor.steps.map((step) => (
                  <Card key={step.id}>
                    <CardHeader className="pb-3 border-b bg-muted/10">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <span className="bg-muted px-2 py-0.5 rounded text-[10px] font-mono border">Step {step.order}</span>
                          {step.name}
                        </CardTitle>
                        <div className="flex items-center gap-4 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                          <span>Timeout: {step.timeoutMs}ms</span>
                          <span>Retries: {step.retryCount}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4 text-xs font-semibold text-foreground">
                      <div className="flex items-center gap-2 border rounded-md bg-muted/10 p-2 font-mono text-[11px] overflow-x-auto">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold text-white uppercase shrink-0",
                          step.method === "GET" ? "bg-blue-600" :
                          step.method === "POST" ? "bg-emerald-600" :
                          step.method === "PUT" ? "bg-amber-600" : "bg-zinc-600"
                        )}>
                          {step.method || step.type}
                        </span>
                        <span className="text-foreground truncate select-all">{step.url || "Manual/non-HTTP check"}</span>
                      </div>

                      {step.preRequestScript && (
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Pre-request JavaScript Script</span>
                          <pre className="p-2.5 rounded-md border bg-muted/30 font-mono text-[10px] whitespace-pre-wrap overflow-x-auto font-normal">
                            {step.preRequestScript}
                          </pre>
                        </div>
                      )}

                      {step.assertions && step.assertions.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Assertions ({step.assertions.length})</span>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {step.assertions.map((assertion) => (
                              <div key={assertion.id} className="flex items-center justify-between p-2 rounded border border-border/50 bg-muted/5 font-medium">
                                <span>{assertion.label || `${assertion.target} ${assertion.operator} ${assertion.expected}`}</span>
                                <span className="text-[10px] uppercase font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded tracking-wide">
                                  {assertion.type}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {step.extractors && step.extractors.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Variables Extractors ({step.extractors.length})</span>
                          <div className="grid gap-1.5 sm:grid-cols-2 font-normal">
                            {step.extractors.map((extractor) => (
                              <div key={extractor.id} className="flex items-center justify-between p-2 rounded border border-border/50 bg-muted/5 font-medium font-mono">
                                <span>{extractor.name} = extract({extractor.source})</span>
                                <span className="text-[9px] uppercase font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded tracking-wide">
                                  {extractor.type}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4 outline-none">
            <div className="space-y-4">
              <div>
                <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">Alert Policy Config</h3>
                <p className="text-muted-foreground text-xs font-medium">Rules triggered automatically to alert developers when this endpoint degrades or breaks.</p>
              </div>

              <Card>
                <CardHeader className="pb-3 border-b bg-muted/10">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "size-2 rounded-full",
                      monitor.alertPolicy?.enabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                    )} />
                    <CardTitle className="text-sm font-semibold">
                      Alerts: {monitor.alertPolicy?.enabled ? "Enabled" : "Disabled"}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-xs font-semibold text-foreground pt-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border p-3.5 bg-muted/5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Failure threshold</span>
                      <div className="text-base font-bold font-heading mt-1 text-foreground">{monitor.alertPolicy?.threshold || monitor.failureThreshold} Outages</div>
                      <p className="text-muted-foreground font-normal text-[11px] mt-0.5">Consecutive failures before alert triggers.</p>
                    </div>
                    <div className="rounded-lg border p-3.5 bg-muted/5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Target response time</span>
                      <div className="text-base font-bold font-heading mt-1 text-foreground">{monitor.alertPolicy?.responseTimeMs || 2000}ms</div>
                      <p className="text-muted-foreground font-normal text-[11px] mt-0.5">Response times above this trigger slow-warning alerts.</p>
                    </div>
                    <div className="rounded-lg border p-3.5 bg-muted/5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Cooldown timer</span>
                      <div className="text-base font-bold font-heading mt-1 text-foreground">{monitor.alertPolicy?.cooldownMinutes || 30} mins</div>
                      <p className="text-muted-foreground font-normal text-[11px] mt-0.5">Minutes before repeating alert reminders.</p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-border/40">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">Target Recipient Channels</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex items-center gap-2.5 p-3 rounded-lg border bg-muted/5">
                        <span className={cn(
                          "size-2 rounded-full",
                          monitor.alertPolicy?.email ? "bg-emerald-500" : "bg-muted-foreground/30"
                        )} />
                        <div>
                          <span className="font-semibold text-xs text-foreground">Email notifications</span>
                          <p className="text-muted-foreground font-normal text-[11px] mt-0.5">Sent to workspace administrator alerts registry.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5 p-3 rounded-lg border bg-muted/5">
                        <span className={cn(
                          "size-2 rounded-full",
                          monitor.alertPolicy?.slackWebhook ? "bg-emerald-500" : "bg-muted-foreground/30"
                        )} />
                        <div>
                          <span className="font-semibold text-xs text-foreground">Slack webhook channels</span>
                          <p className="text-muted-foreground font-normal text-[11px] mt-0.5">Webhook integrations push failures immediately to channel feed.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 outline-none">
            <div className="space-y-4">
              <div>
                <h3 className="font-heading text-base font-semibold tracking-tight text-foreground">General Monitor Settings</h3>
                <p className="text-muted-foreground text-xs font-medium">Properties controlling runtime execution, limits, variables, and timezone configurations.</p>
              </div>

              <Card className="text-xs">
                <CardContent className="pt-6 space-y-4 font-semibold text-foreground">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Timezone</span>
                      <div className="p-2.5 border rounded bg-muted/5 font-mono text-[11px] font-normal">{monitor.timezone}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Schedule specs (Cron)</span>
                      <div className="p-2.5 border rounded bg-muted/5 font-mono text-[11px] font-normal">{monitor.scheduleLabel || "Cron override"} (`{monitor.cron}`)</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Global check timeout</span>
                      <div className="p-2.5 border rounded bg-muted/5 font-mono text-[11px] font-normal">{monitor.timeoutMs}ms</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Global retry counts</span>
                      <div className="p-2.5 border rounded bg-muted/5 font-mono text-[11px] font-normal">{monitor.retryCount} retries</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Response body capture limits</span>
                      <div className="p-2.5 border rounded bg-muted/5 font-mono text-[11px] font-normal">{monitor.responseBodyLimitKb} KB max</div>
                    </div>
                  </div>

                  {monitor.variables && Object.keys(monitor.variables).length > 0 && (
                    <div className="space-y-2 pt-4 border-t border-border/40">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Environment Variables</span>
                      <div className="grid gap-2 font-mono text-[11px] font-normal">
                        {Object.entries(monitor.variables).map(([key, val]) => (
                          <div key={key} className="flex justify-between p-2 rounded border bg-muted/5">
                            <span className="text-muted-foreground">{key}</span>
                            <span className="text-foreground font-semibold">{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {monitor.secretAliases && monitor.secretAliases.length > 0 && (
                    <div className="space-y-2 pt-4 border-t border-border/40">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Referenced Encrypted Secrets</span>
                      <div className="flex flex-wrap gap-2 font-normal">
                        {monitor.secretAliases.map((alias) => (
                          <span key={alias} className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded font-mono text-[11px] border border-border/50">
                            <KeyRound className="size-3 text-muted-foreground" />
                            {alias}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  )
}

function RunTimeline({ run, compact = false, defaultExpanded = false }: { run: MonitorRun; compact?: boolean; defaultExpanded?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <Card className={cn("overflow-hidden transition-all duration-200 border-border/85", isExpanded ? "shadow-md bg-card" : "hover:bg-muted/10 bg-card/60")}>
      <div 
        className={cn("flex flex-wrap items-center justify-between gap-3 min-w-0 cursor-pointer select-none", compact ? "p-3" : "p-4")}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="text-muted-foreground shrink-0 mt-0.5">
            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <StatusPill status={run.status} />
              <Link 
                href={`/runs/${run.id}`} 
                onClick={(e) => e.stopPropagation()} 
                className="font-semibold text-foreground hover:text-primary transition-colors hover:underline truncate max-w-[150px] inline-block font-mono" 
                title={run.id}
              >
                {run.id}
              </Link>
              {run.status === "failed" && run.failureReason && (
                <span className="text-[11px] text-rose-500 font-medium truncate max-w-[280px] sm:max-w-[450px]" title={run.failureReason}>
                  · {run.failureReason}
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-[11px] truncate">{run.monitorName}</p>
          </div>
        </div>
        <div className="text-muted-foreground text-right text-[10px] shrink-0 font-medium flex items-center gap-4">
          <div>
            <div>{formatDate(run.startedAt)}</div>
            <div>{run.durationMs}ms · <span className="capitalize">{run.triggeredBy}</span></div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className={cn("border-t border-border/40 bg-muted/5 space-y-4", compact ? "p-3" : "px-4 pb-4 pt-4")}>
          {!compact && run.failureReason && (
            <div className="rounded-lg border border-rose-200 bg-rose-500/5 p-3.5 text-xs font-mono text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
              <div className="font-semibold text-[10px] uppercase tracking-wider text-rose-500 mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" />
                {run.failureCategory || "EXECUTION FAILURE"}
              </div>
              <p className="whitespace-pre-wrap leading-5">{run.failureReason}</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2 block">Steps Execution Logs</div>
            {(run.steps || []).map((step) => {
              if (compact) {
                return (
                  <div key={step.id} className="flex flex-col gap-1.5 rounded-lg bg-muted/30 border border-border/30 p-2.5 text-xs min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold truncate max-w-[150px]">{step.stepName}</div>
                      <span className="shrink-0 scale-90 origin-right">
                        <StatusPill status={step.status} />
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground text-[10px] gap-2">
                      <span className="truncate">{step.responseSummary}</span>
                      <span className="shrink-0">{step.latencyMs}ms</span>
                    </div>
                  </div>
                )
              }
              return (
                <div key={step.id} className="grid gap-3 rounded-lg bg-muted/20 border border-border/30 p-3 text-xs md:grid-cols-[180px_1fr_90px] items-start">
                  <div>
                    <div className="font-semibold text-foreground truncate" title={step.stepName}>{step.stepName}</div>
                    <div className="text-muted-foreground text-[10px] uppercase font-bold mt-0.5">{step.type}</div>
                  </div>
                  <div className="text-muted-foreground font-mono text-[11px] leading-5 whitespace-pre-wrap break-all">{step.responseSummary}</div>
                  <div className="text-right flex flex-col items-end justify-start gap-1">
                    <StatusPill status={step.status} />
                    <div className="text-muted-foreground text-[10px] font-medium">{step.latencyMs}ms</div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex justify-end pt-2">
            <Link 
              href={`/runs/${run.id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-muted transition-colors text-foreground gap-1"
            >
              Open Full Diagnostics Page
            </Link>
          </div>
        </div>
      )}
    </Card>
  )
}

function RunDetail({ run }: { run: MonitorRun }) {
  return (
    <PageShell eyebrow="Run detail" title={run.id}>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <RunTimeline run={run} defaultExpanded={true} />
        <Section title="Execution context" icon={TerminalSquare}>
          <div className="space-y-2">
            <Field label="Triggered by" value={run.triggeredBy} />
            <Field label="Duration" value={`${run.durationMs}ms`} />
            <Field label="Failure reason" value={run.failureReason ?? "No failure"} />
            <Field label="Stored body handling" value="Masked first, truncated to 32 KB, then stored" />
          </div>
        </Section>
      </div>
    </PageShell>
  )
}

interface SecretInput {
  name: string
  alias: string
  description: string
  value: string
  isActive: boolean
}

const emptySecretInput: SecretInput = {
  name: "",
  alias: "",
  description: "",
  value: "",
  isActive: true,
}

function secretIsActive(secret: SecretReference) {
  return secret.isActive ?? secret.status === "active"
}

function secretInputFrom(secret: SecretReference | null): SecretInput {
  if (!secret) return emptySecretInput

  return {
    name: secret.name,
    alias: secret.alias,
    description: secret.description ?? "",
    value: "",
    isActive: secretIsActive(secret),
  }
}

function SecretForm({
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

function Secrets({
  secrets,
  onSave,
  onTest,
}: {
  secrets: SecretReference[]
  onSave: (secret: SecretReference | null, input: SecretInput) => Promise<void>
  onTest: (secret: SecretReference) => Promise<boolean>
}) {
  const [editing, setEditing] = useState<SecretReference | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<SecretInput>(emptySecretInput)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

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
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1" onClick={() => openEdit(secret)}>
                            <Pencil className="size-3.5" /> Edit
                          </Button>
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-8 text-xs font-semibold gap-1"
                            onClick={() => test(secret)} 
                            disabled={testingId === secret.id}
                          >
                            {testingId === secret.id ? <RotateCw className="size-3.5 animate-spin" /> : <TestTube2 className="size-3.5" />}
                            Test
                          </Button>
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
    </PageShell>
  )
}

function SettingsView() {
  return (
    <PageShell eyebrow="Runtime defaults" title="MVP settings">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Section title="Scheduler" icon={Clock}>
          <div className="space-y-2">
            <Field label="Timing" value="Configurable: manual, fixed intervals, custom cron" />
            <Field label="Duplicate prevention" value="Reserve monitor/run key before queue enqueue" />
          </div>
        </Section>
        <Section title="Storage" icon={DatabaseZap}>
          <div className="space-y-2">
            <Field label="Secrets" value="Encrypted DB first, Vault later" />
            <Field label="Body limit" value="32 KB default per request/response body" />
          </div>
        </Section>
        <Section title="Config editing" icon={Braces}>
          <div className="space-y-2">
            <Field label="Builder" value="Form UI plus raw JSON config preview/editing path" />
            <Field label="Authentication" value="None for MVP local mode" />
          </div>
        </Section>
      </div>
    </PageShell>
  )
}

export function PulseConsole({ view = "dashboard", monitorId, runId }: PulseConsoleProps) {
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [runs, setRuns] = useState<MonitorRun[]>([])
  const [secrets, setSecrets] = useState<SecretReference[]>([])
  const [alerts, setAlerts] = useState<AlertEvent[]>([])
  const [loading, setLoading] = useState(true)

  const [activeMonitor, setActiveMonitor] = useState<Monitor | null>(null)
  const [activeRun, setActiveRun] = useState<MonitorRun | null>(null)

  // Filters for "/monitors" page
  const [monitorsSearch, setMonitorsSearch] = useState("")
  const [monitorsStatusFilter, setMonitorsStatusFilter] = useState<"all" | "active" | "inactive" | "failed" | "healthy">("all")
  const [monitorsScheduleFilter, setMonitorsScheduleFilter] = useState<"all" | "scheduled" | "manual">("all")

  const filteredMonitors = useMemo(() => {
    return monitors.filter((m) => {
      const q = monitorsSearch.toLowerCase()
      const matchesSearch = !monitorsSearch || 
        m.name.toLowerCase().includes(q) || 
        (m.description || "").toLowerCase().includes(q)

      const matchesStatus = 
        monitorsStatusFilter === "all" ||
        (monitorsStatusFilter === "active" && m.isActive) ||
        (monitorsStatusFilter === "inactive" && !m.isActive) ||
        (monitorsStatusFilter === "failed" && (m.status || "").toLowerCase() === "failed") ||
        (monitorsStatusFilter === "healthy" && (m.status || "").toLowerCase() !== "failed")

      const matchesSchedule = 
        monitorsScheduleFilter === "all" ||
        (monitorsScheduleFilter === "scheduled" && m.scheduleMode !== "manual") ||
        (monitorsScheduleFilter === "manual" && m.scheduleMode === "manual")

      return matchesSearch && matchesStatus && matchesSchedule
    })
  }, [monitors, monitorsSearch, monitorsStatusFilter, monitorsScheduleFilter])

  const fetchMonitors = async () => {
    try {
      const res = await fetch("/api/monitors")
      if (res.ok) {
        const data = await res.json()
        setMonitors(data.monitors || [])
      }
    } catch (err) {
      console.error("Failed to fetch monitors:", err)
    }
  }

  const fetchSecrets = async () => {
    try {
      const res = await fetch("/api/secrets")
      if (res.ok) {
        const data = await res.json()
        setSecrets(data.secrets || [])
      }
    } catch (err) {
      console.error("Failed to fetch secrets:", err)
    }
  }

  const fetchAlerts = async () => {
    try {
      const res = await fetch("/api/alerts")
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.alerts || [])
      }
    } catch (err) {
      console.error("Failed to fetch alerts:", err)
    }
  }

  const fetchRuns = async () => {
    try {
      const res = await fetch("/api/runs")
      if (res.ok) {
        const data = await res.json()
        setRuns(data.runs || [])
      }
    } catch (err) {
      console.error("Failed to fetch runs:", err)
    }
  }

  const fetchSingleMonitor = async (id: string) => {
    try {
      const res = await fetch(`/api/monitors/${id}`)
      if (res.ok) {
        const data = await res.json()
        setActiveMonitor(data.monitor || null)
      }
    } catch (err) {
      console.error(`Failed to fetch monitor ${id}:`, err)
    }
  }

  const fetchSingleRun = async (id: string) => {
    try {
      const res = await fetch(`/api/runs/${id}`)
      if (res.ok) {
        const data = await res.json()
        setActiveRun(data.run || null)
      }
    } catch (err) {
      console.error(`Failed to fetch run ${id}:`, err)
    }
  }

  useEffect(() => {
    setLoading(true)
    const promises = [fetchMonitors(), fetchSecrets(), fetchAlerts(), fetchRuns()]
    if (monitorId) {
      promises.push(fetchSingleMonitor(monitorId))
    }
    if (runId) {
      promises.push(fetchSingleRun(runId))
    }
    Promise.all(promises).finally(() => {
      setLoading(false)
    })
  }, [monitorId, runId])

  const handleRunNow = async (monitorIdVal: string) => {
    try {
      const res = await fetch(`/api/monitors/${monitorIdVal}/run`, { method: "POST" })
      if (res.ok) {
        await Promise.all([fetchMonitors(), fetchRuns()])
      }
    } catch (err) {
      console.error("Failed to trigger monitor run:", err)
    }
  }

  const handleToggleActive = async (monitorIdVal: string, currentActive: boolean) => {
    const monitorItem = monitors.find((m) => m.id === monitorIdVal) || activeMonitor
    if (!monitorItem) return
    try {
      const res = await fetch(`/api/monitors/${monitorIdVal}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...monitorItem, isActive: !currentActive }),
      })
      if (res.ok) {
        await Promise.all([fetchMonitors(), monitorIdVal ? fetchSingleMonitor(monitorIdVal) : Promise.resolve()])
      }
    } catch (err) {
      console.error("Failed to toggle monitor active status:", err)
    }
  }

  const handleDeleteMonitor = async (monitorIdVal: string) => {
    try {
      const res = await fetch(`/api/monitors/${monitorIdVal}`, {
        method: "DELETE",
      })
      if (res.ok) {
        await Promise.all([fetchMonitors(), fetchRuns()])
      }
    } catch (err) {
      console.error("Failed to delete monitor:", err)
    }
  }

  const handleSaveSecret = async (secret: SecretReference | null, input: SecretInput) => {
    const payload = {
      name: input.name.trim(),
      alias: input.alias.trim(),
      description: input.description.trim(),
      provider: "encrypted-db",
      value: input.value,
      isActive: input.isActive,
    }
    const res = await fetch(secret ? `/api/secrets/${secret.id}` : "/api/secrets", {
      method: secret ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to save secret.")
    }
    await fetchSecrets()
  }

  const handleTestSecret = async (secret: SecretReference) => {
    const res = await fetch(`/api/secrets/${secret.id}/test`, { method: "POST" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to test secret.")
    }
    const data = await res.json()
    return Boolean(data.ok)
  }

  if (loading && ((monitorId && !activeMonitor) || (runId && !activeRun) || (!monitorId && !runId))) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <RotateCw className="text-primary size-8 animate-spin" />
          <p className="text-muted-foreground text-sm font-medium">Loading Pulse Console...</p>
        </div>
      </div>
    )
  }

  if (view === "monitors") {
    return (
      <PageShell
        eyebrow="Inventory"
        title="Monitors"
        action={
          <Link href="/monitors/create" className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium">
            <Plus className="size-4" /> New monitor
          </Link>
        }
      >
        <div className="space-y-4">
          {/* Search Toolbar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-muted/10 p-3 rounded-lg border border-border/60">
            <div className="relative flex-1 w-full">
              <Input
                placeholder="Search monitors by name or description..."
                value={monitorsSearch}
                onChange={(e) => setMonitorsSearch(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 justify-between sm:justify-start">
              <div className="space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">Status</span>
                <NativeSelect
                  size="sm"
                  value={monitorsStatusFilter}
                  onChange={(e: any) => setMonitorsStatusFilter(e.target.value)}
                  className="w-[110px]"
                >
                  <NativeSelectOption value="all">All</NativeSelectOption>
                  <NativeSelectOption value="active">Active</NativeSelectOption>
                  <NativeSelectOption value="inactive">Inactive</NativeSelectOption>
                  <NativeSelectOption value="healthy">Healthy</NativeSelectOption>
                  <NativeSelectOption value="failed">Failed</NativeSelectOption>
                </NativeSelect>
              </div>

              <div className="space-y-0.5">
                <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">Schedule</span>
                <NativeSelect
                  size="sm"
                  value={monitorsScheduleFilter}
                  onChange={(e: any) => setMonitorsScheduleFilter(e.target.value)}
                  className="w-[110px]"
                >
                  <NativeSelectOption value="all">All</NativeSelectOption>
                  <NativeSelectOption value="scheduled">Scheduled</NativeSelectOption>
                  <NativeSelectOption value="manual">Manual only</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
          </div>

          <MonitorTable 
            monitors={filteredMonitors} 
            onRunNow={handleRunNow} 
            onToggleActive={handleToggleActive} 
            onDeleteMonitor={handleDeleteMonitor} 
          />
        </div>
      </PageShell>
    )
  }

  if (view === "builder") {
    const defaultNewMonitor: Monitor = {
      id: "",
      name: "New API Monitor",
      description: "",
      scheduleMode: "every-5m",
      scheduleLabel: "Every 5 minutes",
      cron: "*/5 * * * *",
      timezone: "UTC",
      timeoutMs: 30000,
      retryCount: 1,
      failureThreshold: 3,
      responseBodyLimitKb: 32,
      isActive: true,
      variables: {},
      secretAliases: [],
      steps: [
        {
          id: "step-1",
          order: 1,
          name: "Fetch Health Check",
          type: "http",
          method: "GET",
          url: "https://api.example.com/health",
          timeoutMs: 10000,
          retryCount: 1,
          continueOnFailure: false,
          assertions: [
            {
              id: "assert-1",
              type: "statusCode",
              label: "Status code is 200",
              target: "status",
              operator: "equals",
              expected: "200",
            }
          ],
          extractors: [],
        }
      ],
      alertPolicy: {
        enabled: true,
        threshold: 3,
        responseTimeMs: 2000,
        email: true,
        slackWebhook: false,
        cooldownMinutes: 30,
      },
      status: "skipped",
      lastRunAt: new Date().toISOString(),
      lastDurationMs: 0,
      successRate24h: 100,
    }
    return <Builder monitor={activeMonitor || defaultNewMonitor} />
  }

  if (view === "runs") {
    if (!activeMonitor) {
      return (
        <PageShell eyebrow="Run history" title="Loading...">
          <div className="text-center text-sm text-muted-foreground p-8">Monitor not found or loading...</div>
        </PageShell>
      )
    }
    return <Runs monitor={activeMonitor} runs={runs} onRefresh={fetchRuns} onRunNow={handleRunNow} />
  }

  if (view === "run-detail") {
    if (!activeRun) {
      return (
        <PageShell eyebrow="Run detail" title="Loading...">
          <div className="text-center text-sm text-muted-foreground p-8">Run not found or loading...</div>
        </PageShell>
      )
    }
    return <RunDetail run={activeRun} />
  }

  if (view === "secrets") {
    return <Secrets secrets={secrets} onSave={handleSaveSecret} onTest={handleTestSecret} />
  }

  if (view === "settings") {
    return <SettingsView />
  }

  return <Dashboard monitors={monitors} runs={runs} alerts={alerts} onRunNow={handleRunNow} onToggleActive={handleToggleActive} onDeleteMonitor={handleDeleteMonitor} />
}
