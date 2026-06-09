import { ConsoleRouteMarker } from "@/components/docs/console-route-marker"
import { AppShellInset, AppShellProvider } from "@/components/pulse/app-shell"
import { AppSidebar } from "@/components/pulse/app-sidebar"

export default function ConsoleLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <AppShellProvider>
      <ConsoleRouteMarker />
      <AppSidebar />
      <AppShellInset className="min-w-0">{children}</AppShellInset>
    </AppShellProvider>
  )
}
