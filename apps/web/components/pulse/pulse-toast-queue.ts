"use client"

import { ToastQueue } from "@heroui/react"

export const pulseToastQueue = new ToastQueue({ maxVisibleToasts: 3 })

export function notifyPulseToast(
  status: "success" | "danger" | "warning" | "info",
  message: string,
  description?: string,
) {
  const variant =
    status === "success"
      ? "success"
      : status === "danger"
        ? "danger"
        : status === "warning"
          ? "warning"
          : "accent"

  pulseToastQueue.add({
    title: message,
    description,
    variant,
  })
}
