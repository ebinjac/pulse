"use client"

import { Toaster } from "@workspace/ui/components/sonner"

export function PulseToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="bottom-right" richColors closeButton />
    </>
  )
}
