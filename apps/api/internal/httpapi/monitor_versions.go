package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type publishMonitorRequest struct {
	ChangeNote string `json:"changeNote"`
	CreatedBy  string `json:"createdBy"`
}

type rollbackMonitorRequest struct {
	ChangeNote string `json:"changeNote"`
	CreatedBy  string `json:"createdBy"`
}

func (s *Server) registerMonitorVersionRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/monitors/{monitorID}/versions", func(w http.ResponseWriter, r *http.Request) {
		s.handleMonitorVersionRoutes(w, r, r.PathValue("monitorID"), nil)
	})
	mux.HandleFunc("GET /api/monitors/{monitorID}/versions/{versionNumber}", func(w http.ResponseWriter, r *http.Request) {
		s.handleMonitorVersionRoutes(w, r, r.PathValue("monitorID"), []string{r.PathValue("versionNumber")})
	})
	mux.HandleFunc("GET /api/monitors/{monitorID}/versions/{versionNumber}/diff", func(w http.ResponseWriter, r *http.Request) {
		versionNumber, err := strconv.Atoi(r.PathValue("versionNumber"))
		if err != nil || versionNumber <= 0 {
			writeError(w, http.StatusBadRequest, "invalid version number")
			return
		}
		s.diffMonitorVersion(w, r, r.PathValue("monitorID"), versionNumber)
	})
	mux.HandleFunc("POST /api/monitors/{monitorID}/versions/{versionNumber}/rollback", func(w http.ResponseWriter, r *http.Request) {
		versionNumber, err := strconv.Atoi(r.PathValue("versionNumber"))
		if err != nil || versionNumber <= 0 {
			writeError(w, http.StatusBadRequest, "invalid version number")
			return
		}
		var body rollbackMonitorRequest
		_ = json.NewDecoder(r.Body).Decode(&body)
		monitor, err := s.store.RollbackMonitorVersion(r.PathValue("monitorID"), versionNumber, body.ChangeNote, body.CreatedBy)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"monitor": monitor})
	})
}

func (s *Server) handleMonitorSubRoute(w http.ResponseWriter, r *http.Request, monitorID string, parts []string) bool {
	if len(parts) == 0 {
		return false
	}

	switch parts[0] {
	case "draft":
		return s.handleMonitorDraftRoutes(w, r, monitorID, parts[1:])
	case "publish":
		if len(parts) == 1 && r.Method == http.MethodPost {
			s.publishMonitor(w, r, monitorID)
			return true
		}
	case "versions":
		return s.handleMonitorVersionRoutes(w, r, monitorID, parts[1:])
	case "run":
		if len(parts) == 2 && parts[1] == "draft" && r.Method == http.MethodPost {
			s.runMonitorDraft(w, r, monitorID)
			return true
		}
		if len(parts) == 1 && r.Method == http.MethodPost {
			s.runMonitor(w, monitorID)
			return true
		}
	case "runs":
		if len(parts) == 1 && r.Method == http.MethodGet {
			writeJSON(w, http.StatusOK, map[string]any{"runs": s.store.ListRuns(monitorID)})
			return true
		}
	}

	return false
}

func (s *Server) handleMonitorDraftRoutes(w http.ResponseWriter, r *http.Request, monitorID string, parts []string) bool {
	if len(parts) == 0 {
		switch r.Method {
		case http.MethodGet:
			draft, ok := s.store.GetMonitorDraft(monitorID)
			if !ok {
				writeError(w, http.StatusNotFound, "monitor not found")
				return true
			}
			writeJSON(w, http.StatusOK, map[string]any{"draft": draft})
			return true
		case http.MethodPut:
			var monitor domain.Monitor
			if !decodeJSON(w, r, &monitor) {
				return true
			}
			monitor.ID = monitorID
			writeJSON(w, http.StatusOK, map[string]any{"draft": s.store.SaveMonitorDraft(monitor)})
			return true
		}
		return false
	}

	if len(parts) == 1 && parts[0] == "discard" && r.Method == http.MethodPost {
		draft, ok := s.store.DiscardMonitorDraft(monitorID)
		if !ok {
			writeError(w, http.StatusNotFound, "monitor not found")
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"draft": draft, "discarded": true})
		return true
	}

	return false
}

func (s *Server) handleMonitorVersionRoutes(w http.ResponseWriter, r *http.Request, monitorID string, parts []string) bool {
	if len(parts) == 0 && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{"versions": s.store.ListMonitorVersions(monitorID)})
		return true
	}

	if len(parts) == 1 && r.Method == http.MethodGet {
		versionNumber, err := strconv.Atoi(parts[0])
		if err != nil || versionNumber <= 0 {
			writeError(w, http.StatusBadRequest, "invalid version number")
			return true
		}
		version, ok := s.store.GetMonitorVersion(monitorID, versionNumber)
		if !ok {
			writeError(w, http.StatusNotFound, "version not found")
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"version": version})
		return true
	}

	if len(parts) == 2 && parts[1] == "rollback" && r.Method == http.MethodPost {
		versionNumber, err := strconv.Atoi(parts[0])
		if err != nil || versionNumber <= 0 {
			writeError(w, http.StatusBadRequest, "invalid version number")
			return true
		}
		var body rollbackMonitorRequest
		_ = json.NewDecoder(r.Body).Decode(&body)
		monitor, err := s.store.RollbackMonitorVersion(monitorID, versionNumber, body.ChangeNote, body.CreatedBy)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"monitor": monitor})
		return true
	}

	if len(parts) == 2 && parts[1] == "diff" && r.Method == http.MethodGet {
		versionNumber, err := strconv.Atoi(parts[0])
		if err != nil || versionNumber <= 0 {
			writeError(w, http.StatusBadRequest, "invalid version number")
			return true
		}
		s.diffMonitorVersion(w, r, monitorID, versionNumber)
		return true
	}

	return false
}

func (s *Server) publishMonitor(w http.ResponseWriter, r *http.Request, monitorID string) {
	var body publishMonitorRequest
	_ = json.NewDecoder(r.Body).Decode(&body)

	monitor, err := s.store.PublishMonitorDraft(monitorID, body.ChangeNote, body.CreatedBy)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"monitor": monitor})
}

func (s *Server) runMonitorDraft(w http.ResponseWriter, r *http.Request, monitorID string) {
	draft, ok := s.store.GetMonitorDraft(monitorID)
	if !ok {
		writeError(w, http.StatusNotFound, "monitor not found")
		return
	}

	if r.ContentLength > 0 {
		var override domain.Monitor
		if !decodeJSON(w, r, &override) {
			return
		}
		override.ID = monitorID
		draft = mergeMonitorDraft(draft, override)
	}

	writeJSON(w, http.StatusCreated, map[string]any{"run": s.executor.RunDraft(draft)})
}

func (s *Server) diffMonitorVersion(w http.ResponseWriter, r *http.Request, monitorID string, versionNumber int) {
	version, ok := s.store.GetMonitorVersion(monitorID, versionNumber)
	if !ok {
		writeError(w, http.StatusNotFound, "version not found")
		return
	}

	against := strings.TrimSpace(r.URL.Query().Get("against"))
	var base domain.Monitor
	switch against {
	case "draft":
		draft, ok := s.store.GetMonitorDraft(monitorID)
		if !ok {
			writeError(w, http.StatusNotFound, "monitor not found")
			return
		}
		base = draft
	case "", "published":
		published, ok := s.store.GetMonitor(monitorID)
		if !ok {
			writeError(w, http.StatusNotFound, "monitor not found")
			return
		}
		base = published
	default:
		againstVersion, err := strconv.Atoi(against)
		if err != nil || againstVersion <= 0 {
			writeError(w, http.StatusBadRequest, "against must be published, draft, or a version number")
			return
		}
		other, ok := s.store.GetMonitorVersion(monitorID, againstVersion)
		if !ok {
			writeError(w, http.StatusNotFound, "comparison version not found")
			return
		}
		base = other.Config
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"from":    monitorDiffLabel(base, against),
		"to":      monitorDiffLabel(version.Config, strconv.Itoa(versionNumber)),
		"changes": diffMonitors(base, version.Config),
	})
}

func mergeMonitorDraft(base domain.Monitor, override domain.Monitor) domain.Monitor {
	merged := base
	if override.Name != "" {
		merged.Name = override.Name
	}
	if override.Description != "" {
		merged.Description = override.Description
	}
	if override.ApplicationID != "" {
		merged.ApplicationID = override.ApplicationID
	}
	if override.ScheduleMode != "" {
		merged.ScheduleMode = override.ScheduleMode
	}
	if override.ScheduleLabel != "" {
		merged.ScheduleLabel = override.ScheduleLabel
	}
	if override.Cron != "" {
		merged.Cron = override.Cron
		merged.ScheduleCron = override.Cron
	}
	if override.Timezone != "" {
		merged.Timezone = override.Timezone
	}
	if override.TimeoutMS > 0 {
		merged.TimeoutMS = override.TimeoutMS
	}
	if override.Variables != nil {
		merged.Variables = override.Variables
	}
	if override.SecretAliases != nil {
		merged.SecretAliases = override.SecretAliases
	}
	if override.Steps != nil {
		merged.Steps = override.Steps
	}
	if override.AlertPolicy.Threshold > 0 || override.AlertPolicy.Enabled {
		merged.AlertPolicy = override.AlertPolicy
	}
	merged.IsActive = override.IsActive
	merged.AlertEnabled = override.AlertEnabled
	return merged
}

func monitorDiffLabel(monitor domain.Monitor, label string) map[string]string {
	if label == "" {
		label = monitor.Name
	}
	return map[string]string{
		"label": label,
		"name":  monitor.Name,
	}
}

func diffMonitors(before domain.Monitor, after domain.Monitor) []map[string]any {
	changes := make([]map[string]any, 0)

	appendChange := func(path string, oldValue any, newValue any) {
		if jsonEqual(oldValue, newValue) {
			return
		}
		changes = append(changes, map[string]any{
			"path":     path,
			"oldValue": oldValue,
			"newValue": newValue,
		})
	}

	appendChange("name", before.Name, after.Name)
	appendChange("description", before.Description, after.Description)
	appendChange("applicationId", before.ApplicationID, after.ApplicationID)
	appendChange("scheduleMode", before.ScheduleMode, after.ScheduleMode)
	appendChange("cron", before.Cron, after.Cron)
	appendChange("timezone", before.Timezone, after.Timezone)
	appendChange("timeoutMs", before.TimeoutMS, after.TimeoutMS)
	appendChange("retryCount", before.RetryCount, after.RetryCount)
	appendChange("failureThreshold", before.FailureThreshold, after.FailureThreshold)
	appendChange("isActive", before.IsActive, after.IsActive)
	appendChange("variables", before.Variables, after.Variables)
	appendChange("secretAliases", before.SecretAliases, after.SecretAliases)
	appendChange("alertPolicy", before.AlertPolicy, after.AlertPolicy)
	appendChange("steps", before.Steps, after.Steps)

	return changes
}

func jsonEqual(left any, right any) bool {
	leftJSON, err := json.Marshal(left)
	if err != nil {
		return false
	}
	rightJSON, err := json.Marshal(right)
	if err != nil {
		return false
	}
	return string(leftJSON) == string(rightJSON)
}
