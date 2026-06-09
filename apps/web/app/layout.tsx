import "@workspace/ui/globals.css"
import "@/app/docs/docs-overrides.css"
import { PulseToastProvider } from "@/components/pulse/pulse-toast-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { bentonSans, fontMono } from "@/lib/fonts"
import { RootProvider } from "fumadocs-ui/provider/next"
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
          <RootProvider theme={{ enabled: false }} search={{ enabled: false }}>
            <PulseToastProvider>{children}</PulseToastProvider>
          </RootProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
