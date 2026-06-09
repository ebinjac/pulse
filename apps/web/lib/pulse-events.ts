import type { AlertEvent } from "./pulse-types"

export const PULSE_EVENT_TYPES = {
  validationStatusChanged: "validation.status_changed",
  validationRunLinked: "validation.run_linked",
  validationReportUpdated: "validation.report_updated",
  runQueued: "run.queued",
  runCompleted: "run.completed",
  alertCreated: "alert.created",
  alertAcknowledged: "alert.acknowledged",
  alertResolved: "alert.resolved",
} as const

export type PulseEventType = (typeof PULSE_EVENT_TYPES)[keyof typeof PULSE_EVENT_TYPES]

export interface PulseEvent<T = unknown> {
  id: string
  type: PulseEventType | string
  topic: string
  timestamp: string
  data: T
}

export interface ValidationStatusChangedData {
  validationId: string
  status: string
}

export interface ValidationRunLinkedData {
  validationId: string
  phase: string
  monitorId: string
  runId: string
  runStatus: string
}

export interface RunBatchEventData {
  applicationId: string
  batchId: string
  monitorId: string
  runId?: string
  status?: string
  durationMs?: number
  failureReason?: string
}

export interface AlertEventData {
  alert: AlertEvent
}

export interface AlertResolvedData {
  monitorId: string
  resolvedAt: string
}

export function topicValidation(validationId: string) {
  return `validation:${validationId}`
}

export function topicApplicationRunBatch(applicationId: string, batchId: string) {
  return `application:${applicationId}:run-batch:${batchId}`
}

export function topicAlerts() {
  return "alerts"
}

export class PulseEventWaiter {
  private listeners = new Set<(event: PulseEvent) => void>()

  notify(event: PulseEvent) {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  waitFor(
    predicate: (event: PulseEvent) => boolean,
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.listeners.delete(listener)
        resolve(false)
      }, timeoutMs)

      const listener = (event: PulseEvent) => {
        if (!predicate(event)) return
        window.clearTimeout(timer)
        this.listeners.delete(listener)
        resolve(true)
      }

      this.listeners.add(listener)
    })
  }
}
