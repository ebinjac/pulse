-- name: InsertMonitorRun :exec
INSERT INTO monitor_runs (
  id,
  monitor_id,
  status,
  failure_category,
  failure_reason,
  triggered_by,
  started_at,
  ended_at,
  duration_ms
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
ON CONFLICT (id) DO NOTHING;

-- name: InsertMonitorStepRun :exec
INSERT INTO monitor_step_runs (
  id,
  monitor_run_id,
  step_id,
  step_order,
  step_name,
  step_type,
  status,
  request_summary_json,
  response_summary_json,
  assertion_results_json,
  extractor_results_json,
  console_output_json,
  latency_ms,
  error_message,
  started_at,
  ended_at
)
VALUES (
  $1,
  $2,
  sqlc.narg('step_id'),
  $3,
  $4,
  $5,
  $6,
  $7,
  $8,
  $9,
  $10,
  $11,
  $12,
  $13,
  $14,
  $15
)
ON CONFLICT (id) DO NOTHING;

-- name: UpdateMonitorAfterRun :exec
UPDATE monitors
SET status = $2, last_run_at = $3, last_duration_ms = $4, updated_at = NOW()
WHERE id = $1;

-- name: ListRuns :many
SELECT
  r.id,
  r.monitor_id,
  COALESCE(m.name, '')::text AS monitor_name,
  COALESCE(r.status, '')::text AS status,
  COALESCE(r.failure_category, '')::text AS failure_category,
  COALESCE(r.failure_reason, '')::text AS failure_reason,
  COALESCE(r.triggered_by, '')::text AS triggered_by,
  r.started_at,
  r.ended_at,
  COALESCE(r.duration_ms, 0)::int AS duration_ms
FROM monitor_runs r
LEFT JOIN monitors m ON m.id = r.monitor_id
WHERE sqlc.narg('monitor_id')::text IS NULL OR r.monitor_id = sqlc.narg('monitor_id')
ORDER BY r.started_at DESC;

-- name: GetRun :one
SELECT
  r.id,
  r.monitor_id,
  COALESCE(m.name, '')::text AS monitor_name,
  COALESCE(r.status, '')::text AS status,
  COALESCE(r.failure_category, '')::text AS failure_category,
  COALESCE(r.failure_reason, '')::text AS failure_reason,
  COALESCE(r.triggered_by, '')::text AS triggered_by,
  r.started_at,
  r.ended_at,
  COALESCE(r.duration_ms, 0)::int AS duration_ms
FROM monitor_runs r
LEFT JOIN monitors m ON m.id = r.monitor_id
WHERE r.id = $1;

-- name: ListStepRuns :many
SELECT
  id,
  COALESCE(step_id, '')::text AS step_id,
  COALESCE(step_name, '')::text AS step_name,
  COALESCE(step_type, '')::text AS step_type,
  COALESCE(status, '')::text AS status,
  request_summary_json,
  response_summary_json,
  assertion_results_json,
  extractor_results_json,
  console_output_json,
  COALESCE(latency_ms, 0)::int AS latency_ms,
  COALESCE(error_message, '')::text AS error_message
FROM monitor_step_runs
WHERE monitor_run_id = $1
ORDER BY step_order;
