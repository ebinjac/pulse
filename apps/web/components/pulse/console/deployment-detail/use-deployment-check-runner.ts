"use client"

import { useCallback, useState } from "react"
import type { DeploymentValidation, MonitorRun } from "@/lib/pulse-types"
import { notifyPulseToast } from "@/components/pulse/pulse-toast-queue"
import {
  estimatePollTimeoutMs,
  postRunsComplete,
  shouldRunLogs,
} from "./deployment-detail-utils"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function useDeploymentCheckRunner({
  getSnapshot,
  onRunPost,
  onRunLogCheck,
  onRefresh,
  onComplete,
  waitUntil,
}: {
  getSnapshot: () => { validation: DeploymentValidation; postRuns: MonitorRun[] }
  onRunPost: (validationId: string) => Promise<void>
  onRunLogCheck: (validationId: string) => Promise<void>
  onRefresh: () => Promise<void>
  onComplete?: () => void
  waitUntil?: (
    predicate: (snapshot: { validation: DeploymentValidation; postRuns: MonitorRun[] }) => boolean,
    timeoutMs: number,
  ) => Promise<boolean>
}) {
  const [running, setRunning] = useState(false)
  const [runningMonitorsOnly, setRunningMonitorsOnly] = useState(false)
  const [runningLogsOnly, setRunningLogsOnly] = useState(false)

  const pollUntil = useCallback(
    async (
      predicate: (snapshot: { validation: DeploymentValidation; postRuns: MonitorRun[] }) => boolean,
      options: { intervalMs?: number; timeoutMs?: number; label?: string } = {},
    ) => {
      const { validation } = getSnapshot()
      const intervalMs = options.intervalMs ?? 5000
      const timeoutMs = options.timeoutMs ?? estimatePollTimeoutMs(validation)

      if (waitUntil) {
        const matched = await waitUntil(predicate, timeoutMs)
        if (matched) return true
      } else {
        const started = Date.now()
        while (Date.now() - started < timeoutMs) {
          await onRefresh()
          const snapshot = getSnapshot()
          if (predicate(snapshot)) return true
          await sleep(intervalMs)
        }
      }

      notifyPulseToast(
        "warning",
        options.label || "Still running",
        "This is taking longer than expected. The page will keep refreshing.",
      )
      return false
    },
    [getSnapshot, onRefresh, waitUntil],
  )

  const runMonitorsOnly = useCallback(async () => {
    const { validation } = getSnapshot()
    if (running || runningMonitorsOnly) return
    setRunningMonitorsOnly(true)
    try {
      await onRunPost(validation.id)
      await onRefresh()
      notifyPulseToast("success", "Post-deploy sampling started")
    } catch (err) {
      notifyPulseToast(
        "danger",
        "Failed to start post samples",
        err instanceof Error ? err.message : "Please try again.",
      )
    } finally {
      setRunningMonitorsOnly(false)
    }
  }, [running, runningMonitorsOnly, getSnapshot, onRunPost, onRefresh])

  const runLogsOnly = useCallback(async () => {
    const { validation } = getSnapshot()
    if (running || runningLogsOnly) return
    setRunningLogsOnly(true)
    try {
      await onRunLogCheck(validation.id)
      await onRefresh()
      notifyPulseToast("success", "Log checks started")
    } catch (err) {
      notifyPulseToast(
        "danger",
        "Failed to start log checks",
        err instanceof Error ? err.message : "Please try again.",
      )
    } finally {
      setRunningLogsOnly(false)
    }
  }, [running, runningLogsOnly, getSnapshot, onRunLogCheck, onRefresh])

  const runFullCheck = useCallback(async () => {
    const { validation } = getSnapshot()
    if (running) return
    setRunning(true)
    try {
      await onRunPost(validation.id)
      await onRefresh()

      await pollUntil(
        ({ validation: v, postRuns }) =>
          v.status !== "post_running" && postRunsComplete(v, postRuns),
        { label: "Post-deploy sampling" },
      )

      const afterPost = getSnapshot()
      if (shouldRunLogs(afterPost.validation)) {
        await onRunLogCheck(afterPost.validation.id)
        await onRefresh()

        await pollUntil(
          ({ validation: v }) => v.status !== "log_running",
          {
            label: "Log checks",
            timeoutMs: Math.max(120_000, estimatePollTimeoutMs(afterPost.validation) / 2),
          },
        )
      }

      await onRefresh()
      notifyPulseToast("success", "Deployment check complete", "Review the report for results.")
      onComplete?.()
    } catch (err) {
      notifyPulseToast(
        "danger",
        "Deployment check failed",
        err instanceof Error ? err.message : "Please try again.",
      )
    } finally {
      setRunning(false)
    }
  }, [running, getSnapshot, onRunPost, onRunLogCheck, onRefresh, onComplete, pollUntil])

  const { validation } = getSnapshot()
  const isBusy =
    running ||
    runningMonitorsOnly ||
    runningLogsOnly ||
    validation.status === "post_running" ||
    validation.status === "log_running"

  return {
    running,
    runningMonitorsOnly,
    runningLogsOnly,
    isBusy,
    runFullCheck,
    runMonitorsOnly,
    runLogsOnly,
  }
}
