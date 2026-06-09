"use client"

import { useEffect } from "react"

const FUMADOCS_STYLE_ID = "rythm-fumadocs-styles"

export function DocsStyleLoader() {
  useEffect(() => {
    document.body.classList.add("rythm-docs-active")
    document.body.dataset.rythmRoute = "docs"

    let link = document.getElementById(FUMADOCS_STYLE_ID) as HTMLLinkElement | null
    if (!link) {
      link = document.createElement("link")
      link.id = FUMADOCS_STYLE_ID
      link.rel = "stylesheet"
      link.href = "/fumadocs-ui.css"
      document.head.appendChild(link)
    }

    return () => {
      document.body.classList.remove("rythm-docs-active")
      if (document.body.dataset.rythmRoute === "docs") {
        delete document.body.dataset.rythmRoute
      }
      document.getElementById(FUMADOCS_STYLE_ID)?.remove()
    }
  }, [])

  return null
}
