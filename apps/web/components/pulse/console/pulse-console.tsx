"use client"

import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Info,
  Plus,
  RotateCw,
  Upload,
} from "lucide-react"

import { MonitorImportExportDialog } from "@/components/pulse/monitor-import-export-dialog"
import { AlertDetail, AlertsHistory } from "@/components/pulse/alert-views"
import { PageShell } from "@/components/pulse/console-shared"
import { RunDetail } from "@/components/pulse/run-views"
import { Secrets } from "@/components/pulse/secrets-view"
import { SettingsView } from "@/components/pulse/settings-view"
import type { Monitor } from "@/lib/pulse-types"
import { applicationSLOMap } from "@/lib/pulse-slo"
import {
  AlertDialog,
  Button,
  Description,
  Input,
  Label,
  Modal,
  Table,
} from "@heroui/react"
import { cn } from "@workspace/ui/lib/utils"

import { usePulseConsoleData } from "./hooks/use-pulse-console-data"
import type { PulseConsoleProps } from "./types"
import { ApplicationDetailView } from "./views/application-detail-view"
import { ApplicationsView } from "./views/applications-view"
import { Dashboard } from "./views/dashboard-view"
import { DeploymentValidationDetailView } from "./views/deployment-validation-detail-view"
import { DeploymentsView } from "./views/deployments-view"
import { Builder } from "./views/monitor-builder-view"
import { Runs } from "./views/monitor-runs-view"
import { MonitorsListView } from "./views/monitors-list-view"

export function PulseConsole({
  view = "dashboard",
  applicationId,
  monitorId,
  runId,
  alertId,
  validationId,
}: PulseConsoleProps) {
  const { data, active, ui, actions } = usePulseConsoleData({
    applicationId,
    monitorId,
    runId,
    alertId,
    validationId,
  })

  const {
    applications,
    monitors,
    runs,
    deploymentValidations,
    secrets,
    certificateProfiles,
    alerts,
    notificationSettings,
    retentionSettings,
    sloSummary,
    filteredMonitors,
  } = data

  const {
    activeMonitor,
    activeRun,
    activeValidation,
    activeValidationRuns,
    activeApplication,
    runningApp,
    setRunningApp,
    appRunStatus,
    appRunCompleted,
  } = active

  const {
    loading,
    isImportExportOpen,
    setIsImportExportOpen,
    confirmDialog,
    setConfirmDialog,
    deleteConfirmInput,
    setDeleteConfirmInput,
    monitorsSearch,
    setMonitorsSearch,
    monitorsStatusFilter,
    setMonitorsStatusFilter,
    monitorsScheduleFilter,
    setMonitorsScheduleFilter,
  } = ui

  const {
    fetchMonitors,
    fetchRuns,
    fetchAlerts,
    fetchSingleDeploymentValidation,
    handleRunNow,
    handleRunApplication,
    handleSaveApplication,
    handleCreateDeploymentValidation,
    handleRunDeploymentValidationPost,
    handleGenerateDeploymentAIReport,
    executeToggleActive,
    executeDeleteMonitor,
    handleToggleActive,
    handleDeleteMonitor,
    handleSaveSecret,
    handleTestSecret,
    handleDeleteSecret,
    handleSaveNotificationSettings,
    handleTestNotificationSettings,
    handleSaveRetentionSettings,
    handlePurgeRetention,
    handleSaveCertificateProfile,
    handleTestCertificateProfile,
    handleDeleteCertificateProfile,
  } = actions

  if (
    loading &&
    ((applicationId && !activeApplication) ||
      (monitorId && !activeMonitor) ||
      (runId && !activeRun) ||
      (validationId && !activeValidation) ||
      (alertId && alerts.length === 0) ||
      (!applicationId && !monitorId && !runId && !validationId && !alertId))
  ) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <RotateCw className="text-primary size-8 animate-spin" />
          <p className="text-muted-foreground text-sm font-medium">Loading Pulse Console...</p>
        </div>
      </div>
    )
  }

  let viewContent: React.ReactNode

  if (view === "applications") {
    viewContent = (
      <ApplicationsView
        applications={applications}
        monitors={monitors}
        onSaveApplication={handleSaveApplication}
        onRunApplication={handleRunApplication}
        runningAppId={runningApp?.id}
      />
    )
  } else if (view === "deployments") {
    viewContent = (
      <DeploymentsView
        applications={applications}
        monitors={monitors}
        validations={deploymentValidations}
        onCreateValidation={handleCreateDeploymentValidation}
      />
    )
  } else if (view === "application-detail") {
    if (!activeApplication) {
      viewContent = (
        <PageShell eyebrow="Application" title="Application not found">
          <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
            This application group was not found.
          </div>
        </PageShell>
      )
    } else {
      viewContent = (
        <ApplicationDetailView
          application={activeApplication}
          monitors={monitors.filter((monitor) => monitor.applicationId === activeApplication.id)}
          validations={deploymentValidations.filter(
            (validation) => validation.applicationId === activeApplication.id,
          )}
          applicationSlo={applicationSLOMap(sloSummary).get(activeApplication.id)}
          onRunApplication={handleRunApplication}
          onCreateValidation={handleCreateDeploymentValidation}
          onRunNow={handleRunNow}
          onToggleActive={handleToggleActive}
          onDeleteMonitor={handleDeleteMonitor}
          onSaveApplication={handleSaveApplication}
          runningAppId={runningApp?.id}
        />
      )
    }
  } else if (view === "deployment-validation") {
    if (!activeValidation) {
      viewContent = (
        <PageShell eyebrow="Deployment" title="Validation not found">
          <div className="rounded-md border bg-card p-6 text-sm text-muted-foreground">
            This deployment validation was not found.
          </div>
        </PageShell>
      )
    } else {
      viewContent = (
        <DeploymentValidationDetailView
          validation={activeValidation}
          preRuns={activeValidationRuns.preRuns}
          postRuns={activeValidationRuns.postRuns}
          onRunPost={handleRunDeploymentValidationPost}
          onGenerateAIReport={handleGenerateDeploymentAIReport}
          onRefresh={() => fetchSingleDeploymentValidation(activeValidation.id)}
        />
      )
    }
  } else if (view === "monitors") {
    viewContent = (
      <MonitorsListView
        monitors={filteredMonitors}
        monitorsSearch={monitorsSearch}
        onMonitorsSearchChange={setMonitorsSearch}
        monitorsStatusFilter={monitorsStatusFilter}
        onMonitorsStatusFilterChange={setMonitorsStatusFilter}
        monitorsScheduleFilter={monitorsScheduleFilter}
        onMonitorsScheduleFilterChange={setMonitorsScheduleFilter}
        onImportExport={() => setIsImportExportOpen(true)}
        onRunNow={handleRunNow}
        onToggleActive={handleToggleActive}
        onDeleteMonitor={handleDeleteMonitor}
      />
    )
  } else if (view === "builder") {
    const defaultNewMonitor: Monitor = {
      id: "",
      applicationId: applications[0]?.id || "",
      name: "New API Monitor",
      description: "",
      scheduleMode: "every-5m",
      scheduleLabel: "Every 5 minutes",
      cron: "*/5 * * * *",
      timezone: "UTC",
      timeoutMs: 30000,
      retryCount: 1,
      failureThreshold: 3,
      responseBodyLimitKb: 32,
      isActive: true,
      variables: {},
      secretAliases: [],
      steps: [
        {
          id: "step-1",
          order: 1,
          name: "Fetch Health Check",
          type: "http",
          method: "GET",
          url: "https://api.example.com/health",
          timeoutMs: 10000,
          retryCount: 1,
          continueOnFailure: false,
          assertions: [
            {
              id: "assert-1",
              type: "statusCode",
              label: "Status code is 200",
              target: "status",
              operator: "equals",
              expected: "200",
            },
          ],
          extractors: [],
        },
      ],
      alertPolicy: {
        enabled: true,
        threshold: 3,
        responseTimeMs: 2000,
        email: true,
        slackWebhook: false,
        cooldownMinutes: 30,
      },
      status: "skipped",
      lastRunAt: new Date().toISOString(),
      lastDurationMs: 0,
      successRate24h: 100,
    }
    viewContent = (
      <Builder
        monitor={activeMonitor || defaultNewMonitor}
        applications={applications}
        certificateProfiles={certificateProfiles}
      />
    )
  } else if (view === "runs") {
    if (!activeMonitor) {
      viewContent = (
        <PageShell eyebrow="Run history" title="Loading...">
          <div className="text-center text-sm text-muted-foreground p-8">Monitor not found or loading...</div>
        </PageShell>
      )
    } else {
      viewContent = <Runs monitor={activeMonitor} runs={runs} onRefresh={fetchRuns} onRunNow={handleRunNow} />
    }
  } else if (view === "run-detail") {
    if (!activeRun) {
      viewContent = (
        <PageShell eyebrow="Run detail" title="Loading...">
          <div className="text-center text-sm text-muted-foreground p-8">Run not found or loading...</div>
        </PageShell>
      )
    } else {
      viewContent = <RunDetail run={activeRun} />
    }
  } else if (view === "alerts") {
    viewContent = <AlertsHistory alerts={alerts} monitors={monitors} runs={runs} />
  } else if (view === "alert-detail") {
    const activeAlert = alerts.find((alert) => alert.id === alertId)
    if (!activeAlert) {
      viewContent = (
        <PageShell eyebrow="Alert detail" title="Alert not found">
          <div className="space-y-4 rounded-md border bg-card p-6">
            <p className="text-sm text-muted-foreground">This alert event was not found in persisted alert history.</p>
            <Link
              href="/alerts"
              className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs font-semibold hover:bg-muted"
            >
              <ArrowLeft className="size-3.5" /> Back to alerts
            </Link>
          </div>
        </PageShell>
      )
    } else {
      const monitor = monitors.find((item) => item.id === activeAlert.monitorId)
      const run = activeAlert.runId ? runs.find((item) => item.id === activeAlert.runId) : undefined
      viewContent = <AlertDetail alert={activeAlert} monitor={monitor} run={run} onAlertUpdated={fetchAlerts} />
    }
  } else if (view === "secrets") {
    viewContent = <Secrets secrets={secrets} onSave={handleSaveSecret} onTest={handleTestSecret} onDelete={handleDeleteSecret} />
  } else if (view === "settings") {
    viewContent = (
      <SettingsView
        notificationSettings={notificationSettings}
        onSaveNotifications={handleSaveNotificationSettings}
        onTestNotifications={handleTestNotificationSettings}
        retentionSettings={retentionSettings}
        onSaveRetention={handleSaveRetentionSettings}
        onPurgeRetention={handlePurgeRetention}
        certificateProfiles={certificateProfiles}
        onSaveCertificateProfile={handleSaveCertificateProfile}
        onTestCertificateProfile={handleTestCertificateProfile}
        onDeleteCertificateProfile={handleDeleteCertificateProfile}
        applications={applications}
        monitors={monitors}
      />
    )
  } else {
    viewContent = (
      <Dashboard
        applications={applications}
        monitors={monitors}
        runs={runs}
        alerts={alerts}
        sloSummary={sloSummary}
        onRunNow={handleRunNow}
        onToggleActive={handleToggleActive}
        onDeleteMonitor={handleDeleteMonitor}
        onSaveApplication={handleSaveApplication}
        onRunApplication={handleRunApplication}
        runningAppId={runningApp?.id}
        onImportExport={() => setIsImportExportOpen(true)}
      />
    )
  }

  return (
    <>
      {viewContent}

      <MonitorImportExportDialog
        open={isImportExportOpen}
        onOpenChange={setIsImportExportOpen}
        mode="inventory"
        applications={applications}
        monitors={monitors}
        onSaved={() => void fetchMonitors()}
      />

      <AlertDialog.Backdrop
        isOpen={confirmDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
          }
        }}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-md">
            {({ close }) => (
              <>
                <AlertDialog.CloseTrigger />
                <AlertDialog.Header>
                  <AlertDialog.Icon status={confirmDialog.type === "delete" ? "danger" : "warning"} />
                  <AlertDialog.Heading>
                    {confirmDialog.type === "delete" ? "Delete Monitor?" : "Disable Monitor?"}
                  </AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  {confirmDialog.type === "delete" ? (
                    <div className="space-y-4 text-left">
                      <p>
                        This action is permanent. All historical run logs, step configurations, and
                        alert configurations for the monitor{" "}
                        <strong className="text-foreground">"{confirmDialog.monitorName}"</strong>{" "}
                        will be permanently deleted.
                      </p>
                      <div className="space-y-2 mt-4 text-left">
                        <Label className="text-xs font-semibold text-muted-foreground block">
                          To confirm, please type the monitor name below:
                        </Label>
                        <Input
                          placeholder={confirmDialog.monitorName}
                          value={deleteConfirmInput}
                          onChange={(event) => setDeleteConfirmInput(event.target.value)}
                          className="h-9 text-xs"
                          autoFocus
                          variant="secondary"
                        />
                      </div>
                    </div>
                  ) : (
                    <p>
                      Are you sure you want to disable checking for{" "}
                      <strong className="text-foreground">"{confirmDialog.monitorName}"</strong>? This
                      will pause all background schedules until you re-enable it.
                    </p>
                  )}
                </AlertDialog.Body>
                <AlertDialog.Footer className="border-t border-border/20 pt-3">
                  <Button slot="close" variant="tertiary" onPress={close}>
                    Cancel
                  </Button>
                  {confirmDialog.type === "delete" ? (
                    <Button
                      variant="danger"
                      isDisabled={deleteConfirmInput !== confirmDialog.monitorName}
                      onPress={async () => {
                        await executeDeleteMonitor(confirmDialog.monitorId)
                        close()
                      }}
                    >
                      Delete Monitor
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      className="bg-warning text-warning-foreground hover:bg-warning/90"
                      onPress={async () => {
                        await executeToggleActive(
                          confirmDialog.monitorId,
                          confirmDialog.currentActive ?? true,
                        )
                        close()
                      }}
                    >
                      Disable Monitor
                    </Button>
                  )}
                </AlertDialog.Footer>
              </>
            )}
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      <Modal.Backdrop isOpen={!!runningApp} onOpenChange={(open) => { if (!open) setRunningApp(null) }}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-xl">
            <Modal.Header>
              <Modal.Heading className="flex items-center gap-2 text-base font-bold">
                {appRunCompleted ? (
                  <CheckCircle2
                    className={cn(
                      "size-4",
                      Object.values(appRunStatus).some((s) => s.status === "failed") ? "text-danger" : "text-success",
                    )}
                  />
                ) : (
                  <RotateCw className="size-4 animate-spin text-accent" />
                )}
                <span>{appRunCompleted ? "Application Run Completed" : "Running Application Checks"}</span>
              </Modal.Heading>
              <Description className="text-xs">
                {appRunCompleted
                  ? `Execution reports for ${runningApp?.name} group`
                  : `Triggering background checks for ${runningApp?.name} (${runningApp?.carId})`}
              </Description>
            </Modal.Header>

            <Modal.Body className="space-y-3 py-2">
              <div className="text-xs font-semibold text-muted-foreground mb-1">Monitors in execution queue:</div>

              <div className="border border-border/40 rounded-md overflow-hidden bg-default/40 max-h-[220px] overflow-y-auto">
                <Table aria-label="Running monitors">
                  <Table.ScrollContainer>
                    <Table.Content className="min-w-[400px]">
                      <Table.Header className="bg-default/40">
                        <Table.Column isRowHeader className="text-xs w-[60%]">
                          Monitor Name
                        </Table.Column>
                        <Table.Column className="text-xs w-[20%] text-center">Status</Table.Column>
                        <Table.Column className="text-xs w-[20%] text-end pr-4">Duration</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {runningApp &&
                          monitors
                            .filter((m) => m.applicationId === runningApp.id)
                            .map((m) => {
                              const runState = appRunStatus[m.id] || { status: "queued" }
                              return (
                                <Table.Row key={m.id} id={m.id} className="hover:bg-transparent py-2.5">
                                  <Table.Cell className="align-middle text-xs font-semibold">
                                    <div>
                                      {m.name}
                                      {runState.error && (
                                        <p className="text-[10px] text-danger font-normal mt-0.5 leading-normal max-w-[320px]">
                                          {runState.error}
                                        </p>
                                      )}
                                    </div>
                                  </Table.Cell>
                                  <Table.Cell className="align-middle text-center">
                                    <span className="inline-flex items-center justify-center">
                                      {runState.status === "running" ? (
                                        <RotateCw className="size-3.5 animate-spin text-accent" />
                                      ) : runState.status === "success" ? (
                                        <CheckCircle2 className="size-4 text-success" />
                                      ) : runState.status === "failed" ? (
                                        <AlertTriangle className="size-4 text-danger" />
                                      ) : runState.status === "skipped" ? (
                                        <span className="text-[10px] text-muted-foreground bg-default/40 px-1.5 py-0.5 rounded border border-border/50">
                                          Skipped
                                        </span>
                                      ) : (
                                        <span className="size-2 rounded-full bg-muted-foreground/35 animate-pulse" />
                                      )}
                                    </span>
                                  </Table.Cell>
                                  <Table.Cell className="align-middle text-end pr-4 text-xs font-medium text-muted-foreground">
                                    {runState.durationMs !== undefined ? `${runState.durationMs}ms` : "—"}
                                  </Table.Cell>
                                </Table.Row>
                              )
                            })}
                      </Table.Body>
                    </Table.Content>
                  </Table.ScrollContainer>
                </Table>
              </div>

              {appRunCompleted && (
                <div className="mt-3 border border-border/40 bg-card p-3.5 rounded-lg space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Activity className="size-3.5 text-accent" /> Run Execution Report
                  </h3>

                  <div className="grid grid-cols-3 gap-2 text-center border-b border-border/20 pb-3">
                    <div className="bg-default/40 p-2 rounded">
                      <span className="text-[10px] text-muted-foreground block font-medium">Checks Run</span>
                      <span className="text-sm font-bold text-foreground">
                        {Object.values(appRunStatus).filter((s) => s.status !== "skipped").length}
                      </span>
                    </div>
                    <div className="bg-default/40 p-2 rounded">
                      <span className="text-[10px] text-muted-foreground block font-medium">Passed</span>
                      <span className="text-sm font-bold text-success">
                        {Object.values(appRunStatus).filter((s) => s.status === "success").length}
                      </span>
                    </div>
                    <div className="bg-default/40 p-2 rounded">
                      <span className="text-[10px] text-muted-foreground block font-medium">Failed</span>
                      <span
                        className={cn(
                          "text-sm font-bold",
                          Object.values(appRunStatus).filter((s) => s.status === "failed").length > 0
                            ? "text-danger"
                            : "text-foreground",
                        )}
                      >
                        {Object.values(appRunStatus).filter((s) => s.status === "failed").length}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1.5">
                    {(() => {
                      const activeRuns = Object.values(appRunStatus).filter(
                        (s) => s.status !== "skipped" && s.durationMs !== undefined,
                      )
                      const avg =
                        activeRuns.length > 0
                          ? Math.round(activeRuns.reduce((sum, s) => sum + (s.durationMs || 0), 0) / activeRuns.length)
                          : 0

                      const slowest = Object.entries(appRunStatus)
                        .filter(([_, s]) => s.status !== "skipped" && s.durationMs !== undefined)
                        .map(([id, s]) => {
                          const m = monitors.find((mon) => mon.id === id)
                          return { name: m?.name || "Monitor", durationMs: s.durationMs || 0 }
                        })
                        .sort((a, b) => b.durationMs - a.durationMs)[0]

                      const highLatencyChecks = Object.entries(appRunStatus)
                        .filter(([_, s]) => s.status !== "skipped" && s.durationMs !== undefined && (s.durationMs || 0) > 500)
                        .map(([id, s]) => {
                          const m = monitors.find((mon) => mon.id === id)
                          return { name: m?.name || "Monitor", durationMs: s.durationMs || 0 }
                        })

                      const failedCount = Object.values(appRunStatus).filter((s) => s.status === "failed").length

                      return (
                        <>
                          <div className="flex justify-between items-center text-muted-foreground">
                            <span>Average Response Latency:</span>
                            <span className="font-semibold text-foreground">{avg}ms</span>
                          </div>
                          {slowest && (
                            <div className="flex justify-between items-center text-muted-foreground">
                              <span>Slowest Check Run:</span>
                              <span className="font-semibold text-foreground">
                                {slowest.name} ({slowest.durationMs}ms)
                              </span>
                            </div>
                          )}

                          {highLatencyChecks.length > 0 && (
                            <div className="mt-2 bg-warning/10 border border-warning/30 p-2 rounded text-[11px] text-warning space-y-1">
                              <span className="font-bold flex items-center gap-1">
                                <AlertTriangle className="size-3" /> High Latency Warning (&gt;500ms)
                              </span>
                              <ul className="list-disc list-inside space-y-0.5">
                                {highLatencyChecks.map((c, i) => (
                                  <li key={i}>
                                    {c.name} took <span className="font-semibold">{c.durationMs}ms</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div
                            className={cn(
                              "mt-3 p-2.5 rounded-md border font-semibold text-center text-xs",
                              failedCount > 0
                                ? "bg-danger/10 border-danger/30 text-danger"
                                : "bg-success/10 border-success/30 text-success",
                            )}
                          >
                            {failedCount > 0
                              ? `⚠️ Outage Alert: ${failedCount} test check${failedCount === 1 ? "" : "s"} failed. Please check endpoint configurations.`
                              : "✅ All checks passed successfully! Application health is optimal."}
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}
            </Modal.Body>

            <Modal.Footer className="border-t border-border/20 pt-3 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Info className="size-3" /> {appRunCompleted ? "Execution complete." : "Background execution running..."}
              </p>
              <Button
                size="sm"
                onPress={() => setRunningApp(null)}
                className="h-8 text-xs cursor-pointer"
              >
                Close
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}
