package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/secretcrypto"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type PostgresStore struct {
	db    *sql.DB
	codec *secretcrypto.Codec
}

func NewPostgresStore(ctx context.Context, databaseURL string, codec *secretcrypto.Codec) (*PostgresStore, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}
	if err := db.PingContext(ctx); err != nil {
		return nil, err
	}

	store := &PostgresStore{db: db, codec: codec}
	if err := store.ensureSchema(ctx); err != nil {
		return nil, err
	}
	if err := store.seedDefaults(ctx); err != nil {
		return nil, err
	}

	return store, nil
}

func (s *PostgresStore) ensureSchema(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
		ALTER TABLE monitor_step_runs
		ADD COLUMN IF NOT EXISTS console_output_json JSONB DEFAULT '[]'::jsonb
	`)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		ALTER TABLE monitor_step_runs
		DROP CONSTRAINT IF EXISTS monitor_step_runs_step_id_fkey;

		ALTER TABLE monitor_step_runs
		ADD CONSTRAINT monitor_step_runs_step_id_fkey
		FOREIGN KEY (step_id) REFERENCES monitor_steps(id) ON DELETE SET NULL
	`)
	if err != nil {
		return err
	}

	return s.backfillLegacySecrets(ctx)
}

func (s *PostgresStore) backfillLegacySecrets(ctx context.Context) error {
	defaults := map[string]string{
		"clientId":     "demo-client-id",
		"privateKey":   "demo-private-key",
		"slackWebhook": "https://hooks.slack.example/demo",
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, alias
		FROM secret_references
		WHERE COALESCE(encrypted_value, '') = '' OR encrypted_value = 'encrypted-placeholder'
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	type legacySecret struct {
		id    string
		alias string
	}
	legacy := []legacySecret{}
	for rows.Next() {
		var item legacySecret
		if err := rows.Scan(&item.id, &item.alias); err != nil {
			return err
		}
		legacy = append(legacy, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, item := range legacy {
		raw, ok := defaults[item.alias]
		if !ok {
			continue
		}
		encrypted, err := s.codec.Encrypt(raw, secretAssociatedData(item.id))
		if err != nil {
			return err
		}
		if _, err := s.db.ExecContext(ctx, `UPDATE secret_references SET encrypted_value = $2, updated_at = NOW() WHERE id = $1`, item.id, encrypted); err != nil {
			return err
		}
	}

	return nil
}

func (s *PostgresStore) ListMonitors() []domain.Monitor {
	rows, err := s.db.Query(`
		SELECT id, name, COALESCE(description, ''), COALESCE(schedule_mode, ''), COALESCE(schedule_label, ''),
		       COALESCE(schedule_cron, ''), COALESCE(timezone, 'UTC'), timeout_ms, retry_count,
		       failure_threshold, response_body_limit_kb, is_active, alert_enabled, variables_json,
		       alert_policy_json, COALESCE(status, ''), last_run_at, last_duration_ms,
		       COALESCE(success_rate_24h, 0), created_at, updated_at
		FROM monitors
		ORDER BY created_at DESC
	`)
	if err != nil {
		log.Printf("list monitors: %v", err)
		return nil
	}
	defer rows.Close()

	monitors := []domain.Monitor{}
	for rows.Next() {
		monitor, err := s.scanMonitor(rows)
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
	row := s.db.QueryRow(`
		SELECT id, name, COALESCE(description, ''), COALESCE(schedule_mode, ''), COALESCE(schedule_label, ''),
		       COALESCE(schedule_cron, ''), COALESCE(timezone, 'UTC'), timeout_ms, retry_count,
		       failure_threshold, response_body_limit_kb, is_active, alert_enabled, variables_json,
		       alert_policy_json, COALESCE(status, ''), last_run_at, last_duration_ms,
		       COALESCE(success_rate_24h, 0), created_at, updated_at
		FROM monitors
		WHERE id = $1
	`, id)
	monitor, err := s.scanMonitor(row)
	if err != nil {
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

	tx, err := s.db.Begin()
	if err != nil {
		log.Printf("begin upsert monitor: %v", err)
		return monitor
	}
	defer tx.Rollback()

	variablesJSON := mustJSON(monitor.Variables)
	alertPolicyJSON := mustJSON(monitor.AlertPolicy)
	_, err = tx.Exec(`
		INSERT INTO monitors (
			id, name, description, schedule_mode, schedule_label, schedule_cron, timezone,
			timeout_ms, retry_count, failure_threshold, response_body_limit_kb, is_active,
			alert_enabled, variables_json, alert_policy_json, status, last_run_at,
			last_duration_ms, success_rate_24h, created_at, updated_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			schedule_mode = EXCLUDED.schedule_mode,
			schedule_label = EXCLUDED.schedule_label,
			schedule_cron = EXCLUDED.schedule_cron,
			timezone = EXCLUDED.timezone,
			timeout_ms = EXCLUDED.timeout_ms,
			retry_count = EXCLUDED.retry_count,
			failure_threshold = EXCLUDED.failure_threshold,
			response_body_limit_kb = EXCLUDED.response_body_limit_kb,
			is_active = EXCLUDED.is_active,
			alert_enabled = EXCLUDED.alert_enabled,
			variables_json = EXCLUDED.variables_json,
			alert_policy_json = EXCLUDED.alert_policy_json,
			status = EXCLUDED.status,
			last_run_at = EXCLUDED.last_run_at,
			last_duration_ms = EXCLUDED.last_duration_ms,
			success_rate_24h = EXCLUDED.success_rate_24h,
			updated_at = EXCLUDED.updated_at
	`, monitor.ID, monitor.Name, monitor.Description, monitor.ScheduleMode, monitor.ScheduleLabel,
		monitor.ScheduleCron, monitor.Timezone, monitor.TimeoutMS, monitor.RetryCount,
		monitor.FailureThreshold, monitor.ResponseBodyLimitKB, monitor.IsActive, monitor.AlertEnabled,
		variablesJSON, alertPolicyJSON, string(monitor.Status), monitor.LastRunAt, monitor.LastDurationMS,
		monitor.SuccessRate24H, monitor.CreatedAt, monitor.UpdatedAt)
	if err != nil {
		log.Printf("upsert monitor: %v", err)
		return monitor
	}

	if _, err := tx.Exec(`DELETE FROM monitor_steps WHERE monitor_id = $1`, monitor.ID); err != nil {
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
		if _, err := tx.Exec(`
			INSERT INTO monitor_steps (
				id, monitor_id, step_order, name, step_type, config_json, actions_json,
				assertions_json, extractors_json, timeout_ms, retry_count, continue_on_failure, updated_at
			)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
		`, step.ID, monitor.ID, step.Order, step.Name, step.Type, mustJSON(config),
			mustJSON(step.Actions), mustJSON(step.Assertions), mustJSON(step.Extractors),
			step.TimeoutMS, step.RetryCount, step.ContinueOnFailure); err != nil {
			log.Printf("insert monitor step: %v", err)
			return monitor
		}
	}

	if _, err := tx.Exec(`DELETE FROM monitor_secret_bindings WHERE monitor_id = $1`, monitor.ID); err != nil {
		log.Printf("delete secret bindings: %v", err)
		return monitor
	}
	for _, alias := range monitor.SecretAliases {
		secretID := s.secretIDForAliasTx(tx, alias)
		if secretID == "" {
			continue
		}
		if _, err := tx.Exec(`
			INSERT INTO monitor_secret_bindings (id, monitor_id, secret_reference_id, alias)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT (monitor_id, alias) DO UPDATE SET secret_reference_id = EXCLUDED.secret_reference_id
		`, "binding-"+monitor.ID+"-"+alias, monitor.ID, secretID, alias); err != nil {
			log.Printf("insert secret binding: %v", err)
			return monitor
		}
	}

	if err := tx.Commit(); err != nil {
		log.Printf("commit upsert monitor: %v", err)
	}

	return monitor
}

func (s *PostgresStore) stepIDBelongsToOtherMonitor(stepID string, monitorID string) bool {
	var existingMonitorID string
	err := s.db.QueryRow(`SELECT monitor_id FROM monitor_steps WHERE id = $1`, stepID).Scan(&existingMonitorID)
	if err != nil {
		return false
	}

	return existingMonitorID != monitorID
}

func (s *PostgresStore) DeleteMonitor(id string) bool {
	result, err := s.db.Exec(`DELETE FROM monitors WHERE id = $1`, id)
	if err != nil {
		log.Printf("delete monitor: %v", err)
		return false
	}
	count, _ := result.RowsAffected()

	return count > 0
}

func (s *PostgresStore) SaveRun(run domain.MonitorRun) {
	tx, err := s.db.Begin()
	if err != nil {
		log.Printf("begin save run: %v", err)
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO monitor_runs (
			id, monitor_id, status, failure_category, failure_reason, triggered_by,
			started_at, ended_at, duration_ms
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (id) DO NOTHING
	`, run.ID, run.MonitorID, string(run.Status), string(run.FailureCategory), run.FailureReason,
		run.TriggeredBy, run.StartedAt, run.EndedAt, run.DurationMS)
	if err != nil {
		log.Printf("insert monitor run: %v", err)
		return
	}

	for index, step := range run.Steps {
		_, err := tx.Exec(`
			INSERT INTO monitor_step_runs (
				id, monitor_run_id, step_id, step_order, step_name, step_type, status,
				request_summary_json, response_summary_json, assertion_results_json,
				extractor_results_json, console_output_json, latency_ms, error_message, started_at, ended_at
			)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
			ON CONFLICT (id) DO NOTHING
		`, step.ID, run.ID, step.StepID, index+1, step.StepName, step.Type, string(step.Status),
			mustJSON(map[string]string{"summary": step.RequestSummary}),
			mustJSON(map[string]string{"summary": step.ResponseSummary}),
			mustJSON(step.Assertions), mustJSON(step.Extractors), mustJSON(step.ConsoleOutput), step.LatencyMS,
			step.ErrorMessage, run.StartedAt, run.EndedAt)
		if err != nil {
			log.Printf("insert step run: %v", err)
			return
		}
	}

	_, err = tx.Exec(`
		UPDATE monitors
		SET status = $2, last_run_at = $3, last_duration_ms = $4, updated_at = NOW()
		WHERE id = $1
	`, run.MonitorID, string(run.Status), run.EndedAt, run.DurationMS)
	if err != nil {
		log.Printf("update monitor after run: %v", err)
		return
	}

	if err := tx.Commit(); err != nil {
		log.Printf("commit save run: %v", err)
	}
}

func (s *PostgresStore) ListRuns(monitorID string) []domain.MonitorRun {
	query := `
		SELECT r.id, r.monitor_id, COALESCE(m.name, ''), r.status, COALESCE(r.failure_category, ''),
		       COALESCE(r.failure_reason, ''), COALESCE(r.triggered_by, ''), r.started_at,
		       r.ended_at, r.duration_ms
		FROM monitor_runs r
		LEFT JOIN monitors m ON m.id = r.monitor_id
	`
	args := []any{}
	if monitorID != "" {
		query += ` WHERE r.monitor_id = $1`
		args = append(args, monitorID)
	}
	query += ` ORDER BY r.started_at DESC`

	rows, err := s.db.Query(query, args...)
	if err != nil {
		log.Printf("list runs: %v", err)
		return nil
	}
	defer rows.Close()

	runs := []domain.MonitorRun{}
	for rows.Next() {
		run, err := s.scanRun(rows)
		if err != nil {
			log.Printf("scan run: %v", err)
			continue
		}
		run.Steps = s.listStepRuns(run.ID)
		runs = append(runs, run)
	}

	return runs
}

func (s *PostgresStore) GetRun(id string) (domain.MonitorRun, bool) {
	row := s.db.QueryRow(`
		SELECT r.id, r.monitor_id, COALESCE(m.name, ''), r.status, COALESCE(r.failure_category, ''),
		       COALESCE(r.failure_reason, ''), COALESCE(r.triggered_by, ''), r.started_at,
		       r.ended_at, r.duration_ms
		FROM monitor_runs r
		LEFT JOIN monitors m ON m.id = r.monitor_id
		WHERE r.id = $1
	`, id)
	run, err := s.scanRun(row)
	if err != nil {
		return domain.MonitorRun{}, false
	}
	run.Steps = s.listStepRuns(run.ID)

	return run, true
}

func (s *PostgresStore) ListSecrets() []domain.SecretReference {
	rows, err := s.db.Query(`
		SELECT id, name, alias, provider, COALESCE(description, ''), COALESCE(secret_path, ''),
		       COALESCE(secret_key, ''), is_active, created_at
		FROM secret_references
		ORDER BY created_at DESC
	`)
	if err != nil {
		log.Printf("list secrets: %v", err)
		return nil
	}
	defer rows.Close()

	secrets := []domain.SecretReference{}
	for rows.Next() {
		secret, err := scanSecret(rows)
		if err != nil {
			log.Printf("scan secret: %v", err)
			continue
		}
		secrets = append(secrets, secret)
	}

	return secrets
}

func (s *PostgresStore) GetSecret(id string) (domain.SecretReference, bool) {
	row := s.db.QueryRow(`
		SELECT id, name, alias, provider, COALESCE(description, ''), COALESCE(secret_path, ''),
		       COALESCE(secret_key, ''), is_active, created_at
		FROM secret_references
		WHERE id = $1
	`, id)
	secret, err := scanSecret(row)
	if err != nil {
		return domain.SecretReference{}, false
	}

	return secret, true
}

func (s *PostgresStore) GetRawSecretValue(alias string) (string, bool) {
	var id string
	var val string
	err := s.db.QueryRow(`SELECT id, COALESCE(encrypted_value, '') FROM secret_references WHERE alias = $1 AND is_active = TRUE`, alias).Scan(&id, &val)
	if err != nil {
		return "", false
	}
	plaintext, err := s.codec.Decrypt(val, secretAssociatedData(id))
	if err != nil {
		log.Printf("decrypt secret %s: %v", id, err)
		return "", false
	}

	return plaintext, true
}

type rowScanner interface {
	Scan(dest ...any) error
}

func (s *PostgresStore) scanMonitor(row rowScanner) (domain.Monitor, error) {
	var monitor domain.Monitor
	var variablesJSON []byte
	var alertPolicyJSON []byte
	var status string
	var lastRunAt sql.NullTime

	err := row.Scan(&monitor.ID, &monitor.Name, &monitor.Description, &monitor.ScheduleMode,
		&monitor.ScheduleLabel, &monitor.ScheduleCron, &monitor.Timezone, &monitor.TimeoutMS,
		&monitor.RetryCount, &monitor.FailureThreshold, &monitor.ResponseBodyLimitKB,
		&monitor.IsActive, &monitor.AlertEnabled, &variablesJSON, &alertPolicyJSON,
		&status, &lastRunAt, &monitor.LastDurationMS, &monitor.SuccessRate24H,
		&monitor.CreatedAt, &monitor.UpdatedAt)
	if err != nil {
		return monitor, err
	}
	if err := json.Unmarshal(variablesJSON, &monitor.Variables); err != nil {
		monitor.Variables = map[string]string{}
	}
	if err := json.Unmarshal(alertPolicyJSON, &monitor.AlertPolicy); err != nil {
		monitor.AlertPolicy = domain.AlertPolicy{}
	}
	monitor.Status = domain.MonitorStatus(status)
	if lastRunAt.Valid {
		monitor.LastRunAt = &lastRunAt.Time
	}
	monitor.Cron = monitor.ScheduleCron

	return storeDefaults(monitor), nil
}

func (s *PostgresStore) listSteps(monitorID string) []domain.MonitorStep {
	rows, err := s.db.Query(`
		SELECT id, monitor_id, step_order, name, step_type, config_json, actions_json,
		       assertions_json, extractors_json, COALESCE(timeout_ms, 0), retry_count, continue_on_failure
		FROM monitor_steps
		WHERE monitor_id = $1
		ORDER BY step_order
	`, monitorID)
	if err != nil {
		log.Printf("list steps: %v", err)
		return nil
	}
	defer rows.Close()

	steps := []domain.MonitorStep{}
	for rows.Next() {
		var step domain.MonitorStep
		var configJSON []byte
		var actionsJSON []byte
		var assertionsJSON []byte
		var extractorsJSON []byte
		if err := rows.Scan(&step.ID, &step.MonitorID, &step.Order, &step.Name, &step.Type,
			&configJSON, &actionsJSON, &assertionsJSON, &extractorsJSON, &step.TimeoutMS,
			&step.RetryCount, &step.ContinueOnFailure); err != nil {
			log.Printf("scan step: %v", err)
			continue
		}
		var config struct {
			Method           string         `json:"method"`
			URL              string         `json:"url"`
			Config           map[string]any `json:"config"`
			PreRequestScript string         `json:"preRequestScript"`
		}
		_ = json.Unmarshal(configJSON, &config)
		step.Method = config.Method
		step.URL = config.URL
		step.Config = config.Config
		step.PreRequestScript = config.PreRequestScript
		_ = json.Unmarshal(actionsJSON, &step.Actions)
		_ = json.Unmarshal(assertionsJSON, &step.Assertions)
		_ = json.Unmarshal(extractorsJSON, &step.Extractors)
		steps = append(steps, step)
	}

	return steps
}

func (s *PostgresStore) listSecretAliases(monitorID string) []string {
	rows, err := s.db.Query(`
		SELECT alias
		FROM monitor_secret_bindings
		WHERE monitor_id = $1
		ORDER BY created_at
	`, monitorID)
	if err != nil {
		log.Printf("list secret aliases: %v", err)
		return nil
	}
	defer rows.Close()

	aliases := []string{}
	for rows.Next() {
		var alias string
		if err := rows.Scan(&alias); err == nil {
			aliases = append(aliases, alias)
		}
	}

	return aliases
}

func (s *PostgresStore) scanRun(row rowScanner) (domain.MonitorRun, error) {
	var run domain.MonitorRun
	var status string
	var failureCategory string
	err := row.Scan(&run.ID, &run.MonitorID, &run.MonitorName, &status, &failureCategory,
		&run.FailureReason, &run.TriggeredBy, &run.StartedAt, &run.EndedAt, &run.DurationMS)
	run.Status = domain.MonitorStatus(status)
	run.FailureCategory = domain.FailureCategory(failureCategory)

	return run, err
}

func (s *PostgresStore) listStepRuns(runID string) []domain.StepRun {
	rows, err := s.db.Query(`
		SELECT id, COALESCE(step_id, ''), step_name, step_type, status, request_summary_json,
		       response_summary_json, assertion_results_json, extractor_results_json,
		       console_output_json, latency_ms, COALESCE(error_message, '')
		FROM monitor_step_runs
		WHERE monitor_run_id = $1
		ORDER BY step_order
	`, runID)
	if err != nil {
		log.Printf("list step runs: %v", err)
		return nil
	}
	defer rows.Close()

	steps := []domain.StepRun{}
	for rows.Next() {
		var step domain.StepRun
		var status string
		var requestSummaryJSON []byte
		var responseSummaryJSON []byte
		var assertionsJSON []byte
		var extractorsJSON []byte
		var consoleOutputJSON []byte
		if err := rows.Scan(&step.ID, &step.StepID, &step.StepName, &step.Type, &status,
			&requestSummaryJSON, &responseSummaryJSON, &assertionsJSON, &extractorsJSON,
			&consoleOutputJSON, &step.LatencyMS, &step.ErrorMessage); err != nil {
			log.Printf("scan step run: %v", err)
			continue
		}
		step.Status = domain.MonitorStatus(status)
		step.RequestSummary = summaryFromJSON(requestSummaryJSON)
		step.ResponseSummary = summaryFromJSON(responseSummaryJSON)
		_ = json.Unmarshal(assertionsJSON, &step.Assertions)
		_ = json.Unmarshal(extractorsJSON, &step.Extractors)
		_ = json.Unmarshal(consoleOutputJSON, &step.ConsoleOutput)
		steps = append(steps, step)
	}

	return steps
}

func scanSecret(row rowScanner) (domain.SecretReference, error) {
	var secret domain.SecretReference
	err := row.Scan(&secret.ID, &secret.Name, &secret.Alias, &secret.Provider, &secret.Description,
		&secret.SecretPath, &secret.SecretKey, &secret.IsActive, &secret.LastTestedAt)
	secret.MaskedValue = "********"

	return secret, err
}

func (s *PostgresStore) seedDefaults(ctx context.Context) error {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM monitors`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	memory := NewMemoryStore()
	for _, secret := range memory.ListSecrets() {
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

	_, err = s.db.Exec(`
		INSERT INTO secret_references (
			id, name, alias, description, provider, secret_path, secret_key, encrypted_value, is_active, updated_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			alias = EXCLUDED.alias,
			description = EXCLUDED.description,
			provider = EXCLUDED.provider,
			secret_path = EXCLUDED.secret_path,
			secret_key = EXCLUDED.secret_key,
			encrypted_value = EXCLUDED.encrypted_value,
			is_active = EXCLUDED.is_active,
			updated_at = NOW()
	`, secret.ID, secret.Name, secret.Alias, secret.Description, secret.Provider,
		nullIfEmpty(secret.SecretPath), nullIfEmpty(secret.SecretKey), encryptedValue, secret.IsActive)
	if err != nil {
		return domain.SecretReference{}, err
	}

	saved, ok := s.GetSecret(secret.ID)
	if !ok {
		return domain.SecretReference{}, sql.ErrNoRows
	}

	return saved, nil
}

func (s *PostgresStore) encryptedValueForSecret(secret domain.SecretReference) (string, error) {
	if secret.RawValue != "" {
		return s.codec.Encrypt(secret.RawValue, secretAssociatedData(secret.ID))
	}

	var existing string
	err := s.db.QueryRow(`SELECT COALESCE(encrypted_value, '') FROM secret_references WHERE id = $1`, secret.ID).Scan(&existing)
	if err == nil && existing != "" {
		return existing, nil
	}
	if err != nil && err != sql.ErrNoRows {
		return "", err
	}

	return "", sql.ErrNoRows
}

func (s *PostgresStore) secretIDForAliasTx(tx *sql.Tx, alias string) string {
	var id string
	if err := tx.QueryRow(`SELECT id FROM secret_references WHERE alias = $1`, alias).Scan(&id); err != nil {
		return ""
	}

	return id
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

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}

	return value
}

func secretAssociatedData(id string) string {
	return "secret:" + id
}
