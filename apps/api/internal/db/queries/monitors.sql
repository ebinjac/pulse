-- name: ListMonitors :many
SELECT
  id,
  name,
  COALESCE(description, '')::text AS description,
  COALESCE(schedule_mode, '')::text AS schedule_mode,
  COALESCE(schedule_label, '')::text AS schedule_label,
  COALESCE(schedule_cron, '')::text AS schedule_cron,
  COALESCE(timezone, 'UTC')::text AS timezone,
  COALESCE(timeout_ms, 30000)::int AS timeout_ms,
  COALESCE(retry_count, 0)::int AS retry_count,
  COALESCE(failure_threshold, 3)::int AS failure_threshold,
  COALESCE(response_body_limit_kb, 32)::int AS response_body_limit_kb,
  COALESCE(is_active, TRUE)::bool AS is_active,
  COALESCE(alert_enabled, FALSE)::bool AS alert_enabled,
  variables_json,
  alert_policy_json,
  COALESCE(status, '')::text AS status,
  last_run_at,
  COALESCE(last_duration_ms, 0)::int AS last_duration_ms,
  COALESCE(success_rate_24h, 0)::float8 AS success_rate_24h,
  created_at,
  updated_at
FROM monitors
ORDER BY created_at DESC;

-- name: CountMonitors :one
SELECT COUNT(*)::int
FROM monitors;

-- name: GetMonitor :one
SELECT
  id,
  name,
  COALESCE(description, '')::text AS description,
  COALESCE(schedule_mode, '')::text AS schedule_mode,
  COALESCE(schedule_label, '')::text AS schedule_label,
  COALESCE(schedule_cron, '')::text AS schedule_cron,
  COALESCE(timezone, 'UTC')::text AS timezone,
  COALESCE(timeout_ms, 30000)::int AS timeout_ms,
  COALESCE(retry_count, 0)::int AS retry_count,
  COALESCE(failure_threshold, 3)::int AS failure_threshold,
  COALESCE(response_body_limit_kb, 32)::int AS response_body_limit_kb,
  COALESCE(is_active, TRUE)::bool AS is_active,
  COALESCE(alert_enabled, FALSE)::bool AS alert_enabled,
  variables_json,
  alert_policy_json,
  COALESCE(status, '')::text AS status,
  last_run_at,
  COALESCE(last_duration_ms, 0)::int AS last_duration_ms,
  COALESCE(success_rate_24h, 0)::float8 AS success_rate_24h,
  created_at,
  updated_at
FROM monitors
WHERE id = $1;

-- name: UpsertMonitor :exec
INSERT INTO monitors (
  id,
  name,
  description,
  schedule_mode,
  schedule_label,
  schedule_cron,
  timezone,
  timeout_ms,
  retry_count,
  failure_threshold,
  response_body_limit_kb,
  is_active,
  alert_enabled,
  variables_json,
  alert_policy_json,
  status,
  last_run_at,
  last_duration_ms,
  success_rate_24h,
  created_at,
  updated_at
)
VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
  sqlc.narg('last_run_at'),
  $17, $18, $19, $20
)
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
  updated_at = EXCLUDED.updated_at;

-- name: DeleteMonitor :execrows
DELETE FROM monitors
WHERE id = $1;

-- name: GetStepMonitorID :one
SELECT monitor_id
FROM monitor_steps
WHERE id = $1;

-- name: DeleteMonitorSteps :exec
DELETE FROM monitor_steps
WHERE monitor_id = $1;

-- name: InsertMonitorStep :exec
INSERT INTO monitor_steps (
  id,
  monitor_id,
  step_order,
  name,
  step_type,
  config_json,
  actions_json,
  assertions_json,
  extractors_json,
  timeout_ms,
  retry_count,
  continue_on_failure,
  updated_at
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW());

-- name: ListSteps :many
SELECT
  id,
  monitor_id,
  step_order,
  name,
  step_type,
  config_json,
  actions_json,
  assertions_json,
  extractors_json,
  COALESCE(timeout_ms, 0)::int AS timeout_ms,
  COALESCE(retry_count, 0)::int AS retry_count,
  COALESCE(continue_on_failure, FALSE)::bool AS continue_on_failure
FROM monitor_steps
WHERE monitor_id = $1
ORDER BY step_order;

-- name: DeleteMonitorSecretBindings :exec
DELETE FROM monitor_secret_bindings
WHERE monitor_id = $1;

-- name: GetSecretIDForAlias :one
SELECT id
FROM secret_references
WHERE alias = $1;

-- name: UpsertMonitorSecretBinding :exec
INSERT INTO monitor_secret_bindings (id, monitor_id, secret_reference_id, alias)
VALUES ($1,$2,$3,$4)
ON CONFLICT (monitor_id, alias) DO UPDATE SET secret_reference_id = EXCLUDED.secret_reference_id;

-- name: ListSecretAliases :many
SELECT alias
FROM monitor_secret_bindings
WHERE monitor_id = $1
ORDER BY created_at;
