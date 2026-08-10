"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Activity,
  Boxes,
  Rocket,
  Workflow,
  Bell,
  BookOpen,
  KeyRound,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
} from "lucide-react"
import { Button, Description, Drawer, Separator } from "@workspace/ui/components/ui"
import { cn } from "@workspace/ui/lib/utils"
import rythmLogo from "@/assets/amexlogo.svg"
import { useAppShell } from "./app-shell"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/applications", label: "Applications", icon: Boxes },
  { href: "/deployments", label: "Deployments", icon: Rocket },
  { href: "/monitors", label: "Monitors", icon: Workflow },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/secrets", label: "Secrets", icon: KeyRound },
  { href: "/elf-queries", label: "ELF Queries", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/docs", label: "Documentation", icon: BookOpen },
] as const

function isLinkActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/"
  }
  return pathname.startsWith(href)
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="Main navigation">
      {navItems.map((item) => {
        const active = isLinkActive(pathname, item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-white"
                : "text-muted hover:bg-accent/10 hover:text-foreground"
            )}
          >
            <Icon className={cn("size-4 shrink-0", active ? "text-white" : "text-muted")} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function SidebarBrand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-1 px-2">
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg">
        <img src={(rythmLogo as { src: string }).src} alt="" className="size-14" />
      </span>
      <div className="min-w-0">
        <span className="font-heading block truncate text-lg font-semibold text-foreground">Rythm</span>
      </div>
    </Link>
  )
}

function SidebarFooter() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="space-y-3 border-t border-separator p-3">
      <div className="flex items-start gap-2 text-left">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <div className="min-w-0">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-foreground">
            Secrets protected
          </span>
          <Description className="mt-0.5 text-[9px] leading-snug">
            Values are masked in execution logs
          </Description>
        </div>
      </div>
      <Separator />
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-full justify-start gap-2 px-2 text-xs font-semibold text-muted"
        onPress={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        {mounted && resolvedTheme === "dark" ? (
          <>
            <Sun className="size-3.5 text-warning" />
            Light mode
          </>
        ) : (
          <>
            <Moon className="size-3.5 text-accent" />
            Dark mode
          </>
        )}
      </Button>
    </div>
  )
}

function SidebarPanel({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      <div className=" p-4">
        <SidebarBrand />
      </div>
      <SidebarNav />
      <SidebarFooter />
    </div>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const { isMobile, mobileOpen, setMobileOpen, desktopOpen } = useAppShell()

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname, setMobileOpen])

  return (
    <>
      <div
        aria-hidden
        className={cn(
          "relative hidden shrink-0 transition-[width] duration-200 ease-linear md:block",
          desktopOpen ? "w-64" : "w-0"
        )}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-20 hidden h-svh w-64 flex-col border-r border-separator bg-background transition-[transform,width] duration-200 ease-linear md:flex",
          !desktopOpen && "-translate-x-full"
        )}
        aria-hidden={!desktopOpen}
      >
        <SidebarPanel />
      </aside>

      {isMobile ? (
        <Drawer isOpen={mobileOpen} onOpenChange={setMobileOpen}>
          <Drawer.Backdrop>
            <Drawer.Content placement="left" className="w-[min(18rem,85vw)] max-w-[18rem] p-0">
              <Drawer.Dialog className="p-0">
                <Drawer.CloseTrigger />
                <SidebarPanel />
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>
      ) : null}
    </>
  )
}
