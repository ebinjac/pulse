"use client"

import { lazy, type ReactNode } from "react"
import { SearchProvider } from "fumadocs-ui/contexts/search"

const DefaultSearchDialog = lazy(
  () => import("fumadocs-ui/components/dialog/search-default"),
)

export function DocsSearchProvider({ children }: { children: ReactNode }) {
  return (
    <SearchProvider SearchDialog={DefaultSearchDialog} options={{ api: "/api/search" }}>
      {children}
    </SearchProvider>
  )
}
