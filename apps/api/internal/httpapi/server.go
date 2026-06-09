package httpapi

import (
	"net/http"

	"github.com/ensemble-pulse/pulse/apps/api/internal/events"
	"github.com/ensemble-pulse/pulse/apps/api/internal/executor"
	"github.com/ensemble-pulse/pulse/apps/api/internal/jobqueue"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

type Server struct {
	store    store.Store
	executor executor.Executor
	queue    jobqueue.Queue
	events   events.Bus
}

func NewServer(store store.Store, executor executor.Executor) *Server {
	return &Server{store: store, executor: executor, events: events.NoopBus{}}
}

func NewServerWithQueue(store store.Store, executor executor.Executor, queue jobqueue.Queue) *Server {
	return &Server{store: store, executor: executor, queue: queue, events: events.NoopBus{}}
}

func NewServerWithDeps(store store.Store, executor executor.Executor, queue jobqueue.Queue, bus events.Bus) *Server {
	if bus == nil {
		bus = events.NoopBus{}
	}
	return &Server{store: store, executor: executor, queue: queue, events: bus}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /api/applications", s.listApplications)
	mux.HandleFunc("POST /api/applications", s.createApplication)
	mux.HandleFunc("/api/applications/", s.applicationRoutes)
	mux.HandleFunc("GET /api/deployment-validations", s.listDeploymentValidations)
	mux.HandleFunc("POST /api/deployment-validations", s.createDeploymentValidation)
	mux.HandleFunc("/api/deployment-validations/", s.deploymentValidationRoutes)
	mux.HandleFunc("GET /api/monitors", s.listMonitors)
	mux.HandleFunc("POST /api/monitors", s.createMonitor)
	mux.HandleFunc("POST /api/monitors/test", s.testMonitor)
	s.registerMonitorVersionRoutes(mux)
	mux.HandleFunc("/api/monitors/", s.monitorRoutes)
	mux.HandleFunc("GET /api/runs", s.listAllRuns)
	mux.HandleFunc("/api/runs/", s.runRoutes)
	mux.HandleFunc("GET /api/secrets", s.listSecrets)
	mux.HandleFunc("POST /api/secrets", s.createSecret)
	mux.HandleFunc("/api/secrets/", s.secretRoutes)
	mux.HandleFunc("GET /api/alerts", s.listAlerts)
	mux.HandleFunc("/api/alerts/", s.alertRoutes)
	mux.HandleFunc("GET /api/maintenance-windows", s.maintenanceRoutes)
	mux.HandleFunc("POST /api/maintenance-windows", s.maintenanceRoutes)
	mux.HandleFunc("/api/maintenance-windows/", s.maintenanceWindowRoutes)
	mux.HandleFunc("GET /api/settings/notifications", s.getNotificationSettings)
	mux.HandleFunc("PUT /api/settings/notifications", s.updateNotificationSettings)
	mux.HandleFunc("POST /api/settings/notifications/test", s.testNotificationSettings)
	mux.HandleFunc("GET /api/settings/retention", s.getRetentionSettings)
	mux.HandleFunc("PUT /api/settings/retention", s.updateRetentionSettings)
	mux.HandleFunc("POST /api/settings/retention/purge", s.purgeRetention)
	mux.HandleFunc("GET /api/settings/elf-proxy", s.getElfProxySettings)
	mux.HandleFunc("PUT /api/settings/elf-proxy", s.updateElfProxySettings)
	mux.HandleFunc("POST /api/settings/elf-proxy/test", s.testElfProxySettings)
	mux.HandleFunc("GET /api/elf-queries", s.listElfQueries)
	mux.HandleFunc("POST /api/elf-queries", s.createElfQuery)
	mux.HandleFunc("/api/elf-queries/", s.elfQueryRoutes)
	mux.HandleFunc("GET /api/settings/certificates", s.listCertificateProfiles)
	mux.HandleFunc("POST /api/settings/certificates", s.createCertificateProfile)
	mux.HandleFunc("/api/settings/certificates/", s.certificateProfileRoutes)
	mux.HandleFunc("GET /api/metrics/slo", s.getSLOSummary)
	mux.HandleFunc("GET /api/events/stream", s.streamEvents)

	return withJSON(mux)
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

