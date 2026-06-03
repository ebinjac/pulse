package store

import (
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type Store interface {
	ListApplications() []domain.Application
	GetApplication(id string) (domain.Application, bool)
	UpsertApplication(application domain.Application) domain.Application
	DeleteApplication(id string) bool
	ListMonitors() []domain.Monitor
	ListMonitorsByApplication(applicationID string) []domain.Monitor
	GetMonitor(id string) (domain.Monitor, bool)
	GetMonitorDetail(id string) (domain.MonitorDetail, bool)
	UpsertMonitor(monitor domain.Monitor) domain.Monitor
	SaveMonitorDraft(monitor domain.Monitor) domain.Monitor
	GetMonitorDraft(id string) (domain.Monitor, bool)
	DiscardMonitorDraft(id string) (domain.Monitor, bool)
	PublishMonitorDraft(id string, changeNote string, createdBy string) (domain.Monitor, error)
	ListMonitorVersions(id string) []domain.MonitorVersionSummary
	GetMonitorVersion(id string, versionNumber int) (domain.MonitorVersion, bool)
	RollbackMonitorVersion(id string, versionNumber int, changeNote string, createdBy string) (domain.Monitor, error)
	DeleteMonitor(id string) bool
	SaveRun(run domain.MonitorRun)
	ListRuns(monitorID string) []domain.MonitorRun
	GetRun(id string) (domain.MonitorRun, bool)
	ListAlerts() []domain.AlertEvent
	GetAlert(id string) (domain.AlertEvent, bool)
	GetOpenAlert(monitorID string) (domain.AlertEvent, bool)
	SaveAlert(alert domain.AlertEvent)
	AcknowledgeAlert(id string, acknowledgedBy string) (domain.AlertEvent, bool)
	SnoozeAlert(id string, until time.Time, reason string) (domain.AlertEvent, bool)
	ResolveOpenAlerts(monitorID string, resolvedAt time.Time) int
	ListMaintenanceWindows(activeOnly bool) []domain.MaintenanceWindow
	CreateMaintenanceWindow(window domain.MaintenanceWindow) domain.MaintenanceWindow
	DeleteMaintenanceWindow(id string) bool
	IsUnderMaintenance(monitorID, applicationID string, at time.Time) (reason string, active bool)
	ListSecrets() []domain.SecretReference
	GetSecret(id string) (domain.SecretReference, bool)
	UpsertSecret(secret domain.SecretReference) (domain.SecretReference, error)
	GetRawSecretValue(alias string) (string, bool)
	DeleteSecret(id string) bool
}
