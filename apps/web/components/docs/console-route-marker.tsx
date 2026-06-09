"use client"

import { useEffect } from "react"
import { useAppShell } from "@/components/pulse/app-shell"

export function ConsoleRouteMarker() {
  const { setDesktopOpen } = useAppShell()

  useEffect(() => {
    document.body.dataset.rythmRoute = "console"
    document.body.classList.remove("rythm-docs-active")
    setDesktopOpen(true)

    return () => {
      if (document.body.dataset.rythmRoute === "console") {
        delete document.body.dataset.rythmRoute
      }
    }
  }, [setDesktopOpen])

  return null
}
