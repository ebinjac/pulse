import { DocsSearchProvider } from "@/components/docs/docs-search-provider"
import { DocsStyleLoader } from "@/components/docs/docs-style-loader"
import { DocsLayout } from "fumadocs-ui/layouts/docs"
import { baseOptions } from "@/lib/layout.shared"
import { source } from "@/lib/source"

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    <>
      <DocsStyleLoader />
      <DocsSearchProvider>
        <div className="rythm-docs-root min-h-svh bg-fd-background text-fd-foreground">
          <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
            {children}
          </DocsLayout>
        </div>
      </DocsSearchProvider>
    </>
  )
}
