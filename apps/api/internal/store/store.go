package store

import "github.com/ensemble-pulse/pulse/apps/api/internal/domain"

type Store interface {
	ListMonitors() []domain.Monitor
	GetMonitor(id string) (domain.Monitor, bool)
	UpsertMonitor(monitor domain.Monitor) domain.Monitor
	DeleteMonitor(id string) bool
	SaveRun(run domain.MonitorRun)
	ListRuns(monitorID string) []domain.MonitorRun
	GetRun(id string) (domain.MonitorRun, bool)
	ListSecrets() []domain.SecretReference
	GetSecret(id string) (domain.SecretReference, bool)
	UpsertSecret(secret domain.SecretReference) (domain.SecretReference, error)
	GetRawSecretValue(alias string) (string, bool)
}
