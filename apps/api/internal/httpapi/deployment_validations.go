package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/events"
	"github.com/ensemble-pulse/pulse/apps/api/internal/jobqueue"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

type deploymentValidationInput struct {
	ApplicationID       string   `json:"applicationId"`
	Name                string   `json:"name"`
	Version             string   `json:"version"`
	BuildID             string   `json:"buildId"`
	Environment         string   `json:"environment"`
	MonitorIDs          []string `json:"monitorIds"`
	SampleCount         int      `json:"sampleCount"`
	IntervalSeconds     int      `json:"intervalSeconds"`
	DeploymentStartedAt string   `json:"deploymentStartedAt"`
	BaselineWindowHours int      `json:"baselineWindowHours"`
	BaselineRunCount    int      `json:"baselineRunCount"`
	ElfQueryIDs          []string `json:"elfQueryIds"`
	AutoRunLogCheck      bool     `json:"autoRunLogCheck"`
	ServiceIDs           []string `json:"serviceIds"`
	ObservabilityProfile string   `json:"observabilityProfile"`
	SignalPackIDs        []string `json:"signalPackIds"`
}

func (s *Server) listDeploymentValidations(w http.ResponseWriter, r *http.Request) {
	applicationID := strings.TrimSpace(r.URL.Query().Get("applicationId"))
	writeJSON(w, http.StatusOK, map[string]any{"validations": s.store.ListDeploymentValidations(applicationID)})
}

func (s *Server) createDeploymentValidation(w http.ResponseWriter, r *http.Request) {
	var input deploymentValidationInput
	if !decodeJSON(w, r, &input) {
		return
	}
	payload, err := s.buildDeploymentValidationPayload(input, domain.DeploymentValidation{})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	payload.Status = domain.DeploymentValidationDraft
	validation := s.store.CreateDeploymentValidation(payload)
	writeJSON(w, http.StatusCreated, map[string]any{"validation": validation})
}

func (s *Server) updateDeploymentValidation(w http.ResponseWriter, r *http.Request, validationID string) {
	existing, ok := s.store.GetDeploymentValidation(validationID)
	if !ok {
		writeError(w, http.StatusNotFound, "deployment validation not found")
		return
	}
	var input deploymentValidationInput
	if !decodeJSON(w, r, &input) {
		return
	}
	if strings.TrimSpace(input.ApplicationID) == "" {
		input.ApplicationID = existing.ApplicationID
	}
	payload, err := s.buildDeploymentValidationPayload(input, existing)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	payload.ID = existing.ID
	payload.Status = existing.Status
	payload.Report = existing.Report
	payload.AIReport = existing.AIReport
	payload.PreStartedAt = existing.PreStartedAt
	payload.PreCompletedAt = existing.PreCompletedAt
	payload.PostStartedAt = existing.PostStartedAt
	payload.PostCompletedAt = existing.PostCompletedAt
	payload.CreatedAt = existing.CreatedAt
	if existing.Status != domain.DeploymentValidationDraft {
		payload.MonitorIDs = existing.MonitorIDs
		payload.SampleCount = existing.SampleCount
		payload.IntervalSeconds = existing.IntervalSeconds
		payload.BaselineWindowHours = existing.BaselineWindowHours
		payload.BaselineRunCount = existing.BaselineRunCount
		payload.DeploymentStartedAt = existing.DeploymentStartedAt
		payload.ElfQueryIDs = existing.ElfQueryIDs
		payload.AutoRunLogCheck = existing.AutoRunLogCheck
		payload.ServiceIDs = existing.ServiceIDs
		payload.ObservabilityProfile = existing.ObservabilityProfile
		payload.SignalPackIDs = existing.SignalPackIDs
	}
	validation := s.store.UpdateDeploymentValidation(payload)
	writeJSON(w, http.StatusOK, map[string]any{"validation": validation})
}

func (s *Server) deleteDeploymentValidation(w http.ResponseWriter, validationID string) {
	if !s.store.DeleteDeploymentValidation(validationID) {
		writeError(w, http.StatusNotFound, "deployment validation not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func (s *Server) buildDeploymentValidationPayload(input deploymentValidationInput, existing domain.DeploymentValidation) (domain.DeploymentValidation, error) {
	if strings.TrimSpace(input.ApplicationID) == "" {
		return domain.DeploymentValidation{}, fmt.Errorf("applicationId is required")
	}
	application, ok := s.store.GetApplication(input.ApplicationID)
	if !ok {
		return domain.DeploymentValidation{}, fmt.Errorf("application not found")
	}
	monitorIDs := selectedApplicationMonitorIDs(s.store.ListMonitorsByApplication(application.ID), input.MonitorIDs)
	if len(monitorIDs) == 0 && existing.Status == domain.DeploymentValidationDraft {
		return domain.DeploymentValidation{}, fmt.Errorf("at least one active application monitor is required")
	}
	if len(monitorIDs) == 0 {
		monitorIDs = existing.MonitorIDs
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		if strings.TrimSpace(existing.Name) != "" {
			name = existing.Name
		} else {
			name = "Deployment validation"
		}
	}
	environment := strings.TrimSpace(input.Environment)
	if environment == "" {
		environment = application.Environment
	}
	sampleCount := clampInt(input.SampleCount, 30, 1, 100)
	if input.SampleCount == 0 && existing.SampleCount > 0 {
		sampleCount = existing.SampleCount
	}
	intervalSeconds := clampIntervalSeconds(input.IntervalSeconds, 30, 3600)
	if input.IntervalSeconds == 0 && existing.IntervalSeconds > 0 {
		intervalSeconds = existing.IntervalSeconds
	}
	deploymentStartedAt := parseOptionalTime(input.DeploymentStartedAt)
	if deploymentStartedAt == nil {
		deploymentStartedAt = existing.DeploymentStartedAt
	}
	if deploymentStartedAt == nil {
		now := time.Now().UTC()
		deploymentStartedAt = &now
	}
	baselineWindowHours := clampInt(input.BaselineWindowHours, 24, 1, 24*30)
	if input.BaselineWindowHours == 0 && existing.BaselineWindowHours > 0 {
		baselineWindowHours = existing.BaselineWindowHours
	}
	baselineRunCount := clampInt(input.BaselineRunCount, 30, 1, 500)
	if input.BaselineRunCount == 0 && existing.BaselineRunCount > 0 {
		baselineRunCount = existing.BaselineRunCount
	}
	return domain.DeploymentValidation{
		ID:                  existing.ID,
		ApplicationID:       application.ID,
		ApplicationName:     application.Name,
		CarID:               application.CarID,
		Name:                name,
		Version:             strings.TrimSpace(input.Version),
		BuildID:             strings.TrimSpace(input.BuildID),
		Environment:         environment,
		MonitorIDs:          monitorIDs,
		SampleCount:         sampleCount,
		IntervalSeconds:     intervalSeconds,
		DeploymentStartedAt: deploymentStartedAt,
		BaselineWindowHours: baselineWindowHours,
		BaselineRunCount:    baselineRunCount,
		ElfQueryIDs:          coalesceStringSlice(input.ElfQueryIDs, existing.ElfQueryIDs),
		AutoRunLogCheck:      input.AutoRunLogCheck,
		ServiceIDs:           coalesceStringSlice(input.ServiceIDs, existing.ServiceIDs),
		ObservabilityProfile: coalesceObservabilityProfile(input.ObservabilityProfile, existing.ObservabilityProfile),
		SignalPackIDs:        coalesceStringSlice(input.SignalPackIDs, existing.SignalPackIDs),
	}, nil
}

func coalesceObservabilityProfile(input, existing string) string {
	if strings.TrimSpace(input) != "" {
		return strings.TrimSpace(input)
	}
	if strings.TrimSpace(existing) != "" {
		return strings.TrimSpace(existing)
	}
	return "custom"
}

func (s *Server) deploymentValidationRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/deployment-validations/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "deployment validation not found")
		return
	}
	validationID := parts[0]
	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			s.getDeploymentValidation(w, validationID)
		case http.MethodPut:
			s.updateDeploymentValidation(w, r, validationID)
		case http.MethodDelete:
			s.deleteDeploymentValidation(w, validationID)
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}
	if len(parts) == 2 && r.Method == http.MethodPost && parts[1] == "run-pre" {
		s.runDeploymentValidationPhase(w, r, validationID, domain.DeploymentValidationPhasePre)
		return
	}
	if len(parts) == 2 && r.Method == http.MethodPost && parts[1] == "run-post" {
		s.runDeploymentValidationPhase(w, r, validationID, domain.DeploymentValidationPhasePost)
		return
	}
	if len(parts) == 2 && r.Method == http.MethodPost && parts[1] == "run-log-check" {
		s.runDeploymentValidationLogCheck(w, r, validationID)
		return
	}
	if len(parts) == 2 && r.Method == http.MethodGet && parts[1] == "report" {
		s.getDeploymentValidationReport(w, validationID)
		return
	}
	if len(parts) == 2 && r.Method == http.MethodPut && parts[1] == "ai-report" {
		s.updateDeploymentValidationAIReport(w, r, validationID)
		return
	}
	writeError(w, http.StatusNotFound, "route not found")
}

func (s *Server) updateDeploymentValidationAIReport(w http.ResponseWriter, r *http.Request, validationID string) {
	validation, ok := s.store.GetDeploymentValidation(validationID)
	if !ok {
		writeError(w, http.StatusNotFound, "deployment validation not found")
		return
	}
	var report domain.DeploymentValidationAIReport
	if !decodeJSON(w, r, &report) {
		return
	}
	report.GeneratedAt = time.Now().UTC()
	validation.AIReport = report
	validation = s.store.UpdateDeploymentValidation(validation)
	writeJSON(w, http.StatusOK, map[string]any{"validation": validation})
}

func (s *Server) getDeploymentValidation(w http.ResponseWriter, validationID string) {
	validation, ok := s.store.GetDeploymentValidation(validationID)
	if !ok {
		writeError(w, http.StatusNotFound, "deployment validation not found")
		return
	}
	preRuns := s.baselineRunsForValidation(validation)
	postRuns := s.store.ListDeploymentValidationRuns(validationID, domain.DeploymentValidationPhasePost)
	report := store.BuildDeploymentValidationReport(validation, preRuns, postRuns)
	if len(validation.ElfResults) > 0 {
		report = store.MergeElfResultsIntoReport(report, validation.ElfResults, s.elfQueryLookupFromStore())
	}
	validation.Report = report
	writeJSON(w, http.StatusOK, map[string]any{
		"validation": validation,
		"preRuns":    preRuns,
		"postRuns":   postRuns,
	})
}

func (s *Server) getDeploymentValidationReport(w http.ResponseWriter, validationID string) {
	validation, ok := s.store.GetDeploymentValidation(validationID)
	if !ok {
		writeError(w, http.StatusNotFound, "deployment validation not found")
		return
	}
	preRuns := s.baselineRunsForValidation(validation)
	postRuns := s.store.ListDeploymentValidationRuns(validationID, domain.DeploymentValidationPhasePost)
	report := store.BuildDeploymentValidationReport(validation, preRuns, postRuns)
	validation.Report = report
	s.store.UpdateDeploymentValidation(validation)
	writeJSON(w, http.StatusOK, map[string]any{"report": report, "validation": validation})
}

func (s *Server) runDeploymentValidationPhase(w http.ResponseWriter, _ *http.Request, validationID string, phase domain.DeploymentValidationPhase) {
	validation, ok := s.store.GetDeploymentValidation(validationID)
	if !ok {
		writeError(w, http.StatusNotFound, "deployment validation not found")
		return
	}
	now := time.Now().UTC()
	if phase == domain.DeploymentValidationPhasePre {
		validation.Status = domain.DeploymentValidationPreRunning
		validation.PreStartedAt = &now
		validation.PreCompletedAt = nil
	} else {
		validation.Status = domain.DeploymentValidationPostRunning
		if validation.DeploymentStartedAt == nil {
			validation.DeploymentStartedAt = &now
		}
		validation.PostStartedAt = &now
		validation.PostCompletedAt = nil
	}
	s.store.UpdateDeploymentValidation(validation)
	events.PublishValidationStatusChanged(s.events, validation.ID, validation.Status)

	expected := len(validation.MonitorIDs) * validation.SampleCount
	if expected <= 0 {
		expected = len(validation.MonitorIDs)
	}
	queued, skipped := 0, 0
	if s.queue == nil {
		queued, skipped = s.enqueueDeploymentValidationSamples(validation, phase, now)
	} else {
		queued = expected
		go s.enqueueDeploymentValidationSamples(validation, phase, now)
	}
	if s.queue == nil {
		preRuns := s.baselineRunsForValidation(validation)
		postRuns := s.store.ListDeploymentValidationRuns(validation.ID, domain.DeploymentValidationPhasePost)
		completed := time.Now().UTC()
		if phase == domain.DeploymentValidationPhasePre {
			validation.Status = domain.DeploymentValidationPreComplete
			validation.PreCompletedAt = &completed
			validation = s.store.UpdateDeploymentValidation(validation)
			events.PublishValidationStatusChanged(s.events, validation.ID, validation.Status)
		} else if validation.AutoRunLogCheck && len(validation.ElfQueryIDs) > 0 {
			validation.Status = domain.DeploymentValidationLogRunning
			validation.PostCompletedAt = &completed
			validation.LogStartedAt = &completed
			validation = s.store.UpdateDeploymentValidation(validation)
			events.PublishValidationStatusChanged(s.events, validation.ID, validation.Status)
			validation = s.executeDeploymentLogCheck(validation.ID)
		} else {
			validation.Status = domain.DeploymentValidationReportReady
			validation.PostCompletedAt = &completed
			validation.Report = store.BuildDeploymentValidationReport(validation, preRuns, postRuns)
			validation = s.store.UpdateDeploymentValidation(validation)
			events.PublishValidationStatusChanged(s.events, validation.ID, validation.Status)
			events.PublishValidationReportUpdated(s.events, validation.ID, validation.Status)
		}
	}

	writeJSON(w, http.StatusAccepted, map[string]any{
		"validation": validation,
		"summary": map[string]any{
			"queued":          queued,
			"skipped":         skipped,
			"sampleCount":     validation.SampleCount,
			"intervalSeconds": validation.IntervalSeconds,
			"monitorIds":      validation.MonitorIDs,
		},
	})
}

func (s *Server) baselineRunsForValidation(validation domain.DeploymentValidation) []domain.MonitorRun {
	anchor := validation.CreatedAt
	if validation.DeploymentStartedAt != nil && !validation.DeploymentStartedAt.IsZero() {
		anchor = validation.DeploymentStartedAt.UTC()
	}
	if anchor.IsZero() {
		anchor = time.Now().UTC()
	}
	windowHours := validation.BaselineWindowHours
	if windowHours <= 0 {
		windowHours = 24
	}
	maxRunsPerMonitor := validation.BaselineRunCount
	if maxRunsPerMonitor <= 0 {
		maxRunsPerMonitor = 30
	}
	windowStart := anchor.Add(-time.Duration(windowHours) * time.Hour)
	baseline := make([]domain.MonitorRun, 0)
	for _, monitorID := range validation.MonitorIDs {
		candidates := make([]domain.MonitorRun, 0)
		for _, run := range s.store.ListRuns(monitorID) {
			if run.MonitorID != monitorID {
				continue
			}
			if run.StartedAt.IsZero() || run.StartedAt.After(anchor) || run.StartedAt.Before(windowStart) {
				continue
			}
			if run.TriggeredBy == "draft" || run.TriggeredBy == "test" {
				continue
			}
			candidates = append(candidates, run)
		}
		sort.Slice(candidates, func(i, j int) bool {
			return candidates[i].StartedAt.After(candidates[j].StartedAt)
		})
		if len(candidates) > maxRunsPerMonitor {
			candidates = candidates[:maxRunsPerMonitor]
		}
		baseline = append(baseline, candidates...)
	}
	if len(baseline) == 0 {
		baseline = s.store.ListDeploymentValidationRuns(validation.ID, domain.DeploymentValidationPhasePre)
	}
	sort.Slice(baseline, func(i, j int) bool {
		return baseline[i].StartedAt.After(baseline[j].StartedAt)
	})
	return baseline
}

func (s *Server) enqueueDeploymentValidationSamples(validation domain.DeploymentValidation, phase domain.DeploymentValidationPhase, startedAt time.Time) (int, int) {
	sampleCount := validation.SampleCount
	if sampleCount <= 0 {
		sampleCount = 1
	}
	interval := time.Duration(validation.IntervalSeconds) * time.Second
	if interval < 0 {
		interval = 0
	}
	queued, skipped := 0, 0
	for sampleIndex := 1; sampleIndex <= sampleCount; sampleIndex++ {
		if sampleIndex > 1 && interval > 0 {
			time.Sleep(interval)
		}
		for _, monitorID := range validation.MonitorIDs {
			monitor, ok := s.store.GetMonitor(monitorID)
			if !ok || !monitor.IsActive {
				skipped++
				continue
			}
			if s.queue == nil {
				run := s.executor.Run(monitor)
				s.store.LinkDeploymentValidationRun(validation.ID, phase, monitor.ID, run.ID)
				events.PublishValidationRunLinked(s.events, validation.ID, phase, monitor.ID, run.ID, run.Status)
				queued++
				continue
			}
			enqueued, err := s.queue.EnqueueMonitorRun(context.Background(), jobqueue.MonitorRunJob{
				MonitorID:       monitor.ID,
				Trigger:         "manual",
				EnqueuedAt:      time.Now().UTC(),
				ScheduledAt:     startedAt.Add(time.Duration(sampleIndex-1) * interval),
				ValidationID:    validation.ID,
				ValidationPhase: string(phase),
				SampleIndex:     sampleIndex,
			})
			if err != nil {
				skipped++
				continue
			}
			if enqueued {
				queued++
			} else {
				skipped++
			}
		}
	}
	return queued, skipped
}

func clampInt(value, fallback, minValue, maxValue int) int {
	if value == 0 {
		value = fallback
	}
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func clampIntervalSeconds(value, fallback, maxValue int) int {
	if value < 0 {
		value = fallback
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func parseOptionalTime(value string) *time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	layouts := []string{time.RFC3339, "2006-01-02T15:04", "2006-01-02 15:04:05", "2006-01-02 15:04"}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			utc := parsed.UTC()
			return &utc
		}
	}
	return nil
}

func coalesceStringSlice(value, fallback []string) []string {
	if value != nil {
		return value
	}
	if fallback != nil {
		return fallback
	}
	return []string{}
}

func selectedApplicationMonitorIDs(monitors []domain.Monitor, requested []string) []string {
	allowed := map[string]domain.Monitor{}
	for _, monitor := range monitors {
		allowed[monitor.ID] = monitor
	}
	selected := make([]string, 0)
	seen := map[string]bool{}
	if len(requested) > 0 {
		for _, monitorID := range requested {
			monitor, ok := allowed[monitorID]
			if !ok || !monitor.IsActive || seen[monitorID] {
				continue
			}
			selected = append(selected, monitorID)
			seen[monitorID] = true
		}
		return selected
	}
	for _, monitor := range monitors {
		if monitor.IsActive && !seen[monitor.ID] {
			selected = append(selected, monitor.ID)
			seen[monitor.ID] = true
		}
	}
	return selected
}
