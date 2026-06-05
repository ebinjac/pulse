import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AppShellInset, AppShellProvider } from "@/components/pulse/app-shell"
import { AppSidebar } from "@/components/pulse/app-sidebar"
import { bentonSans, fontMono } from "@/lib/fonts"
import { cn } from "@workspace/ui/lib/utils"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans antialiased", bentonSans.variable, fontMono.variable)}
    >
      <body>
        <ThemeProvider>
          <AppShellProvider>
            <AppSidebar />
            <AppShellInset className="min-w-0">{children}</AppShellInset>
          </AppShellProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
