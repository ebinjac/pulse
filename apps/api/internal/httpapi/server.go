package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/executor"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

type Server struct {
	store    store.Store
	executor executor.Executor
}

func NewServer(store store.Store, executor executor.Executor) *Server {
	return &Server{store: store, executor: executor}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /api/monitors", s.listMonitors)
	mux.HandleFunc("POST /api/monitors", s.createMonitor)
	mux.HandleFunc("POST /api/monitors/test", s.testMonitor)
	mux.HandleFunc("/api/monitors/", s.monitorRoutes)
	mux.HandleFunc("GET /api/runs", s.listAllRuns)
	mux.HandleFunc("/api/runs/", s.runRoutes)
	mux.HandleFunc("GET /api/secrets", s.listSecrets)
	mux.HandleFunc("POST /api/secrets", s.createSecret)
	mux.HandleFunc("/api/secrets/", s.secretRoutes)
	mux.HandleFunc("GET /api/alerts", s.listAlerts)

	return withJSON(mux)
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) listMonitors(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"monitors": s.store.ListMonitors()})
}

func (s *Server) createMonitor(w http.ResponseWriter, r *http.Request) {
	var monitor domain.Monitor
	if !decodeJSON(w, r, &monitor) {
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"monitor": s.store.UpsertMonitor(monitor)})
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

	if len(parts) == 2 && parts[1] == "run" && r.Method == http.MethodPost {
		s.runMonitor(w, monitorID)
		return
	}

	if len(parts) == 2 && parts[1] == "runs" && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{"runs": s.store.ListRuns(monitorID)})
		return
	}

	writeError(w, http.StatusNotFound, "route not found")
}

func (s *Server) getMonitor(w http.ResponseWriter, monitorID string) {
	monitor, ok := s.store.GetMonitor(monitorID)
	if !ok {
		writeError(w, http.StatusNotFound, "monitor not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"monitor": monitor})
}

func (s *Server) updateMonitor(w http.ResponseWriter, r *http.Request, monitorID string) {
	var monitor domain.Monitor
	if !decodeJSON(w, r, &monitor) {
		return
	}
	monitor.ID = monitorID

	writeJSON(w, http.StatusOK, map[string]any{"monitor": s.store.UpsertMonitor(monitor)})
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
