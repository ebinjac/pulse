package store

import (
	"context"
	"encoding/json"
	"log"
	"strconv"
	"time"

	pulsedb "github.com/ensemble-pulse/pulse/apps/api/internal/db"
	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/secretcrypto"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct {
	pool    *pgxpool.Pool
	queries *pulsedb.Queries
	codec   *secretcrypto.Codec
}

func NewPostgresStore(ctx context.Context, databaseURL string, codec *secretcrypto.Codec) (*PostgresStore, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}

	store := &PostgresStore{pool: pool, queries: pulsedb.New(pool), codec: codec}
	if err := store.backfillLegacySecrets(ctx); err != nil {
		return nil, err
	}
	if err := store.seedDefaults(ctx); err != nil {
		return nil, err
	}

	return store, nil
}

func (s *PostgresStore) backfillLegacySecrets(ctx context.Context) error {
	defaults := map[string]string{
		"clientId":     "demo-client-id",
		"privateKey":   "demo-private-key",
		"slackWebhook": "https://hooks.slack.example/demo",
	}

	legacy, err := s.queries.ListLegacySecretsForBackfill(ctx)
	if err != nil {
		return err
	}

	for _, item := range legacy {
		raw, ok := defaults[item.Alias]
		if !ok {
			continue
		}
		encrypted, err := s.codec.Encrypt(raw, secretAssociatedData(item.ID))
		if err != nil {
			return err
		}
		if err := s.queries.UpdateSecretEncryptedValue(ctx, pulsedb.UpdateSecretEncryptedValueParams{
			ID:             item.ID,
			EncryptedValue: pgText(encrypted),
		}); err != nil {
			return err
		}
	}

	return nil
}

func (s *PostgresStore) ListApplications() []domain.Application {
	rows, err := s.queries.ListApplications(context.Background())
	if err != nil {
		log.Printf("list applications: %v", err)
		return nil
	}

	applications := make([]domain.Application, 0, len(rows))
	for _, row := range rows {
		applications = append(applications, applicationFromListRow(row))
	}
	return applications
}

func (s *PostgresStore) GetApplication(id string) (domain.Application, bool) {
	row, err := s.queries.GetApplication(context.Background(), id)
	if err != nil {
		return domain.Application{}, false
	}
	return applicationFromGetRow(row), true
}

func (s *PostgresStore) UpsertApplication(application domain.Application) domain.Application {
	now := time.Now().UTC()
	if application.ID == "" {
		application.ID = "app-" + randomID()
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

	if err := s.queries.UpsertApplication(context.Background(), pulsedb.UpsertApplicationParams{
		ID:               application.ID,
		Name:             application.Name,
		CarID:            application.CarID,
		Description:      pgText(application.Description),
		Owner:            pgText(application.Owner),
		Environment:      pgText(application.Environment),
		TagsJson:         mustJSON(application.Tags),
		AlertRoutingJson: mustJSON(application.AlertRouting),
		CreatedAt:        pgTimestamp(application.CreatedAt),
		UpdatedAt:        pgTimestamp(application.UpdatedAt),
	}); err != nil {
		log.Printf("upsert application: %v", err)
	}

	return application
}

func (s *PostgresStore) DeleteApplication(id string) bool {
	count, err := s.queries.DeleteApplication(context.Background(), id)
	if err != nil {
		log.Printf("delete application: %v", err)
		return false
	}
	return count > 0
}

func (s *PostgresStore) ListMonitors() []domain.Monitor {
	rows, err := s.queries.ListMonitors(context.Background())
	if err != nil {
		log.Printf("list monitors: %v", err)
		return nil
	}

	monitors := make([]domain.Monitor, 0, len(rows))
	for _, row := range rows {
		monitor, err := monitorFromListRow(row)
		if err != nil {
			log.Printf("scan monitor: %v", err)
			continue
		}
		monitor.Steps = s.listSteps(monitor.ID)
		monitor.SecretAliases = s.listSecretAliases(monitor.ID)
		monitors = append(monitors, monitor)
	}

	return monitors
}

func (s *PostgresStore) ListMonitorsByApplication(applicationID string) []domain.Monitor {
	rows, err := s.queries.ListMonitorsByApplication(context.Background(), pgText(applicationID))
	if err != nil {
		log.Printf("list monitors by application: %v", err)
		return nil
	}

	monitors := make([]domain.Monitor, 0, len(rows))
	for _, row := range rows {
		monitor, err := monitorFromListByApplicationRow(row)
		if err != nil {
			log.Printf("scan monitor: %v", err)
			continue
		}
		monitor.Steps = s.listSteps(monitor.ID)
		monitor.SecretAliases = s.listSecretAliases(monitor.ID)
		monitors = append(monitors, monitor)
	}

	return monitors
}

func (s *PostgresStore) GetMonitor(id string) (domain.Monitor, bool) {
	row, err := s.queries.GetMonitor(context.Background(), id)
	if err != nil {
		return domain.Monitor{}, false
	}
	monitor, err := monitorFromGetRow(row)
	if err != nil {
		log.Printf("scan monitor: %v", err)
		return domain.Monitor{}, false
	}
	monitor.Steps = s.listSteps(monitor.ID)
	monitor.SecretAliases = s.listSecretAliases(monitor.ID)

	return monitor, true
}

func (s *PostgresStore) UpsertMonitor(monitor domain.Monitor) domain.Monitor {
	monitor = NormalizeMonitor(monitor)
	now := time.Now().UTC()
	if monitor.ID == "" {
		monitor.ID = "mon-" + randomID()
	}
	if monitor.CreatedAt.IsZero() {
		monitor.CreatedAt = now
	}
	monitor.UpdatedAt = now
	for index := range monitor.Steps {
		monitor.Steps[index].MonitorID = monitor.ID
		if monitor.Steps[index].ID == "" || s.stepIDBelongsToOtherMonitor(monitor.Steps[index].ID, monitor.ID) {
			monitor.Steps[index].ID = "step-" + randomID()
		}
		if monitor.Steps[index].Order == 0 {
			monitor.Steps[index].Order = index + 1
		}
	}

	ctx := context.Background()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		log.Printf("begin upsert monitor: %v", err)
		return monitor
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	if err := qtx.UpsertMonitor(ctx, pulsedb.UpsertMonitorParams{
		ID:                  monitor.ID,
		ApplicationID:       pgNullableText(monitor.ApplicationID),
		Name:                monitor.Name,
		Description:         pgText(monitor.Description),
		ScheduleMode:        pgText(monitor.ScheduleMode),
		ScheduleLabel:       pgText(monitor.ScheduleLabel),
		ScheduleCron:        pgText(monitor.ScheduleCron),
		Timezone:            pgText(monitor.Timezone),
		TimeoutMs:           pgInt4(monitor.TimeoutMS),
		RetryCount:          pgInt4(monitor.RetryCount),
		FailureThreshold:    pgInt4(monitor.FailureThreshold),
		ResponseBodyLimitKb: pgInt4(monitor.ResponseBodyLimitKB),
		IsActive:            pgBool(monitor.IsActive),
		AlertEnabled:        pgBool(monitor.AlertEnabled),
		VariablesJson:       mustJSON(monitor.Variables),
		AlertPolicyJson:     mustJSON(monitor.AlertPolicy),
		Status:              pgText(string(monitor.Status)),
		LastDurationMs:      pgInt4(monitor.LastDurationMS),
		SuccessRate24h:      pgNumeric(monitor.SuccessRate24H),
		CreatedAt:           pgTimestamp(monitor.CreatedAt),
		UpdatedAt:           pgTimestamp(monitor.UpdatedAt),
		LastRunAt:           pgTimestampPtr(monitor.LastRunAt),
	}); err != nil {
		log.Printf("upsert monitor: %v", err)
		return monitor
	}

	if err := qtx.DeleteMonitorSteps(ctx, pgText(monitor.ID)); err != nil {
		log.Printf("delete monitor steps: %v", err)
		return monitor
	}
	for _, step := range monitor.Steps {
		config := map[string]any{
			"method":           step.Method,
			"url":              step.URL,
			"config":           step.Config,
			"preRequestScript": step.PreRequestScript,
		}
		if err := qtx.InsertMonitorStep(ctx, pulsedb.InsertMonitorStepParams{
			ID:                step.ID,
			MonitorID:         pgText(monitor.ID),
			StepOrder:         int32(step.Order),
			Name:              step.Name,
			StepType:          step.Type,
			ConfigJson:        mustJSON(config),
			ActionsJson:       mustJSON(step.Actions),
			AssertionsJson:    mustJSON(step.Assertions),
			ExtractorsJson:    mustJSON(step.Extractors),
			TimeoutMs:         pgInt4(step.TimeoutMS),
			RetryCount:        pgInt4(step.RetryCount),
			ContinueOnFailure: pgBool(step.ContinueOnFailure),
		}); err != nil {
			log.Printf("insert monitor step: %v", err)
			return monitor
		}
	}

	if err := qtx.DeleteMonitorSecretBindings(ctx, pgText(monitor.ID)); err != nil {
		log.Printf("delete secret bindings: %v", err)
		return monitor
	}
	for _, alias := range monitor.SecretAliases {
		secretID, err := qtx.GetSecretIDForAlias(ctx, alias)
		if err != nil {
			continue
		}
		if err := qtx.UpsertMonitorSecretBinding(ctx, pulsedb.UpsertMonitorSecretBindingParams{
			ID:                "binding-" + monitor.ID + "-" + alias,
			MonitorID:         pgText(monitor.ID),
			SecretReferenceID: pgText(secretID),
			Alias:             alias,
		}); err != nil {
			log.Printf("insert secret binding: %v", err)
			return monitor
		}
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("commit upsert monitor: %v", err)
	}

	s.ensureInitialVersionSnapshot(monitor)

	return monitor
}

func (s *PostgresStore) stepIDBelongsToOtherMonitor(stepID string, monitorID string) bool {
	existingMonitorID, err := s.queries.GetStepMonitorID(context.Background(), stepID)
	if err != nil {
		return false
	}

	return pgTextString(existingMonitorID) != monitorID
}

func (s *PostgresStore) DeleteMonitor(id string) bool {
	count, err := s.queries.DeleteMonitor(context.Background(), id)
	if err != nil {
		log.Printf("delete monitor: %v", err)
		return false
	}

	return count > 0
}

func (s *PostgresStore) SaveRun(run domain.MonitorRun) {
	ctx := context.Background()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		log.Printf("begin save run: %v", err)
		return
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)

	if err := qtx.InsertMonitorRun(ctx, pulsedb.InsertMonitorRunParams{
		ID:              run.ID,
		MonitorID:       pgText(run.MonitorID),
		Status:          pgText(string(run.Status)),
		FailureCategory: pgText(string(run.FailureCategory)),
		FailureReason:   pgText(run.FailureReason),
		TriggeredBy:     pgText(run.TriggeredBy),
		StartedAt:       pgTimestamp(run.StartedAt),
		EndedAt:         pgTimestamp(run.EndedAt),
		DurationMs:      pgInt4(run.DurationMS),
	}); err != nil {
		log.Printf("insert monitor run: %v", err)
		return
	}

	for index, step := range run.Steps {
		if err := qtx.InsertMonitorStepRun(ctx, pulsedb.InsertMonitorStepRunParams{
			ID:                   step.ID,
			MonitorRunID:         pgText(run.ID),
			StepOrder:            pgInt4(index + 1),
			StepName:             pgText(step.StepName),
			StepType:             pgText(step.Type),
			Status:               pgText(string(step.Status)),
			RequestSummaryJson:   mustJSON(map[string]string{"summary": step.RequestSummary}),
			ResponseSummaryJson:  mustJSON(map[string]string{"summary": step.ResponseSummary}),
			AssertionResultsJson: mustJSON(step.Assertions),
			ExtractorResultsJson: mustJSON(step.Extractors),
			ConsoleOutputJson:    mustJSON(step.ConsoleOutput),
			TimingJson:           mustJSON(step.Timing),
			LatencyMs:            pgInt4(step.LatencyMS),
			ErrorMessage:         pgText(step.ErrorMessage),
			StartedAt:            pgTimestamp(run.StartedAt),
			EndedAt:              pgTimestamp(run.EndedAt),
			StepID:               pgNullableText(step.StepID),
		}); err != nil {
			log.Printf("insert step run: %v", err)
			return
		}
	}

	if run.TriggeredBy != "draft" && run.TriggeredBy != "test" {
		if err := qtx.UpdateMonitorAfterRun(ctx, pulsedb.UpdateMonitorAfterRunParams{
			ID:             run.MonitorID,
			Status:         pgText(string(run.Status)),
			LastRunAt:      pgTimestamp(run.EndedAt),
			LastDurationMs: pgInt4(run.DurationMS),
		}); err != nil {
			log.Printf("update monitor after run: %v", err)
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("commit save run: %v", err)
	}
}

func (s *PostgresStore) ListRuns(monitorID string) []domain.MonitorRun {
	rows, err := s.queries.ListRuns(context.Background(), pgNullableText(monitorID))
	if err != nil {
		log.Printf("list runs: %v", err)
		return nil
	}

	runs := make([]domain.MonitorRun, 0, len(rows))
	for _, row := range rows {
		run := runFromListRow(row)
		run.Steps = s.listStepRuns(run.ID)
		runs = append(runs, run)
	}

	return runs
}

func (s *PostgresStore) GetRun(id string) (domain.MonitorRun, bool) {
	row, err := s.queries.GetRun(context.Background(), id)
	if err != nil {
		return domain.MonitorRun{}, false
	}
	run := runFromGetRow(row)
	run.Steps = s.listStepRuns(run.ID)

	return run, true
}

func (s *PostgresStore) ListAlerts() []domain.AlertEvent {
	rows, err := s.queries.ListAlerts(context.Background())
	if err != nil {
		log.Printf("list alerts: %v", err)
		return nil
	}

	alerts := make([]domain.AlertEvent, 0, len(rows))
	for _, row := range rows {
		alerts = append(alerts, alertFromListRow(row))
	}

	return alerts
}

func (s *PostgresStore) SaveAlert(alert domain.AlertEvent) {
	now := time.Now().UTC()
	if alert.ID == "" {
		alert.ID = "alert-" + randomID()
	}
	if alert.CreatedAt.IsZero() {
		alert.CreatedAt = now
	}
	alert.UpdatedAt = now
	if err := s.queries.UpsertAlert(context.Background(), pulsedb.UpsertAlertParams{
		ID:                alert.ID,
		MonitorID:         pgText(alert.MonitorID),
		Status:            pgText(string(alert.Status)),
		Severity:          pgText(alert.Severity),
		Title:             pgText(alert.Title),
		Description:       pgText(alert.Description),
		FailureCategory:   pgText(string(alert.FailureCategory)),
		ChannelsJson:      mustJSON(alert.Channels),
		DeliveriesJson:    mustJSON(alert.Deliveries),
		FirstTriggeredAt:  pgTimestamp(alert.FirstTriggeredAt),
		LastTriggeredAt:   pgTimestamp(alert.LastTriggeredAt),
		CreatedAt:         pgTimestamp(alert.CreatedAt),
		UpdatedAt:         pgTimestamp(alert.UpdatedAt),
		RunID:             pgNullableText(alert.RunID),
		LastDeliveredAt:   pgTimestampPtr(alert.LastDeliveredAt),
		ResolvedAt:        pgTimestampPtr(alert.ResolvedAt),
		AcknowledgedBy:    pgNullableText(alert.AcknowledgedBy),
		AcknowledgedAt:    pgTimestampPtr(alert.AcknowledgedAt),
		SnoozedUntil:      pgTimestampPtr(alert.SnoozedUntil),
		SuppressionReason: pgNullableText(alert.SuppressionReason),
	}); err != nil {
		log.Printf("save alert: %v", err)
	}
}

func (s *PostgresStore) ListSecrets() []domain.SecretReference {
	rows, err := s.queries.ListSecrets(context.Background())
	if err != nil {
		log.Printf("list secrets: %v", err)
		return nil
	}

	secrets := make([]domain.SecretReference, 0, len(rows))
	for _, row := range rows {
		secrets = append(secrets, secretFromListRow(row))
	}

	return secrets
}

func (s *PostgresStore) GetSecret(id string) (domain.SecretReference, bool) {
	row, err := s.queries.GetSecret(context.Background(), id)
	if err != nil {
		return domain.SecretReference{}, false
	}

	return secretFromGetRow(row), true
}

func (s *PostgresStore) GetRawSecretValue(alias string) (string, bool) {
	row, err := s.queries.GetRawSecretByAlias(context.Background(), alias)
	if err != nil {
		return "", false
	}
	plaintext, err := s.codec.Decrypt(row.EncryptedValue, secretAssociatedData(row.ID))
	if err != nil {
		log.Printf("decrypt secret %s: %v", row.ID, err)
		return "", false
	}

	return plaintext, true
}

func (s *PostgresStore) listSteps(monitorID string) []domain.MonitorStep {
	rows, err := s.queries.ListSteps(context.Background(), pgText(monitorID))
	if err != nil {
		log.Printf("list steps: %v", err)
		return nil
	}

	steps := make([]domain.MonitorStep, 0, len(rows))
	for _, row := range rows {
		var config struct {
			Method           string         `json:"method"`
			URL              string         `json:"url"`
			Config           map[string]any `json:"config"`
			PreRequestScript string         `json:"preRequestScript"`
		}
		_ = json.Unmarshal(row.ConfigJson, &config)
		step := domain.MonitorStep{
			ID:                row.ID,
			MonitorID:         pgTextString(row.MonitorID),
			Order:             int(row.StepOrder),
			Name:              row.Name,
			Type:              row.StepType,
			Method:            config.Method,
			URL:               config.URL,
			Config:            config.Config,
			PreRequestScript:  config.PreRequestScript,
			TimeoutMS:         int(row.TimeoutMs),
			RetryCount:        int(row.RetryCount),
			ContinueOnFailure: row.ContinueOnFailure,
		}
		_ = json.Unmarshal(row.ActionsJson, &step.Actions)
		_ = json.Unmarshal(row.AssertionsJson, &step.Assertions)
		_ = json.Unmarshal(row.ExtractorsJson, &step.Extractors)
		steps = append(steps, step)
	}

	return steps
}

func (s *PostgresStore) listSecretAliases(monitorID string) []string {
	aliases, err := s.queries.ListSecretAliases(context.Background(), pgText(monitorID))
	if err != nil {
		log.Printf("list secret aliases: %v", err)
		return nil
	}

	return aliases
}

func (s *PostgresStore) listStepRuns(runID string) []domain.StepRun {
	rows, err := s.queries.ListStepRuns(context.Background(), pgText(runID))
	if err != nil {
		log.Printf("list step runs: %v", err)
		return nil
	}

	steps := make([]domain.StepRun, 0, len(rows))
	for _, row := range rows {
		step := domain.StepRun{
			ID:              row.ID,
			StepID:          row.StepID,
			StepName:        row.StepName,
			Type:            row.StepType,
			Status:          domain.MonitorStatus(row.Status),
			RequestSummary:  summaryFromJSON(row.RequestSummaryJson),
			ResponseSummary: summaryFromJSON(row.ResponseSummaryJson),
			LatencyMS:       int(row.LatencyMs),
			ErrorMessage:    row.ErrorMessage,
		}
		_ = json.Unmarshal(row.AssertionResultsJson, &step.Assertions)
		_ = json.Unmarshal(row.ExtractorResultsJson, &step.Extractors)
		_ = json.Unmarshal(row.ConsoleOutputJson, &step.ConsoleOutput)
		_ = json.Unmarshal(row.TimingJson, &step.Timing)
		steps = append(steps, step)
	}

	return steps
}

func (s *PostgresStore) seedDefaults(ctx context.Context) error {
	memory := NewMemoryStore()
	if len(s.ListApplications()) == 0 {
		for _, application := range memory.ListApplications() {
			s.UpsertApplication(application)
		}
	}

	count, err := s.queries.CountMonitors(ctx)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	for _, secret := range memory.secrets {
		if _, err := s.UpsertSecret(secret); err != nil {
			return err
		}
	}
	for _, monitor := range memory.ListMonitors() {
		s.UpsertMonitor(monitor)
	}

	return nil
}

func (s *PostgresStore) UpsertSecret(secret domain.SecretReference) (domain.SecretReference, error) {
	if secret.ID == "" {
		secret.ID = "sec-" + randomID()
	}
	if secret.Provider == "" {
		secret.Provider = "encrypted-db"
	}
	if secret.MaskedValue == "" {
		secret.MaskedValue = "********"
	}
	encryptedValue, err := s.encryptedValueForSecret(secret)
	if err != nil {
		return domain.SecretReference{}, err
	}

	if err := s.queries.UpsertSecret(context.Background(), pulsedb.UpsertSecretParams{
		ID:             secret.ID,
		Name:           secret.Name,
		Alias:          secret.Alias,
		Description:    pgText(secret.Description),
		Provider:       secret.Provider,
		EncryptedValue: pgText(encryptedValue),
		IsActive:       pgBool(secret.IsActive),
		SecretPath:     pgNullableText(secret.SecretPath),
		SecretKey:      pgNullableText(secret.SecretKey),
	}); err != nil {
		return domain.SecretReference{}, err
	}

	saved, ok := s.GetSecret(secret.ID)
	if !ok {
		return domain.SecretReference{}, pgx.ErrNoRows
	}

	return saved, nil
}

func (s *PostgresStore) encryptedValueForSecret(secret domain.SecretReference) (string, error) {
	if secret.RawValue != "" {
		return s.codec.Encrypt(secret.RawValue, secretAssociatedData(secret.ID))
	}

	existing, err := s.queries.GetEncryptedSecretByID(context.Background(), secret.ID)
	if err == nil && existing != "" {
		return existing, nil
	}
	if err != nil && err != pgx.ErrNoRows {
		return "", err
	}

	return "", pgx.ErrNoRows
}

func (s *PostgresStore) DeleteSecret(id string) bool {
	count, err := s.queries.DeleteSecret(context.Background(), id)
	if err != nil {
		log.Printf("delete secret: %v", err)
		return false
	}
	return count > 0
}

func storeDefaults(monitor domain.Monitor) domain.Monitor {
	monitor = NormalizeMonitor(monitor)
	if monitor.AlertPolicy.Enabled {
		monitor.AlertEnabled = true
	}

	return monitor
}

func mustJSON(value any) []byte {
	encoded, err := json.Marshal(value)
	if err != nil {
		return []byte("{}")
	}

	return encoded
}

func summaryFromJSON(value []byte) string {
	var payload map[string]string
	if err := json.Unmarshal(value, &payload); err != nil {
		return ""
	}

	return payload["summary"]
}

func applicationFromListRow(row pulsedb.ListApplicationsRow) domain.Application {
	application := domain.Application{
		ID:          row.ID,
		Name:        row.Name,
		CarID:       row.CarID,
		Description: row.Description,
		Owner:       row.Owner,
		Environment: row.Environment,
		CreatedAt:   pgTime(row.CreatedAt),
		UpdatedAt:   pgTime(row.UpdatedAt),
	}
	_ = json.Unmarshal(row.TagsJson, &application.Tags)
	_ = json.Unmarshal(row.AlertRoutingJson, &application.AlertRouting)
	if application.Tags == nil {
		application.Tags = []string{}
	}
	return application
}

func applicationFromGetRow(row pulsedb.GetApplicationRow) domain.Application {
	application := domain.Application{
		ID:          row.ID,
		Name:        row.Name,
		CarID:       row.CarID,
		Description: row.Description,
		Owner:       row.Owner,
		Environment: row.Environment,
		CreatedAt:   pgTime(row.CreatedAt),
		UpdatedAt:   pgTime(row.UpdatedAt),
	}
	_ = json.Unmarshal(row.TagsJson, &application.Tags)
	_ = json.Unmarshal(row.AlertRoutingJson, &application.AlertRouting)
	if application.Tags == nil {
		application.Tags = []string{}
	}
	return application
}

func monitorFromListRow(row pulsedb.ListMonitorsRow) (domain.Monitor, error) {
	monitor := domain.Monitor{
		ID:                  row.ID,
		ApplicationID:       row.ApplicationID,
		Name:                row.Name,
		Description:         row.Description,
		ScheduleMode:        row.ScheduleMode,
		ScheduleLabel:       row.ScheduleLabel,
		ScheduleCron:        row.ScheduleCron,
		Cron:                row.ScheduleCron,
		Timezone:            row.Timezone,
		TimeoutMS:           int(row.TimeoutMs),
		RetryCount:          int(row.RetryCount),
		FailureThreshold:    int(row.FailureThreshold),
		ResponseBodyLimitKB: int(row.ResponseBodyLimitKb),
		IsActive:            row.IsActive,
		AlertEnabled:        row.AlertEnabled,
		Status:              domain.MonitorStatus(row.Status),
		LastRunAt:           pgTimePtr(row.LastRunAt),
		LastDurationMS:      int(row.LastDurationMs),
		SuccessRate24H:      row.SuccessRate24h,
		PublishedVersion:    int(row.PublishedVersion),
		HasUnpublishedDraft: row.HasUnpublishedDraft,
		CreatedAt:           pgTime(row.CreatedAt),
		UpdatedAt:           pgTime(row.UpdatedAt),
	}
	if err := json.Unmarshal(row.VariablesJson, &monitor.Variables); err != nil {
		monitor.Variables = map[string]string{}
	}
	if err := json.Unmarshal(row.AlertPolicyJson, &monitor.AlertPolicy); err != nil {
		monitor.AlertPolicy = domain.AlertPolicy{}
	}

	return storeDefaults(monitor), nil
}

func monitorFromListByApplicationRow(row pulsedb.ListMonitorsByApplicationRow) (domain.Monitor, error) {
	return monitorFromListRow(pulsedb.ListMonitorsRow(row))
}

func monitorFromGetRow(row pulsedb.GetMonitorRow) (domain.Monitor, error) {
	monitor := domain.Monitor{
		ID:                  row.ID,
		ApplicationID:       row.ApplicationID,
		Name:                row.Name,
		Description:         row.Description,
		ScheduleMode:        row.ScheduleMode,
		ScheduleLabel:       row.ScheduleLabel,
		ScheduleCron:        row.ScheduleCron,
		Cron:                row.ScheduleCron,
		Timezone:            row.Timezone,
		TimeoutMS:           int(row.TimeoutMs),
		RetryCount:          int(row.RetryCount),
		FailureThreshold:    int(row.FailureThreshold),
		ResponseBodyLimitKB: int(row.ResponseBodyLimitKb),
		IsActive:            row.IsActive,
		AlertEnabled:        row.AlertEnabled,
		Status:              domain.MonitorStatus(row.Status),
		LastRunAt:           pgTimePtr(row.LastRunAt),
		LastDurationMS:      int(row.LastDurationMs),
		SuccessRate24H:      row.SuccessRate24h,
		PublishedVersion:    int(row.PublishedVersion),
		HasUnpublishedDraft: row.HasUnpublishedDraft,
		CreatedAt:           pgTime(row.CreatedAt),
		UpdatedAt:           pgTime(row.UpdatedAt),
	}
	if err := json.Unmarshal(row.VariablesJson, &monitor.Variables); err != nil {
		monitor.Variables = map[string]string{}
	}
	if err := json.Unmarshal(row.AlertPolicyJson, &monitor.AlertPolicy); err != nil {
		monitor.AlertPolicy = domain.AlertPolicy{}
	}

	return storeDefaults(monitor), nil
}

func runFromListRow(row pulsedb.ListRunsRow) domain.MonitorRun {
	return domain.MonitorRun{
		ID:              row.ID,
		MonitorID:       pgTextString(row.MonitorID),
		MonitorName:     row.MonitorName,
		Status:          domain.MonitorStatus(row.Status),
		FailureCategory: domain.FailureCategory(row.FailureCategory),
		FailureReason:   row.FailureReason,
		TriggeredBy:     row.TriggeredBy,
		StartedAt:       pgTime(row.StartedAt),
		EndedAt:         pgTime(row.EndedAt),
		DurationMS:      int(row.DurationMs),
	}
}

func runFromGetRow(row pulsedb.GetRunRow) domain.MonitorRun {
	return domain.MonitorRun{
		ID:              row.ID,
		MonitorID:       pgTextString(row.MonitorID),
		MonitorName:     row.MonitorName,
		Status:          domain.MonitorStatus(row.Status),
		FailureCategory: domain.FailureCategory(row.FailureCategory),
		FailureReason:   row.FailureReason,
		TriggeredBy:     row.TriggeredBy,
		StartedAt:       pgTime(row.StartedAt),
		EndedAt:         pgTime(row.EndedAt),
		DurationMS:      int(row.DurationMs),
	}
}

func alertFromListRow(row pulsedb.ListAlertsRow) domain.AlertEvent {
	alert := domain.AlertEvent{
		ID:               row.ID,
		MonitorID:        pgTextString(row.MonitorID),
		RunID:            row.RunID,
		Status:           domain.AlertStatus(row.Status),
		Severity:         row.Severity,
		Title:            row.Title,
		Description:      row.Description,
		FailureCategory:  domain.FailureCategory(row.FailureCategory),
		FirstTriggeredAt: pgTime(row.FirstTriggeredAt),
		LastTriggeredAt:  pgTime(row.LastTriggeredAt),
		CreatedAt:        pgTime(row.CreatedAt),
		UpdatedAt:        pgTime(row.UpdatedAt),
	}
	return populateAlertFields(&alert, row.LastDeliveredAt, row.ResolvedAt, row.AcknowledgedAt, row.SnoozedUntil, row.AcknowledgedBy, row.SuppressionReason, row.ChannelsJson, row.DeliveriesJson)
}

func alertFromGetRow(row pulsedb.GetAlertRow) domain.AlertEvent {
	alert := domain.AlertEvent{
		ID:               row.ID,
		MonitorID:        pgTextString(row.MonitorID),
		RunID:            row.RunID,
		Status:           domain.AlertStatus(row.Status),
		Severity:         row.Severity,
		Title:            row.Title,
		Description:      row.Description,
		FailureCategory:  domain.FailureCategory(row.FailureCategory),
		FirstTriggeredAt: pgTime(row.FirstTriggeredAt),
		LastTriggeredAt:  pgTime(row.LastTriggeredAt),
		CreatedAt:        pgTime(row.CreatedAt),
		UpdatedAt:        pgTime(row.UpdatedAt),
	}
	return populateAlertFields(&alert, row.LastDeliveredAt, row.ResolvedAt, row.AcknowledgedAt, row.SnoozedUntil, row.AcknowledgedBy, row.SuppressionReason, row.ChannelsJson, row.DeliveriesJson)
}

func alertFromActiveRow(row pulsedb.GetActiveAlertRow) domain.AlertEvent {
	alert := domain.AlertEvent{
		ID:               row.ID,
		MonitorID:        pgTextString(row.MonitorID),
		RunID:            row.RunID,
		Status:           domain.AlertStatus(row.Status),
		Severity:         row.Severity,
		Title:            row.Title,
		Description:      row.Description,
		FailureCategory:  domain.FailureCategory(row.FailureCategory),
		FirstTriggeredAt: pgTime(row.FirstTriggeredAt),
		LastTriggeredAt:  pgTime(row.LastTriggeredAt),
		CreatedAt:        pgTime(row.CreatedAt),
		UpdatedAt:        pgTime(row.UpdatedAt),
	}
	return populateAlertFields(&alert, row.LastDeliveredAt, row.ResolvedAt, row.AcknowledgedAt, row.SnoozedUntil, row.AcknowledgedBy, row.SuppressionReason, row.ChannelsJson, row.DeliveriesJson)
}

func populateAlertFields(alert *domain.AlertEvent, lastDelivered, resolved, acknowledgedAt, snoozedUntil pgtype.Timestamp, acknowledgedBy, suppressionReason string, channelsJSON, deliveriesJSON []byte) domain.AlertEvent {
	alert.LastDeliveredAt = pgTimePtr(lastDelivered)
	alert.ResolvedAt = pgTimePtr(resolved)
	alert.AcknowledgedBy = acknowledgedBy
	alert.AcknowledgedAt = pgTimePtr(acknowledgedAt)
	alert.SnoozedUntil = pgTimePtr(snoozedUntil)
	alert.SuppressionReason = suppressionReason
	_ = json.Unmarshal(channelsJSON, &alert.Channels)
	_ = json.Unmarshal(deliveriesJSON, &alert.Deliveries)
	if alert.Channels == nil {
		alert.Channels = []string{}
	}
	if alert.Deliveries == nil {
		alert.Deliveries = []domain.AlertDelivery{}
	}
	return *alert
}

func secretFromListRow(row pulsedb.ListSecretsRow) domain.SecretReference {
	return domain.SecretReference{
		ID:           row.ID,
		Name:         row.Name,
		Alias:        row.Alias,
		Provider:     row.Provider,
		Description:  row.Description,
		SecretPath:   row.SecretPath,
		SecretKey:    row.SecretKey,
		MaskedValue:  "********",
		IsActive:     row.IsActive.Bool,
		LastTestedAt: pgTime(row.CreatedAt),
	}
}

func secretFromGetRow(row pulsedb.GetSecretRow) domain.SecretReference {
	return domain.SecretReference{
		ID:           row.ID,
		Name:         row.Name,
		Alias:        row.Alias,
		Provider:     row.Provider,
		Description:  row.Description,
		SecretPath:   row.SecretPath,
		SecretKey:    row.SecretKey,
		MaskedValue:  "********",
		IsActive:     row.IsActive.Bool,
		LastTestedAt: pgTime(row.CreatedAt),
	}
}

func pgText(value string) pgtype.Text {
	return pgtype.Text{String: value, Valid: true}
}

func pgInt4(value int) pgtype.Int4 {
	return pgtype.Int4{Int32: int32(value), Valid: true}
}

func pgNullableText(value string) pgtype.Text {
	if value == "" {
		return pgtype.Text{}
	}

	return pgText(value)
}

func pgBool(value bool) pgtype.Bool {
	return pgtype.Bool{Bool: value, Valid: true}
}

func pgNumeric(value float64) pgtype.Numeric {
	var numeric pgtype.Numeric
	if err := numeric.Scan(strconv.FormatFloat(value, 'f', -1, 64)); err != nil {
		return pgtype.Numeric{}
	}

	return numeric
}

func pgTimestamp(value time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: value, Valid: true}
}

func pgTimestampPtr(value *time.Time) pgtype.Timestamp {
	if value == nil {
		return pgtype.Timestamp{}
	}

	return pgTimestamp(*value)
}

func pgTextString(value pgtype.Text) string {
	if !value.Valid {
		return ""
	}

	return value.String
}

func pgTime(value pgtype.Timestamp) time.Time {
	if !value.Valid {
		return time.Time{}
	}

	return value.Time
}

func pgTimePtr(value pgtype.Timestamp) *time.Time {
	if !value.Valid {
		return nil
	}
	timeValue := value.Time

	return &timeValue
}

func secretAssociatedData(id string) string {
	return "secret:" + id
}
