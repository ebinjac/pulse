package store

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

var ErrNotFound = errors.New("not found")

type MemoryStore struct {
	mu              sync.RWMutex
	applications         map[string]domain.Application
	applicationServices  map[string]domain.ApplicationService
	validations          map[string]domain.DeploymentValidation
	validationLinks []domain.DeploymentValidationRunLink
	monitors        map[string]domain.Monitor
	drafts          map[string]memoryDraftRecord
	versions        map[string][]memoryVersionRecord
	runs            map[string]domain.MonitorRun
	secrets         map[string]domain.SecretReference
	certificates    map[string]domain.CertificateProfile
	alerts          map[string]domain.AlertEvent
	maintenance     map[string]domain.MaintenanceWindow
	retention       domain.RetentionSettings
	elfProxy        domain.ElfProxySettings
	elfQueries      map[string]domain.ElfQuery
}

func NewMemoryStore() *MemoryStore {
	now := time.Now().UTC()
	application := domain.Application{
		ID:          "app-token-service",
		Name:        "Token Service",
		CarID:       "500000272",
		Description: "Authentication token APIs owned by the SRE team.",
		Owner:       "SRE",
		Environment: "production",
		Tags:        []string{"auth", "critical"},
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	monitor := domain.Monitor{
		ID:                  "mon-protected-api",
		ApplicationID:       application.ID,
		Name:                "Protected API Synthetic Check",
		Description:         "Generates JWT, fetches a token, and validates protected API health.",
		ScheduleMode:        "every-5m",
		ScheduleLabel:       "Every 5 minutes",
		Cron:                "*/5 * * * *",
		ScheduleCron:        "*/5 * * * *",
		Timezone:            "Asia/Kolkata",
		TimeoutMS:           30000,
		RetryCount:          1,
		FailureThreshold:    3,
		ResponseBodyLimitKB: 32,
		IsActive:            true,
		AlertEnabled:        true,
		Variables: map[string]string{
			"tokenUrl": "https://auth.example.com/oauth/token",
			"baseUrl":  "https://api.example.com",
			"audience": "protected-api",
		},
		SecretAliases:  []string{"clientId", "privateKey", "slackWebhook"},
		Status:         domain.StatusFailed,
		LastDurationMS: 1842,
		SuccessRate24H: 96.4,
		AlertPolicy: domain.AlertPolicy{
			Enabled:         true,
			Threshold:       3,
			ResponseTimeMS:  2000,
			Email:           true,
			SlackWebhook:    true,
			CooldownMinutes: 30,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	monitor.Steps = []domain.MonitorStep{
		{
			ID:        "step-jwt",
			MonitorID: monitor.ID,
			Order:     1,
			Name:      "Generate JWT",
			Type:      "preRequest",
			TimeoutMS: 5000,
			Actions: []domain.Action{
				{
					ID:            "action-jwt",
					Type:          "generateJWT",
					Label:         "Generate RS256 client assertion",
					Output:        "jwt",
					ConfigPreview: "iss/sub={{secrets.clientId}}, aud={{variables.audience}}, exp={{timestamp.epochSecondsPlus300}}",
				},
			},
			Assertions: []domain.Assertion{},
			Extractors: []domain.Extractor{},
		},
		{
			ID:         "step-token",
			MonitorID:  monitor.ID,
			Order:      2,
			Name:       "Get Token",
			Type:       "http",
			Method:     "POST",
			URL:        "{{variables.tokenUrl}}",
			TimeoutMS:  15000,
			RetryCount: 1,
			Assertions: []domain.Assertion{
				{ID: "assert-token-status", Type: "statusCode", Label: "Token endpoint returns 200", Target: "status", Operator: "equals", Expected: "200", Actual: "200"},
				{ID: "assert-token-json", Type: "jsonPath", Label: "Access token exists", Target: "$.access_token", Operator: "exists", Expected: "present", Actual: "********", Sensitive: true},
			},
			Extractors: []domain.Extractor{
				{ID: "extract-access-token", Name: "accessToken", Type: "jsonPath", Source: "$.access_token", Sensitive: true},
			},
		},
		{
			ID:         "step-health",
			MonitorID:  monitor.ID,
			Order:      3,
			Name:       "Call Protected API",
			Type:       "http",
			Method:     "GET",
			URL:        "{{variables.baseUrl}}/health",
			TimeoutMS:  10000,
			RetryCount: 1,
			Assertions: []domain.Assertion{
				{ID: "assert-health-status", Type: "statusCode", Label: "Protected API returns 200", Target: "status", Operator: "equals", Expected: "200", Actual: "503"},
				{ID: "assert-health-latency", Type: "responseTime", Label: "Responds under threshold", Target: "latency", Operator: "lessThan", Expected: "2000ms", Actual: "1842ms"},
			},
			Extractors: []domain.Extractor{},
		},
	}

	monitor.PublishedVersion = 1
	seedDraft := cloneMonitorConfig(monitor)

	return &MemoryStore{
		applications:        map[string]domain.Application{application.ID: application},
		applicationServices: map[string]domain.ApplicationService{},
		validations:         map[string]domain.DeploymentValidation{},
		elfQueries:          map[string]domain.ElfQuery{},
		validationLinks: []domain.DeploymentValidationRunLink{},
		monitors:        map[string]domain.Monitor{monitor.ID: monitor},
		drafts: map[string]memoryDraftRecord{
			monitor.ID: {config: seedDraft, updatedAt: now},
		},
		versions: map[string][]memoryVersionRecord{
			monitor.ID: {{
				summary: domain.MonitorVersionSummary{
					ID:            "mver-seed",
					MonitorID:     monitor.ID,
					VersionNumber: 1,
					ChangeNote:    "Initial published version",
					Source:        "initial",
					CreatedAt:     now,
				},
				config: seedDraft,
			}},
		},
		runs:         map[string]domain.MonitorRun{},
		certificates: map[string]domain.CertificateProfile{},
		alerts:       map[string]domain.AlertEvent{},
		maintenance:  map[string]domain.MaintenanceWindow{},
		secrets: map[string]domain.SecretReference{
			"sec-client-id": {
				ID: "sec-client-id", Name: "Demo Client ID", Alias: "clientId", Provider: "encrypted-db",
				Description: "OAuth client identifier used by the JWT prerequisite step.", MaskedValue: "********", IsActive: true, LastTestedAt: now, RawValue: "demo-client-id",
			},
			"sec-private-key": {
				ID: "sec-private-key", Name: "Demo Private Key", Alias: "privateKey", Provider: "encrypted-db",
				Description: "RS256 signing key. Stored encrypted and masked everywhere.", MaskedValue: "********", IsActive: true, LastTestedAt: now, RawValue: "demo-private-key",
			},
			"sec-slack": {
				ID: "sec-slack", Name: "Synthetic Alerts Slack Webhook", Alias: "slackWebhook", Provider: "encrypted-db",
				Description: "Webhook for failure threshold and auto-resolve notifications.", MaskedValue: "********", IsActive: true, LastTestedAt: now, RawValue: "https://hooks.slack.example/demo",
			},
		},
	}
}

func (s *MemoryStore) ListApplications() []domain.Application {
	s.mu.RLock()
	defer s.mu.RUnlock()

	applications := make([]domain.Application, 0, len(s.applications))
	for _, application := range s.applications {
		applications = append(applications, application)
	}
	sort.Slice(applications, func(i, j int) bool {
		return applications[i].Name < applications[j].Name
	})
	return applications
}

func (s *MemoryStore) GetApplication(id string) (domain.Application, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	application, ok := s.applications[id]
	return application, ok
}

func (s *MemoryStore) UpsertApplication(application domain.Application) domain.Application {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if application.ID == "" {
		application.ID = "app-" + randomID()
		application.CreatedAt = now
	}
	if application.CreatedAt.IsZero() {
		application.CreatedAt = now
	}
	if application.Environment == "" {
		application.Environment = "production"
	}
	if application.Tags == nil {
		application.Tags = []string{}
	}
	application.UpdatedAt = now
	s.applications[application.ID] = application
	return application
}

func (s *MemoryStore) DeleteApplication(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.applications[id]; !ok {
		return false
	}
	delete(s.applications, id)
	for monitorID, monitor := range s.monitors {
		if monitor.ApplicationID == id {
			monitor.ApplicationID = ""
			s.monitors[monitorID] = monitor
		}
	}
	return true
}

func (s *MemoryStore) ListDeploymentValidations(applicationID string) []domain.DeploymentValidation {
	s.mu.RLock()
	defer s.mu.RUnlock()

	validations := make([]domain.DeploymentValidation, 0, len(s.validations))
	for _, validation := range s.validations {
		if applicationID == "" || validation.ApplicationID == applicationID {
			validations = append(validations, validation)
		}
	}
	sort.Slice(validations, func(i, j int) bool {
		return validations[i].CreatedAt.After(validations[j].CreatedAt)
	})
	return validations
}

func (s *MemoryStore) GetDeploymentValidation(id string) (domain.DeploymentValidation, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	validation, ok := s.validations[id]
	return validation, ok
}

func (s *MemoryStore) CreateDeploymentValidation(validation domain.DeploymentValidation) domain.DeploymentValidation {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if validation.ID == "" {
		validation.ID = "depval-" + randomID()
	}
	if validation.Status == "" {
		validation.Status = domain.DeploymentValidationDraft
	}
	if validation.SampleCount <= 0 {
		validation.SampleCount = 30
	}
	if validation.IntervalSeconds < 0 {
		validation.IntervalSeconds = 0
	}
	if validation.DeploymentStartedAt == nil {
		deploymentStartedAt := now
		validation.DeploymentStartedAt = &deploymentStartedAt
	}
	if validation.BaselineWindowHours <= 0 {
		validation.BaselineWindowHours = 24
	}
	if validation.BaselineRunCount <= 0 {
		validation.BaselineRunCount = 30
	}
	if validation.CreatedAt.IsZero() {
		validation.CreatedAt = now
	}
	validation.UpdatedAt = now
	if validation.MonitorIDs == nil {
		validation.MonitorIDs = []string{}
	}
	s.validations[validation.ID] = validation
	return validation
}

func (s *MemoryStore) UpdateDeploymentValidation(validation domain.DeploymentValidation) domain.DeploymentValidation {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, ok := s.validations[validation.ID]
	if ok && validation.CreatedAt.IsZero() {
		validation.CreatedAt = existing.CreatedAt
	}
	if validation.CreatedAt.IsZero() {
		validation.CreatedAt = time.Now().UTC()
	}
	validation.UpdatedAt = time.Now().UTC()
	if validation.MonitorIDs == nil {
		validation.MonitorIDs = []string{}
	}
	if validation.DeploymentStartedAt == nil {
		deploymentStartedAt := validation.CreatedAt
		if deploymentStartedAt.IsZero() {
			deploymentStartedAt = time.Now().UTC()
		}
		validation.DeploymentStartedAt = &deploymentStartedAt
	}
	if validation.BaselineWindowHours <= 0 {
		validation.BaselineWindowHours = 24
	}
	if validation.BaselineRunCount <= 0 {
		validation.BaselineRunCount = 30
	}
	s.validations[validation.ID] = validation
	return validation
}

func (s *MemoryStore) DeleteDeploymentValidation(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.validations[id]; !ok {
		return false
	}
	delete(s.validations, id)
	filtered := s.validationLinks[:0]
	for _, link := range s.validationLinks {
		if link.ValidationID != id {
			filtered = append(filtered, link)
		}
	}
	s.validationLinks = filtered
	return true
}

func (s *MemoryStore) LinkDeploymentValidationRun(validationID string, phase domain.DeploymentValidationPhase, monitorID string, runID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, link := range s.validationLinks {
		if link.ValidationID == validationID && link.Phase == phase && link.MonitorID == monitorID && link.RunID == runID {
			return
		}
	}
	s.validationLinks = append(s.validationLinks, domain.DeploymentValidationRunLink{
		ValidationID: validationID,
		Phase:        phase,
		MonitorID:    monitorID,
		RunID:        runID,
		CreatedAt:    time.Now().UTC(),
	})
}

func (s *MemoryStore) ListDeploymentValidationRuns(validationID string, phase domain.DeploymentValidationPhase) []domain.MonitorRun {
	s.mu.RLock()
	defer s.mu.RUnlock()

	runs := make([]domain.MonitorRun, 0)
	for _, link := range s.validationLinks {
		if link.ValidationID != validationID || link.Phase != phase {
			continue
		}
		if run, ok := s.runs[link.RunID]; ok {
			runs = append(runs, run)
		}
	}
	sort.Slice(runs, func(i, j int) bool {
		return runs[i].StartedAt.After(runs[j].StartedAt)
	})
	return runs
}

func (s *MemoryStore) ListMonitors() []domain.Monitor {
	s.mu.RLock()
	defer s.mu.RUnlock()

	monitors := make([]domain.Monitor, 0, len(s.monitors))
	for _, monitor := range s.monitors {
		monitors = append(monitors, monitor)
	}

	return monitors
}

func (s *MemoryStore) ListMonitorsByApplication(applicationID string) []domain.Monitor {
	s.mu.RLock()
	defer s.mu.RUnlock()

	monitors := make([]domain.Monitor, 0)
	for _, monitor := range s.monitors {
		if monitor.ApplicationID == applicationID {
			monitors = append(monitors, monitor)
		}
	}
	return monitors
}

func (s *MemoryStore) GetMonitor(id string) (domain.Monitor, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	monitor, ok := s.monitors[id]
	return monitor, ok
}

func (s *MemoryStore) UpsertMonitor(monitor domain.Monitor) domain.Monitor {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	monitor = NormalizeMonitor(monitor)
	if monitor.ID == "" {
		monitor.ID = "mon-" + randomID()
		monitor.CreatedAt = now
	}
	if monitor.CreatedAt.IsZero() {
		monitor.CreatedAt = now
	}
	monitor.UpdatedAt = now
	for index := range monitor.Steps {
		monitor.Steps[index].MonitorID = monitor.ID
		if monitor.Steps[index].ID == "" {
			monitor.Steps[index].ID = "step-" + randomID()
		}
		if monitor.Steps[index].Order == 0 {
			monitor.Steps[index].Order = index + 1
		}
	}

	s.monitors[monitor.ID] = monitor
	if _, ok := s.drafts[monitor.ID]; !ok {
		s.drafts[monitor.ID] = memoryDraftRecord{config: cloneMonitorConfig(monitor), updatedAt: now}
	}
	if len(s.versions[monitor.ID]) == 0 {
		s.recordVersionLocked(monitor, "Initial published version", "", "initial")
	}
	return monitor
}

func (s *MemoryStore) DeleteMonitor(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.monitors[id]; !ok {
		return false
	}

	delete(s.monitors, id)
	delete(s.drafts, id)
	delete(s.versions, id)
	for runID, run := range s.runs {
		if run.MonitorID == id {
			delete(s.runs, runID)
		}
	}

	return true
}

func (s *MemoryStore) SaveRun(run domain.MonitorRun) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.runs[run.ID] = run
	if run.TriggeredBy == "draft" || run.TriggeredBy == "test" {
		return
	}
	monitor, ok := s.monitors[run.MonitorID]
	if ok {
		monitor.Status = run.Status
		monitor.LastRunAt = &run.EndedAt
		monitor.LastDurationMS = run.DurationMS
		monitor.UpdatedAt = time.Now().UTC()
		s.monitors[monitor.ID] = monitor
	}
}

func (s *MemoryStore) ListRuns(monitorID string) []domain.MonitorRun {
	s.mu.RLock()
	defer s.mu.RUnlock()

	runs := make([]domain.MonitorRun, 0, len(s.runs))
	for _, run := range s.runs {
		if monitorID == "" || run.MonitorID == monitorID {
			runs = append(runs, run)
		}
	}

	return runs
}

func (s *MemoryStore) ListAlerts() []domain.AlertEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()

	alerts := make([]domain.AlertEvent, 0, len(s.alerts))
	for _, alert := range s.alerts {
		alerts = append(alerts, alert)
	}
	sort.Slice(alerts, func(i, j int) bool {
		return alerts[i].LastTriggeredAt.After(alerts[j].LastTriggeredAt)
	})

	return alerts
}

func (s *MemoryStore) GetAlert(id string) (domain.AlertEvent, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	alert, ok := s.alerts[id]
	return alert, ok
}

func (s *MemoryStore) GetOpenAlert(monitorID string) (domain.AlertEvent, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var newest domain.AlertEvent
	found := false
	for _, alert := range s.alerts {
		if alert.MonitorID != monitorID || alert.Status == domain.AlertStatusResolved {
			continue
		}
		if !found || alert.LastTriggeredAt.After(newest.LastTriggeredAt) {
			newest = alert
			found = true
		}
	}

	return newest, found
}

func (s *MemoryStore) AcknowledgeAlert(id string, acknowledgedBy string) (domain.AlertEvent, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	alert, ok := s.alerts[id]
	if !ok || alert.Status == domain.AlertStatusResolved {
		return domain.AlertEvent{}, false
	}
	now := time.Now().UTC()
	alert.Status = domain.AlertStatusAcknowledged
	alert.AcknowledgedBy = acknowledgedBy
	alert.AcknowledgedAt = &now
	alert.UpdatedAt = now
	s.alerts[id] = alert
	return alert, true
}

func (s *MemoryStore) SnoozeAlert(id string, until time.Time, reason string) (domain.AlertEvent, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	alert, ok := s.alerts[id]
	if !ok || alert.Status == domain.AlertStatusResolved {
		return domain.AlertEvent{}, false
	}
	alert.Status = domain.AlertStatusSuppressed
	alert.SnoozedUntil = &until
	alert.SuppressionReason = reason
	alert.UpdatedAt = time.Now().UTC()
	s.alerts[id] = alert
	return alert, true
}

func (s *MemoryStore) SaveAlert(alert domain.AlertEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if alert.ID == "" {
		alert.ID = "alert-" + randomID()
	}
	if alert.CreatedAt.IsZero() {
		alert.CreatedAt = now
	}
	alert.UpdatedAt = now
	s.alerts[alert.ID] = alert
}

func (s *MemoryStore) ResolveOpenAlerts(monitorID string, resolvedAt time.Time) int {
	s.mu.Lock()
	defer s.mu.Unlock()

	count := 0
	for id, alert := range s.alerts {
		if alert.MonitorID != monitorID || alert.Status == domain.AlertStatusResolved {
			continue
		}
		alert.Status = domain.AlertStatusResolved
		alert.ResolvedAt = &resolvedAt
		alert.UpdatedAt = time.Now().UTC()
		s.alerts[id] = alert
		count++
	}

	return count
}

func (s *MemoryStore) GetRun(id string) (domain.MonitorRun, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	run, ok := s.runs[id]
	return run, ok
}

func (s *MemoryStore) ListCertificateProfiles() []domain.CertificateProfile {
	s.mu.RLock()
	defer s.mu.RUnlock()

	profiles := make([]domain.CertificateProfile, 0, len(s.certificates))
	for _, profile := range s.certificates {
		profiles = append(profiles, profile)
	}
	sort.Slice(profiles, func(i, j int) bool {
		return profiles[i].UpdatedAt.After(profiles[j].UpdatedAt)
	})
	return profiles
}

func (s *MemoryStore) GetCertificateProfile(id string) (domain.CertificateProfile, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	profile, ok := s.certificates[id]
	return profile, ok
}

func (s *MemoryStore) UpsertCertificateProfile(profile domain.CertificateProfile) (domain.CertificateProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if profile.ID == "" {
		profile.ID = "cert-" + randomID()
	}
	if profile.Port <= 0 {
		profile.Port = 443
	}
	if profile.CertType == "" {
		profile.CertType = "pem"
	}
	if existing, ok := s.certificates[profile.ID]; ok && !existing.CreatedAt.IsZero() {
		profile.CreatedAt = existing.CreatedAt
	}
	if profile.CreatedAt.IsZero() {
		profile.CreatedAt = now
	}
	profile.UpdatedAt = now
	s.certificates[profile.ID] = profile
	return profile, nil
}

func (s *MemoryStore) DeleteCertificateProfile(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.certificates[id]; !ok {
		return false
	}
	delete(s.certificates, id)
	return true
}

func (s *MemoryStore) ListSecrets() []domain.SecretReference {
	s.mu.RLock()
	defer s.mu.RUnlock()

	secrets := make([]domain.SecretReference, 0, len(s.secrets))
	for _, secret := range s.secrets {
		secret.RawValue = ""
		secrets = append(secrets, secret)
	}

	return secrets
}

func (s *MemoryStore) GetSecret(id string) (domain.SecretReference, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	secret, ok := s.secrets[id]
	secret.RawValue = ""
	return secret, ok
}

func (s *MemoryStore) UpsertSecret(secret domain.SecretReference) (domain.SecretReference, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if secret.ID == "" {
		secret.ID = "sec-" + randomID()
	}
	if secret.Provider == "" {
		secret.Provider = "encrypted-db"
	}
	if secret.RawValue == "" {
		if existing, ok := s.secrets[secret.ID]; ok {
			secret.RawValue = existing.RawValue
		}
	}
	if secret.MaskedValue == "" {
		secret.MaskedValue = "********"
	}
	if secret.LastTestedAt.IsZero() {
		secret.LastTestedAt = now
	}

	for id, existing := range s.secrets {
		if existing.Alias == secret.Alias && id != secret.ID {
			delete(s.secrets, id)
		}
	}

	s.secrets[secret.ID] = secret
	secret.RawValue = ""
	return secret, nil
}

func (s *MemoryStore) GetRawSecretValue(alias string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, secret := range s.secrets {
		if secret.Alias == alias && secret.IsActive {
			return secret.RawValue, true
		}
	}
	return "", false
}

func (s *MemoryStore) DeleteSecret(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.secrets[id]; !ok {
		return false
	}
	delete(s.secrets, id)
	return true
}

func (s *MemoryStore) ListMaintenanceWindows(activeOnly bool) []domain.MaintenanceWindow {
	s.mu.RLock()
	defer s.mu.RUnlock()

	now := time.Now().UTC()
	windows := make([]domain.MaintenanceWindow, 0, len(s.maintenance))
	for _, window := range s.maintenance {
		if activeOnly && (now.Before(window.StartsAt) || !now.Before(window.EndsAt)) {
			continue
		}
		windows = append(windows, window)
	}
	sort.Slice(windows, func(i, j int) bool {
		return windows[i].EndsAt.After(windows[j].EndsAt)
	})
	return windows
}

func (s *MemoryStore) CreateMaintenanceWindow(window domain.MaintenanceWindow) domain.MaintenanceWindow {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if window.ID == "" {
		window.ID = "maint-" + randomID()
	}
	if window.CreatedAt.IsZero() {
		window.CreatedAt = now
	}
	if window.StartsAt.IsZero() {
		window.StartsAt = now
	}
	s.maintenance[window.ID] = window
	return window
}

func (s *MemoryStore) DeleteMaintenanceWindow(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.maintenance[id]; !ok {
		return false
	}
	delete(s.maintenance, id)
	return true
}

func (s *MemoryStore) IsUnderMaintenance(monitorID, applicationID string, at time.Time) (string, bool) {
	for _, window := range s.ListMaintenanceWindows(true) {
		if at.Before(window.StartsAt) || !at.Before(window.EndsAt) {
			continue
		}
		switch strings.ToLower(window.ScopeType) {
		case "global":
			return windowReason(window), true
		case "application":
			if window.ScopeID == applicationID && applicationID != "" {
				return windowReason(window), true
			}
		case "monitor":
			if window.ScopeID == monitorID {
				return windowReason(window), true
			}
		}
	}
	return "", false
}

func randomID() string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return hex.EncodeToString([]byte(time.Now().Format("150405.000000000")))
	}

	return hex.EncodeToString(bytes)
}
