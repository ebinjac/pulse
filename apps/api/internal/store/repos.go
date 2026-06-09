package store

import (
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

// ApplicationRepo manages application aggregates.
type ApplicationRepo interface {
	ListApplications() []domain.Application
	GetApplication(id string) (domain.Application, bool)
	UpsertApplication(application domain.Application) domain.Application
	DeleteApplication(id string) bool
}

// ApplicationServiceRepo manages services scoped to an application.
type ApplicationServiceRepo interface {
	ListApplicationServices(applicationID string) []domain.ApplicationService
	GetApplicationService(id string) (domain.ApplicationService, bool)
	UpsertApplicationService(service domain.ApplicationService) domain.ApplicationService
	DeleteApplicationService(id string) bool
}

// DeploymentValidationRepo manages deployment validation workflows.
type DeploymentValidationRepo interface {
	ListDeploymentValidations(applicationID string) []domain.DeploymentValidation
	GetDeploymentValidation(id string) (domain.DeploymentValidation, bool)
	CreateDeploymentValidation(validation domain.DeploymentValidation) domain.DeploymentValidation
	UpdateDeploymentValidation(validation domain.DeploymentValidation) domain.DeploymentValidation
	DeleteDeploymentValidation(id string) bool
	LinkDeploymentValidationRun(validationID string, phase domain.DeploymentValidationPhase, monitorID string, runID string)
	ListDeploymentValidationRuns(validationID string, phase domain.DeploymentValidationPhase) []domain.MonitorRun
}

// MonitorRepo covers monitor CRUD, drafts, and version history.
type MonitorRepo interface {
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
}

// RunRepo persists monitor execution results.
type RunRepo interface {
	SaveRun(run domain.MonitorRun)
	ListRuns(monitorID string) []domain.MonitorRun
	GetRun(id string) (domain.MonitorRun, bool)
}

// AlertRepo manages alert lifecycle and maintenance windows.
type AlertRepo interface {
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
}

// SettingsRepo covers retention policy, certificate profiles, and ELF proxy settings.
type SettingsRepo interface {
	GetRetentionSettings() domain.RetentionSettings
	UpdateRetentionSettings(settings domain.RetentionSettings) domain.RetentionSettings
	PurgeExpiredRuns(retentionDays int) (int, error)
	ListCertificateProfiles() []domain.CertificateProfile
	GetCertificateProfile(id string) (domain.CertificateProfile, bool)
	UpsertCertificateProfile(profile domain.CertificateProfile) (domain.CertificateProfile, error)
	DeleteCertificateProfile(id string) bool
	GetElfProxySettings() domain.ElfProxySettings
	UpdateElfProxySettings(settings domain.ElfProxySettings) domain.ElfProxySettings
}

// ElfQueryRepo manages reusable ELF/OpenSearch query definitions.
type ElfQueryRepo interface {
	ListElfQueries(applicationID string) []domain.ElfQuery
	GetElfQuery(id string) (domain.ElfQuery, bool)
	UpsertElfQuery(query domain.ElfQuery) domain.ElfQuery
	DeleteElfQuery(id string) bool
}

// SecretRepo manages encrypted secret references.
type SecretRepo interface {
	ListSecrets() []domain.SecretReference
	GetSecret(id string) (domain.SecretReference, bool)
	UpsertSecret(secret domain.SecretReference) (domain.SecretReference, error)
	GetRawSecretValue(alias string) (string, bool)
	DeleteSecret(id string) bool
}

// MetricsRepo exposes aggregated operational metrics.
type MetricsRepo interface {
	GetSLOSummary() domain.SLOSummary
}
