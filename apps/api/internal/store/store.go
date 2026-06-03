package store

import (
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type Store interface {
	ListMonitors() []domain.Monitor
	GetMonitor(id string) (domain.Monitor, bool)
	UpsertMonitor(monitor domain.Monitor) domain.Monitor
	DeleteMonitor(id string) bool
	SaveRun(run domain.MonitorRun)
	ListRuns(monitorID string) []domain.MonitorRun
	GetRun(id string) (domain.MonitorRun, bool)
	ListAlerts() []domain.AlertEvent
	GetOpenAlert(monitorID string) (domain.AlertEvent, bool)
	SaveAlert(alert domain.AlertEvent)
	ResolveOpenAlerts(monitorID string, resolvedAt time.Time) int
	ListSecrets() []domain.SecretReference
	GetSecret(id string) (domain.SecretReference, bool)
	UpsertSecret(secret domain.SecretReference) (domain.SecretReference, error)
	GetRawSecretValue(alias string) (string, bool)
}
