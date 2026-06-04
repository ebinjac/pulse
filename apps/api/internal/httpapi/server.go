package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/executor"
	"github.com/ensemble-pulse/pulse/apps/api/internal/jobqueue"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

type Server struct {
	store    store.Store
	executor executor.Executor
	queue    jobqueue.Queue
}

func NewServer(store store.Store, executor executor.Executor) *Server {
	return &Server{store: store, executor: executor}
}

func NewServerWithQueue(store store.Store, executor executor.Executor, queue jobqueue.Queue) *Server {
	return &Server{store: store, executor: executor, queue: queue}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /api/applications", s.listApplications)
	mux.HandleFunc("POST /api/applications", s.createApplication)
	mux.HandleFunc("/api/applications/", s.applicationRoutes)
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
	mux.HandleFunc("GET /api/metrics/slo", s.getSLOSummary)

	return withJSON(mux)
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) listMonitors(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"monitors": s.store.ListMonitors()})
}

func (s *Server) listApplications(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"applications": s.store.ListApplications()})
}

func (s *Server) createApplication(w http.ResponseWriter, r *http.Request) {
	var application domain.Application
	if !decodeJSON(w, r, &application) {
		return
	}
	if strings.TrimSpace(application.Name) == "" {
		writeError(w, http.StatusBadRequest, "application name is required")
		return
	}
	if strings.TrimSpace(application.CarID) == "" {
		writeError(w, http.StatusBadRequest, "CAR ID is required")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"application": s.store.UpsertApplication(application)})
}

func (s *Server) applicationRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/applications/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	applicationID := parts[0]

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			s.getApplication(w, applicationID)
		case http.MethodPut:
			s.updateApplication(w, r, applicationID)
		case http.MethodDelete:
			s.deleteApplication(w, applicationID)
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}

	if len(parts) == 2 && parts[1] == "monitors" && r.Method == http.MethodGet {
		if _, ok := s.store.GetApplication(applicationID); !ok {
			writeError(w, http.StatusNotFound, "application not found")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"monitors": s.store.ListMonitorsByApplication(applicationID)})
		return
	}

	if len(parts) == 2 && parts[1] == "run" && r.Method == http.MethodPost {
		s.runApplication(w, r, applicationID)
		return
	}

	writeError(w, http.StatusNotFound, "route not found")
}

func (s *Server) getApplication(w http.ResponseWriter, applicationID string) {
	application, ok := s.store.GetApplication(applicationID)
	if !ok {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"application": application})
}

func (s *Server) updateApplication(w http.ResponseWriter, r *http.Request, applicationID string) {
	var application domain.Application
	if !decodeJSON(w, r, &application) {
		return
	}
	if strings.TrimSpace(application.Name) == "" {
		writeError(w, http.StatusBadRequest, "application name is required")
		return
	}
	if strings.TrimSpace(application.CarID) == "" {
		writeError(w, http.StatusBadRequest, "CAR ID is required")
		return
	}
	application.ID = applicationID

	writeJSON(w, http.StatusOK, map[string]any{"application": s.store.UpsertApplication(application)})
}

func (s *Server) deleteApplication(w http.ResponseWriter, applicationID string) {
	if !s.store.DeleteApplication(applicationID) {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func (s *Server) runApplication(w http.ResponseWriter, r *http.Request, applicationID string) {
	application, ok := s.store.GetApplication(applicationID)
	if !ok {
		writeError(w, http.StatusNotFound, "application not found")
		return
	}

	monitors := s.store.ListMonitorsByApplication(applicationID)
	summary := domain.ApplicationRunSummary{ApplicationID: application.ID, MonitorIDs: []string{}}
	now := time.Now().UTC()
	for _, monitor := range monitors {
		if !monitor.IsActive {
			summary.Skipped++
			continue
		}

		if s.queue == nil {
			s.executor.Run(monitor)
			summary.Queued++
			summary.MonitorIDs = append(summary.MonitorIDs, monitor.ID)
			continue
		}

		enqueued, err := s.queue.EnqueueMonitorRun(r.Context(), jobqueue.MonitorRunJob{
			MonitorID:   monitor.ID,
			Trigger:     "manual",
			EnqueuedAt:  now,
			ScheduledAt: now,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to enqueue application monitor runs")
			return
		}
		if enqueued {
			summary.Queued++
			summary.MonitorIDs = append(summary.MonitorIDs, monitor.ID)
		} else {
			summary.Skipped++
		}
	}

	writeJSON(w, http.StatusAccepted, map[string]any{"application": application, "summary": summary})
}

func (s *Server) createMonitor(w http.ResponseWriter, r *http.Request) {
	var monitor domain.Monitor
	if !decodeJSON(w, r, &monitor) {
		return
	}

	published := s.store.UpsertMonitor(monitor)
	s.store.SaveMonitorDraft(published)
	if detail, ok := s.store.GetMonitorDetail(published.ID); ok {
		writeJSON(w, http.StatusCreated, map[string]any{"detail": detail})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"monitor": published})
}

func (s *Server) testMonitor(w http.ResponseWriter, r *http.Request) {
	var monitor domain.Monitor
	if !decodeJSON(w, r, &monitor) {
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"run": s.executor.Test(monitor)})
}

func (s *Server) monitorRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/monitors/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "monitor not found")
		return
	}
	monitorID := parts[0]

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			s.getMonitor(w, monitorID)
		case http.MethodPut:
			s.updateMonitor(w, r, monitorID)
		case http.MethodDelete:
			s.deleteMonitor(w, monitorID)
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}

	if s.handleMonitorSubRoute(w, r, monitorID, parts[1:]) {
		return
	}

	writeError(w, http.StatusNotFound, "route not found")
}

func (s *Server) getMonitor(w http.ResponseWriter, monitorID string) {
	detail, ok := s.store.GetMonitorDetail(monitorID)
	if !ok {
		writeError(w, http.StatusNotFound, "monitor not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"monitor":             detail.Published,
		"published":           detail.Published,
		"draft":               detail.Draft,
		"publishedVersion":    detail.PublishedVersion,
		"hasUnpublishedDraft": detail.HasUnpublishedDraft,
		"detail":              detail,
	})
}

func (s *Server) updateMonitor(w http.ResponseWriter, r *http.Request, monitorID string) {
	var monitor domain.Monitor
	if !decodeJSON(w, r, &monitor) {
		return
	}
	monitor.ID = monitorID

	publish := strings.EqualFold(r.URL.Query().Get("publish"), "true")
	if publish {
		s.store.SaveMonitorDraft(monitor)
		published, err := s.store.PublishMonitorDraft(monitorID, r.URL.Query().Get("changeNote"), r.URL.Query().Get("createdBy"))
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"monitor": published})
		return
	}

	draft := s.store.SaveMonitorDraft(monitor)
	if detail, ok := s.store.GetMonitorDetail(monitorID); ok {
		writeJSON(w, http.StatusOK, map[string]any{
			"draft":               draft,
			"monitor":             detail.Published,
			"published":           detail.Published,
			"hasUnpublishedDraft": true,
			"publishedVersion":    detail.PublishedVersion,
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"draft": draft})
}

func (s *Server) deleteMonitor(w http.ResponseWriter, monitorID string) {
	if !s.store.DeleteMonitor(monitorID) {
		writeError(w, http.StatusNotFound, "monitor not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func (s *Server) runMonitor(w http.ResponseWriter, monitorID string) {
	monitor, ok := s.store.GetMonitor(monitorID)
	if !ok {
		writeError(w, http.StatusNotFound, "monitor not found")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"run": s.executor.Run(monitor)})
}

func (s *Server) runRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/runs/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		if r.Method == http.MethodGet {
			s.listAllRuns(w, r)
			return
		}
		writeError(w, http.StatusNotFound, "run not found")
		return
	}

	run, ok := s.store.GetRun(parts[0])
	if !ok {
		writeError(w, http.StatusNotFound, "run not found")
		return
	}

	if len(parts) == 2 && parts[1] == "steps" && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{"steps": run.Steps})
		return
	}

	if len(parts) == 1 && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{"run": run})
		return
	}

	writeError(w, http.StatusNotFound, "route not found")
}

func (s *Server) listSecrets(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"secrets": s.store.ListSecrets()})
}

func (s *Server) createSecret(w http.ResponseWriter, r *http.Request) {
	secret, ok := decodeSecretPayload(w, r, "")
	if !ok {
		return
	}

	saved, err := s.store.UpsertSecret(secret)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"secret": saved})
}

func (s *Server) secretRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/secrets/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "secret not found")
		return
	}

	if len(parts) == 1 && r.Method == http.MethodPut {
		input, ok := decodeSecretPayload(w, r, parts[0])
		if !ok {
			return
		}
		if input.RawValue == "" {
			existing, exists := s.store.GetSecret(parts[0])
			if !exists {
				writeError(w, http.StatusNotFound, "secret not found")
				return
			}
			input.RawValue = existing.RawValue
		}
		saved, err := s.store.UpsertSecret(input)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"secret": saved})
		return
	}

	if len(parts) == 1 && r.Method == http.MethodDelete {
		if !s.store.DeleteSecret(parts[0]) {
			writeError(w, http.StatusNotFound, "secret not found")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}

	secret, ok := s.store.GetSecret(parts[0])
	if !ok {
		writeError(w, http.StatusNotFound, "secret not found")
		return
	}

	if len(parts) == 2 && parts[1] == "test" && r.Method == http.MethodPost {
		_, canDecrypt := s.store.GetRawSecretValue(secret.Alias)
		writeJSON(w, http.StatusOK, map[string]any{"ok": secret.IsActive && canDecrypt, "alias": secret.Alias, "provider": secret.Provider, "value": "********"})
		return
	}

	if len(parts) == 1 && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{"secret": secret})
		return
	}

	writeError(w, http.StatusNotFound, "route not found")
}

func (s *Server) listAlerts(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"alerts": s.store.ListAlerts()})
}

type notificationSettingsPayload struct {
	SMTPHost        string `json:"smtpHost"`
	SMTPPort        string `json:"smtpPort"`
	SMTPFrom        string `json:"smtpFrom"`
	SMTPTo          string `json:"smtpTo"`
	SMTPUser        string `json:"smtpUser"`
	SMTPPassword    string `json:"smtpPassword"`
	SlackWebhookURL string `json:"slackWebhookUrl"`
}

func (s *Server) getNotificationSettings(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"settings": map[string]any{
			"smtp": map[string]any{
				"addrConfigured":     s.settingConfigured("alertSmtpAddr"),
				"fromConfigured":     s.settingConfigured("alertEmailFrom"),
				"toConfigured":       s.settingConfigured("alertEmailTo"),
				"userConfigured":     s.settingConfigured("alertSmtpUser"),
				"passwordConfigured": s.settingConfigured("alertSmtpPassword"),
			},
			"slack": map[string]any{
				"webhookConfigured": s.settingConfigured("slackWebhook"),
			},
		},
	})
}

func (s *Server) updateNotificationSettings(w http.ResponseWriter, r *http.Request) {
	var payload notificationSettingsPayload
	if !decodeJSON(w, r, &payload) {
		return
	}

	if payload.SMTPHost != "" || payload.SMTPPort != "" {
		host := strings.TrimSpace(payload.SMTPHost)
		port := strings.TrimSpace(payload.SMTPPort)
		if host == "" {
			writeError(w, http.StatusBadRequest, "SMTP host is required when updating SMTP address")
			return
		}
		if port == "" {
			port = "25"
		}
		if err := s.upsertSettingSecret("notification-smtp-addr", "alertSmtpAddr", "SMTP server address", host+":"+port); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if err := s.upsertOptionalSetting("notification-email-from", "alertEmailFrom", "Alert email sender", payload.SMTPFrom); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.upsertOptionalSetting("notification-email-to", "alertEmailTo", "Alert email recipients", payload.SMTPTo); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.upsertOptionalSetting("notification-smtp-user", "alertSmtpUser", "SMTP username", payload.SMTPUser); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.upsertOptionalSetting("notification-smtp-password", "alertSmtpPassword", "SMTP password", payload.SMTPPassword); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.upsertOptionalSetting("notification-slack-webhook", "slackWebhook", "Slack incoming webhook URL", payload.SlackWebhookURL); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	s.getNotificationSettings(w, r)
}

func (s *Server) settingConfigured(alias string) bool {
	_, ok := s.store.GetRawSecretValue(alias)
	return ok
}

func (s *Server) upsertOptionalSetting(id string, alias string, name string, value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}

	return s.upsertSettingSecret(id, alias, name, value)
}

func (s *Server) upsertSettingSecret(id string, alias string, name string, value string) error {
	_, err := s.store.UpsertSecret(domain.SecretReference{
		ID:          "sec-" + id,
		Name:        name,
		Alias:       alias,
		Description: "Runtime notification setting managed from Pulse settings.",
		Provider:    "encrypted-db",
		MaskedValue: "********",
		IsActive:    true,
		RawValue:    value,
	})

	return err
}

func (s *Server) listAllRuns(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"runs": s.store.ListRuns("")})
}

func withJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return false
	}

	return true
}

type secretPayload struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Alias       string `json:"alias"`
	Provider    string `json:"provider"`
	Description string `json:"description"`
	SecretPath  string `json:"secretPath"`
	SecretKey   string `json:"secretKey"`
	Value       string `json:"value"`
	IsActive    *bool  `json:"isActive"`
}

func decodeSecretPayload(w http.ResponseWriter, r *http.Request, id string) (domain.SecretReference, bool) {
	var payload secretPayload
	if !decodeJSON(w, r, &payload) {
		return domain.SecretReference{}, false
	}
	if id != "" {
		payload.ID = id
	}
	if payload.Name == "" {
		writeError(w, http.StatusBadRequest, "secret name is required")
		return domain.SecretReference{}, false
	}
	if payload.Alias == "" {
		writeError(w, http.StatusBadRequest, "secret alias is required")
		return domain.SecretReference{}, false
	}
	if payload.Provider == "" {
		payload.Provider = "encrypted-db"
	}
	isActive := true
	if payload.IsActive != nil {
		isActive = *payload.IsActive
	}

	return domain.SecretReference{
		ID:          payload.ID,
		Name:        payload.Name,
		Alias:       payload.Alias,
		Provider:    payload.Provider,
		Description: payload.Description,
		SecretPath:  payload.SecretPath,
		SecretKey:   payload.SecretKey,
		MaskedValue: "********",
		IsActive:    isActive,
		RawValue:    payload.Value,
	}, true
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, `{"error":"failed to encode response"}`, http.StatusInternalServerError)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"error": message})
}
