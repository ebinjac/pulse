package httpapi

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/events"
	"github.com/ensemble-pulse/pulse/apps/api/internal/jobqueue"
)

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

	if s.applicationServiceRoutes(w, r, applicationID, parts) {
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
	now := time.Now().UTC()
	batchID := fmt.Sprintf("batch-%d", now.UnixNano())
	summary := domain.ApplicationRunSummary{
		ApplicationID: application.ID,
		BatchID:       batchID,
		MonitorIDs:    []string{},
	}
	for _, monitor := range monitors {
		if !monitor.IsActive {
			summary.Skipped++
			continue
		}

		if s.queue == nil {
			run := s.executor.Run(monitor)
			summary.Queued++
			summary.MonitorIDs = append(summary.MonitorIDs, monitor.ID)
			events.PublishRunCompleted(s.events, application.ID, batchID, monitor.ID, run.ID, run.Status, run.DurationMS, run.FailureReason)
			continue
		}

		enqueued, err := s.queue.EnqueueMonitorRun(r.Context(), jobqueue.MonitorRunJob{
			MonitorID:     monitor.ID,
			Trigger:       "manual",
			EnqueuedAt:    now,
			ScheduledAt:   now,
			ApplicationID: application.ID,
			BatchID:       batchID,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to enqueue application monitor runs")
			return
		}
		if enqueued {
			summary.Queued++
			summary.MonitorIDs = append(summary.MonitorIDs, monitor.ID)
			events.PublishRunQueued(s.events, application.ID, batchID, monitor.ID)
		} else {
			summary.Skipped++
		}
	}

	writeJSON(w, http.StatusAccepted, map[string]any{"application": application, "summary": summary})
}

