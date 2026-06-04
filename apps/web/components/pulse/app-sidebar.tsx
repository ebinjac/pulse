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
  KeyRound,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupContent,
} from "@workspace/ui/components/sidebar"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/applications", label: "Applications", icon: Boxes },
  { href: "/deployments", label: "Deployments", icon: Rocket },
  { href: "/monitors", label: "Monitors", icon: Workflow },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/secrets", label: "Secrets", icon: KeyRound },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isLinkActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname === "/"
    }
    return pathname.startsWith(href)
  }

  return (
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
                  <SidebarMenuButton 
                    render={<Link href={item.href} />}
                    isActive={isLinkActive(item.href)}
                  >
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
  )
}
