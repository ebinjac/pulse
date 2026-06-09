"use client"

import { useEffect, useRef } from "react"
import type { PulseEvent } from "@/lib/pulse-events"

function buildStreamUrl(topics: string[]) {
  const params = new URLSearchParams({ topics: topics.join(",") })
  return `/api/events/stream?${params.toString()}`
}

export function usePulseEventStream(
  topics: string[],
  onEvent: (event: PulseEvent) => void,
  enabled = true,
) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const topicsKey = topics.filter(Boolean).join(",")

  useEffect(() => {
    if (!enabled || !topicsKey) return

    const source = new EventSource(buildStreamUrl(topicsKey.split(",")))

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as PulseEvent
        onEventRef.current(event)
      } catch {
        // ignore malformed payloads
      }
    }

    const eventTypes = [
      "validation.status_changed",
      "validation.run_linked",
      "validation.report_updated",
      "run.queued",
      "run.completed",
      "alert.created",
      "alert.acknowledged",
      "alert.resolved",
    ]

    for (const type of eventTypes) {
      source.addEventListener(type, (message) => {
        try {
          const event = JSON.parse((message as MessageEvent<string>).data) as PulseEvent
          onEventRef.current(event)
        } catch {
          // ignore malformed payloads
        }
      })
    }

    return () => {
      source.close()
    }
  }, [enabled, topicsKey])
}
