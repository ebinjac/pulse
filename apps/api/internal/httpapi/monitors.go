package httpapi

import (
	"net/http"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func (s *Server) listMonitors(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"monitors": s.store.ListMonitors()})
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

