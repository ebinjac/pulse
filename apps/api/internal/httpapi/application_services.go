package httpapi

import (
	"net/http"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func (s *Server) applicationServiceRoutes(w http.ResponseWriter, r *http.Request, applicationID string, parts []string) bool {
	if len(parts) < 2 || parts[1] != "services" {
		return false
	}

	if _, ok := s.store.GetApplication(applicationID); !ok {
		writeError(w, http.StatusNotFound, "application not found")
		return true
	}

	if len(parts) == 2 {
		switch r.Method {
		case http.MethodGet:
			writeJSON(w, http.StatusOK, map[string]any{"services": s.store.ListApplicationServices(applicationID)})
		case http.MethodPost:
			s.createApplicationService(w, r, applicationID)
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return true
	}

	serviceID := parts[2]
	switch r.Method {
	case http.MethodGet:
		service, ok := s.store.GetApplicationService(serviceID)
		if !ok || service.ApplicationID != applicationID {
			writeError(w, http.StatusNotFound, "service not found")
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"service": service})
	case http.MethodPut:
		s.updateApplicationService(w, r, applicationID, serviceID)
	case http.MethodDelete:
		service, ok := s.store.GetApplicationService(serviceID)
		if !ok || service.ApplicationID != applicationID || !s.store.DeleteApplicationService(serviceID) {
			writeError(w, http.StatusNotFound, "service not found")
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
	return true
}

func (s *Server) createApplicationService(w http.ResponseWriter, r *http.Request, applicationID string) {
	var service domain.ApplicationService
	if !decodeJSON(w, r, &service) {
		return
	}
	if strings.TrimSpace(service.Name) == "" || strings.TrimSpace(service.LogServiceName) == "" {
		writeError(w, http.StatusBadRequest, "name and logServiceName are required")
		return
	}
	service.ApplicationID = applicationID
	writeJSON(w, http.StatusCreated, map[string]any{"service": s.store.UpsertApplicationService(service)})
}

func (s *Server) updateApplicationService(w http.ResponseWriter, r *http.Request, applicationID, serviceID string) {
	existing, ok := s.store.GetApplicationService(serviceID)
	if !ok || existing.ApplicationID != applicationID {
		writeError(w, http.StatusNotFound, "service not found")
		return
	}
	var service domain.ApplicationService
	if !decodeJSON(w, r, &service) {
		return
	}
	if strings.TrimSpace(service.Name) == "" || strings.TrimSpace(service.LogServiceName) == "" {
		writeError(w, http.StatusBadRequest, "name and logServiceName are required")
		return
	}
	service.ID = serviceID
	service.ApplicationID = applicationID
	writeJSON(w, http.StatusOK, map[string]any{"service": s.store.UpsertApplicationService(service)})
}
