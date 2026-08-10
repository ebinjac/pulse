"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { PanelLeft } from "lucide-react"
import { Button } from "@workspace/ui/components/ui"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"

type AppShellContextValue = {
  isMobile: boolean
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  desktopOpen: boolean
  setDesktopOpen: (open: boolean) => void
  toggleSidebar: () => void
}

const AppShellContext = createContext<AppShellContextValue | null>(null)

export function useAppShell() {
  const context = useContext(AppShellContext)
  if (!context) {
    throw new Error("useAppShell must be used within AppShellProvider.")
  }
  return context
}

export function AppShellProvider({
  children,
  defaultDesktopOpen = true,
}: {
  children: ReactNode
  defaultDesktopOpen?: boolean
}) {
  const isMobile = useIsMobile()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(defaultDesktopOpen)

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen((open) => !open)
      return
    }
    setDesktopOpen((open) => !open)
  }, [isMobile])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "b" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  const value = useMemo(
    () => ({
      isMobile,
      mobileOpen,
      setMobileOpen,
      desktopOpen,
      setDesktopOpen,
      toggleSidebar,
    }),
    [isMobile, mobileOpen, desktopOpen, toggleSidebar]
  )

  return (
    <AppShellContext.Provider value={value}>
      <div className="flex h-svh w-full overflow-hidden">{children}</div>
    </AppShellContext.Provider>
  )
}

export function AppShellInset({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <main className={cn("relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background", className)}>
      {children}
    </main>
  )
}

export function AppShellTrigger({ className }: { className?: string }) {
  const { toggleSidebar } = useAppShell()

  return (
    <Button
      variant="ghost"
      size="sm"
      isIconOnly
      aria-label="Toggle navigation"
      className={cn("shrink-0", className)}
      onPress={toggleSidebar}
    >
      <PanelLeft className="size-4" />
    </Button>
  )
}
