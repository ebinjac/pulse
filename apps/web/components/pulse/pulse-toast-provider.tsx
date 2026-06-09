"use client"

import { Toast } from "@heroui/react"
import { pulseToastQueue } from "@/components/pulse/pulse-toast-queue"

export function PulseToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toast.Provider placement="bottom end" queue={pulseToastQueue} />
    </>
  )
}
