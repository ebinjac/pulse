"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { formatShortDate, PageShell } from "@/components/pulse/console-shared"
import type { DeploymentValidation, MonitorRun } from "@/lib/pulse-types"
import { Tabs } from "@heroui/react"
import { DeploymentDetailActions } from "./deployment-detail-header"
import { ValidationResultPill } from "../components/validation-result-pill"
import { tabLabel } from "./deployment-overview-models"
import { DeploymentOverviewTab } from "./deployment-overview-tab"
import { DeploymentMonitorSamplesTab } from "./deployment-monitor-samples-tab"
import { DeploymentLogChecksTab } from "./deployment-log-checks-tab"
import { DeploymentReportTab } from "./deployment-report-tab"
import {
  buildPhaseRows,
  defaultTabForValidation,
  type DetailTab,
} from "./deployment-detail-utils"
import { useDeploymentCheckRunner } from "./use-deployment-check-runner"
import { usePulseEventStream } from "../hooks/use-pulse-event-stream"
import { PulseEventWaiter, topicValidation } from "@/lib/pulse-events"
const TAB_ITEMS: DetailTab[] = ["overview", "monitors", "logs", "report"]

export function DeploymentDetailView({
  validation,
  preRuns,
  postRuns,
  onRunPost,
  onRunLogCheck,
  onGenerateAIReport,
  onRefresh,
}: {
  validation: DeploymentValidation
  preRuns: MonitorRun[]
  postRuns: MonitorRun[]
  onRunPost: (validationId: string) => Promise<void>
  onRunLogCheck: (validationId: string) => Promise<void>
  onGenerateAIReport: (
    validation: DeploymentValidation,
    preRuns: MonitorRun[],
    postRuns: MonitorRun[],
  ) => Promise<DeploymentValidation | null>
  onRefresh: () => Promise<void>
}) {
  const router = useRouter()
  const report = validation.report
  const summary = report?.summary
  const deploymentTime = validation.deploymentStartedAt || validation.createdAt
  const isDraft = validation.status === "draft"
  const [activeTab, setActiveTab] = useState<DetailTab>(() =>
    defaultTabForValidation(validation, postRuns),
  )
  const [generatingAI, setGeneratingAI] = useState(false)

  const snapshotRef = useRef({ validation, postRuns })
  snapshotRef.current = { validation, postRuns }
  const eventWaiterRef = useRef(new PulseEventWaiter())

  const getSnapshot = useCallback(
    () => snapshotRef.current,
    [],
  )

  const streamActive =
    validation.status === "post_running" ||
    validation.status === "log_running" ||
    validation.status === "pre_running"

  usePulseEventStream(
    [topicValidation(validation.id)],
    (event) => {
      if (String(event.type).startsWith("validation.")) {
        void onRefresh().then(() => {
          eventWaiterRef.current.notify(event)
        })
        return
      }
      eventWaiterRef.current.notify(event)
    },
    streamActive,
  )

  const handleComplete = useCallback(() => {
    setActiveTab("report")
  }, [])

  const {
    running,
    runningMonitorsOnly,
    runningLogsOnly,
    isBusy,
    runFullCheck,
    runMonitorsOnly,
    runLogsOnly,
  } = useDeploymentCheckRunner({
    getSnapshot,
    onRunPost,
    onRunLogCheck,
    onRefresh,
    onComplete: handleComplete,
    waitUntil: async (predicate, timeoutMs) => {
      await onRefresh()
      if (predicate(getSnapshot())) return true
      return eventWaiterRef.current.waitFor(() => predicate(getSnapshot()), timeoutMs)
    },
  })

  const phases = useMemo(
    () => buildPhaseRows(validation, preRuns, postRuns),
    [validation, preRuns, postRuns],
  )
  const hasPost = postRuns.length > 0
  const canGenerateAI = Boolean(hasPost && report?.status !== "incomplete")

  useEffect(() => {
    if (!streamActive) return
    const timer = window.setInterval(() => {
      void onRefresh()
    }, 30000)
    return () => window.clearInterval(timer)
  }, [streamActive, onRefresh])

  async function generateAIReport() {
    if (!report || report.status === "incomplete" || generatingAI) return
    setGeneratingAI(true)
    try {
      await onGenerateAIReport(validation, preRuns, postRuns)
      await onRefresh()
      setActiveTab("report")
    } finally {
      setGeneratingAI(false)
    }
  }

  return (
    <PageShell
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{validation.name}</span>
          <ValidationResultPill status={report?.status || "incomplete"} />
        </span>
      }
      description={[
        `CAR ${validation.carId}`,
        validation.environment,
        formatShortDate(deploymentTime),
      ]
        .filter(Boolean)
        .join(" · ")}
      action={
        <DeploymentDetailActions
          validation={validation}
          isDraft={isDraft}
          isBusy={isBusy}
          running={running}
          runningMonitorsOnly={runningMonitorsOnly}
          runningLogsOnly={runningLogsOnly}
          generatingAI={generatingAI}
          canGenerateAI={canGenerateAI}
          onRunFullCheck={() => {
            setActiveTab("monitors")
            void runFullCheck()
          }}
          onRunMonitorsOnly={() => {
            setActiveTab("monitors")
            void runMonitorsOnly()
          }}
          onRunLogsOnly={() => {
            setActiveTab("logs")
            void runLogsOnly()
          }}
          onGenerateAIReport={() => void generateAIReport()}
          onNavigate={(path) => router.push(path)}
        />
      }
    >
      <div className="space-y-6">
        <Tabs
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(String(key) as DetailTab)}
          variant="secondary"
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="Deployment check sections" >
              {TAB_ITEMS.map((tab) => (
                <Tabs.Tab key={tab} id={tab}>
                  <span className="text-xs font-semibold">
                    {tabLabel(tab, validation, report, phases)}
                  </span>
                  <Tabs.Indicator className="bg-primary" />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="overview" className="w-full min-w-0 pt-4">
            <DeploymentOverviewTab
              validation={validation}
              phases={phases}
              summary={summary}
              preRuns={preRuns}
              postRuns={postRuns}
            />
          </Tabs.Panel>

          <Tabs.Panel id="monitors" className="w-full min-w-0 pt-4">
            <DeploymentMonitorSamplesTab
              validation={validation}
              preRuns={preRuns}
              postRuns={postRuns}
            />
          </Tabs.Panel>

          <Tabs.Panel id="logs" className="w-full min-w-0 pt-4">
            <DeploymentLogChecksTab validation={validation} report={report} />
          </Tabs.Panel>

          <Tabs.Panel id="report" className="w-full min-w-0 pt-4">
            <DeploymentReportTab
              validation={validation}
              generatingAI={generatingAI}
              canGenerateAI={canGenerateAI}
              onGenerateAIReport={generateAIReport}
            />
          </Tabs.Panel>
        </Tabs>
      </div>
    </PageShell>
  )
}

