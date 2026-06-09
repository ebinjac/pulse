package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/events"
)


func (s *Server) listAlerts(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"alerts": s.store.ListAlerts()})
}

func (s *Server) alertRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/alerts/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "alert not found")
		return
	}
	alertID := parts[0]

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			s.getAlert(w, alertID)
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}

	switch parts[1] {
	case "acknowledge":
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		s.acknowledgeAlert(w, r, alertID)
	case "snooze":
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		s.snoozeAlert(w, r, alertID)
	default:
		writeError(w, http.StatusNotFound, "alert action not found")
	}
}

func (s *Server) getAlert(w http.ResponseWriter, alertID string) {
	alert, ok := s.store.GetAlert(alertID)
	if !ok {
		writeError(w, http.StatusNotFound, "alert not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"alert": alert})
}

func (s *Server) acknowledgeAlert(w http.ResponseWriter, r *http.Request, alertID string) {
	payload := struct {
		AcknowledgedBy string `json:"acknowledgedBy"`
	}{AcknowledgedBy: "operator"}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil && err != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if strings.TrimSpace(payload.AcknowledgedBy) == "" {
		payload.AcknowledgedBy = "operator"
	}
	alert, ok := s.store.AcknowledgeAlert(alertID, strings.TrimSpace(payload.AcknowledgedBy))
	if !ok {
		writeError(w, http.StatusNotFound, "alert not found")
		return
	}
	events.PublishAlertAcknowledged(s.events, alert)
	writeJSON(w, http.StatusOK, map[string]any{"alert": alert})
}

func (s *Server) snoozeAlert(w http.ResponseWriter, r *http.Request, alertID string) {
	var payload struct {
		Until             string `json:"until"`
		DurationMinutes   int    `json:"durationMinutes"`
		Reason            string `json:"reason"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}

	until := time.Now().UTC()
	if strings.TrimSpace(payload.Until) != "" {
		parsed, err := time.Parse(time.RFC3339, payload.Until)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid until timestamp; use RFC3339")
			return
		}
		until = parsed.UTC()
	} else if payload.DurationMinutes > 0 {
		until = until.Add(time.Duration(payload.DurationMinutes) * time.Minute)
	} else {
		until = until.Add(2 * time.Hour)
	}

	reason := strings.TrimSpace(payload.Reason)
	if reason == "" {
		reason = "snoozed by operator"
	}

	alert, ok := s.store.SnoozeAlert(alertID, until, reason)
	if !ok {
		writeError(w, http.StatusNotFound, "alert not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"alert": alert})
}

func (s *Server) maintenanceRoutes(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		activeOnly := r.URL.Query().Get("active") == "true"
		writeJSON(w, http.StatusOK, map[string]any{"windows": s.store.ListMaintenanceWindows(activeOnly)})
	case http.MethodPost:
		var window domain.MaintenanceWindow
		if !decodeJSON(w, r, &window) {
			return
		}
		if strings.TrimSpace(window.ScopeType) == "" {
			writeError(w, http.StatusBadRequest, "scopeType is required")
			return
		}
		if window.EndsAt.IsZero() {
			writeError(w, http.StatusBadRequest, "endsAt is required")
			return
		}
		if window.StartsAt.IsZero() {
			window.StartsAt = time.Now().UTC()
		}
		writeJSON(w, http.StatusCreated, map[string]any{"window": s.store.CreateMaintenanceWindow(window)})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) maintenanceWindowRoutes(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/maintenance-windows/")
	id = strings.Trim(id, "/")
	if id == "" {
		writeError(w, http.StatusNotFound, "maintenance window not found")
		return
	}
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !s.store.DeleteMaintenanceWindow(id) {
		writeError(w, http.StatusNotFound, "maintenance window not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
