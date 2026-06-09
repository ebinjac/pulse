package httpapi

import (
	"net/http"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/alerting"
	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/events"
	"github.com/ensemble-pulse/pulse/apps/api/internal/logcheck"
)

func (s *Server) runDeploymentValidationLogCheck(w http.ResponseWriter, _ *http.Request, validationID string) {
	validation, ok := s.store.GetDeploymentValidation(validationID)
	if !ok {
		writeError(w, http.StatusNotFound, "deployment validation not found")
		return
	}
	if len(validation.ElfQueryIDs) == 0 {
		writeError(w, http.StatusBadRequest, "no ELF queries configured for this validation")
		return
	}

	now := time.Now().UTC()
	validation.Status = domain.DeploymentValidationLogRunning
	validation.LogStartedAt = &now
	validation.LogCompletedAt = nil
	s.store.UpdateDeploymentValidation(validation)
	events.PublishValidationStatusChanged(s.events, validation.ID, validation.Status)

	if s.queue != nil {
		go s.executeDeploymentLogCheck(validationID)
		writeJSON(w, http.StatusAccepted, map[string]any{"validation": validation, "queued": true})
		return
	}

	validation = s.executeDeploymentLogCheck(validationID)
	writeJSON(w, http.StatusOK, map[string]any{"validation": validation})
}

func (s *Server) executeDeploymentLogCheck(validationID string) domain.DeploymentValidation {
	validation, ok := s.store.GetDeploymentValidation(validationID)
	if !ok {
		return domain.DeploymentValidation{}
	}
	preRuns := s.baselineRunsForValidation(validation)
	postRuns := s.store.ListDeploymentValidationRuns(validation.ID, domain.DeploymentValidationPhasePost)
	validation = (&logcheck.Service{Store: s.store, Events: s.events}).Execute(validationID, preRuns, postRuns)
	if application, ok := s.store.GetApplication(validation.ApplicationID); ok {
		alerting.NewService(s.store, s.events).NotifyDeploymentObservabilityFailure(application, validation)
	}
	return validation
}

func (s *Server) elfQueryLookupFromStore() map[string]domain.ElfQuery {
	lookup := map[string]domain.ElfQuery{}
	for _, query := range s.store.ListElfQueries("") {
		lookup[query.ID] = query
	}
	return lookup
}

func (s *Server) maybeAutoRunLogCheck(validationID string) {
	validation, ok := s.store.GetDeploymentValidation(validationID)
	if !ok || !validation.AutoRunLogCheck {
		return
	}
	if len(validation.ElfQueryIDs) == 0 {
		return
	}
	if s.queue != nil {
		go s.executeDeploymentLogCheck(validationID)
		return
	}
	s.executeDeploymentLogCheck(validationID)
}
