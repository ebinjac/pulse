"use client"

import { toast } from "@workspace/ui/components/sonner"

export function notifyPulseToast(
  status: "success" | "danger" | "warning" | "info",
  message: string,
  description?: string,
) {
  const method = status === "danger" ? toast.error : status === "warning" ? toast.warning : status === "success" ? toast.success : toast.info
  method(message, { description })
}
