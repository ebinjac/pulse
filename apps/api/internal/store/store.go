package store

// Store is the composed persistence facade used by API, worker, scheduler, and executor.
// Aggregate-scoped interfaces in repos.go allow consumers to depend on narrower seams:
// scheduler/worker use MonitorRepo; executor uses RunRepo, SecretRepo, SettingsRepo; httpapi uses Store.
type Store interface {
	ApplicationRepo
	ApplicationServiceRepo
	DeploymentValidationRepo
	MonitorRepo
	RunRepo
	AlertRepo
	SettingsRepo
	ElfQueryRepo
	SecretRepo
	MetricsRepo
}
