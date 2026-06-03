-- name: ListAlerts :many
SELECT
  id,
  monitor_id,
  COALESCE(run_id, '')::text AS run_id,
  COALESCE(status, '')::text AS status,
  COALESCE(severity, '')::text AS severity,
  COALESCE(title, '')::text AS title,
  COALESCE(description, '')::text AS description,
  COALESCE(failure_category, '')::text AS failure_category,
  channels_json,
  deliveries_json,
  first_triggered_at,
  last_triggered_at,
  last_delivered_at,
  resolved_at,
  COALESCE(acknowledged_by, '')::text AS acknowledged_by,
  acknowledged_at,
  snoozed_until,
  COALESCE(suppression_reason, '')::text AS suppression_reason,
  created_at,
  updated_at
FROM alerts
ORDER BY last_triggered_at DESC;

-- name: GetAlert :one
SELECT
  id,
  monitor_id,
  COALESCE(run_id, '')::text AS run_id,
  COALESCE(status, '')::text AS status,
  COALESCE(severity, '')::text AS severity,
  COALESCE(title, '')::text AS title,
  COALESCE(description, '')::text AS description,
  COALESCE(failure_category, '')::text AS failure_category,
  channels_json,
  deliveries_json,
  first_triggered_at,
  last_triggered_at,
  last_delivered_at,
  resolved_at,
  COALESCE(acknowledged_by, '')::text AS acknowledged_by,
  acknowledged_at,
  snoozed_until,
  COALESCE(suppression_reason, '')::text AS suppression_reason,
  created_at,
  updated_at
FROM alerts
WHERE id = $1;

-- name: GetActiveAlert :one
SELECT
  id,
  monitor_id,
  COALESCE(run_id, '')::text AS run_id,
  COALESCE(status, '')::text AS status,
  COALESCE(severity, '')::text AS severity,
  COALESCE(title, '')::text AS title,
  COALESCE(description, '')::text AS description,
  COALESCE(failure_category, '')::text AS failure_category,
  channels_json,
  deliveries_json,
  first_triggered_at,
  last_triggered_at,
  last_delivered_at,
  resolved_at,
  COALESCE(acknowledged_by, '')::text AS acknowledged_by,
  acknowledged_at,
  snoozed_until,
  COALESCE(suppression_reason, '')::text AS suppression_reason,
  created_at,
  updated_at
FROM alerts
WHERE monitor_id = $1
  AND status = ANY($2::text[])
ORDER BY last_triggered_at DESC
LIMIT 1;

-- name: UpsertAlert :exec
INSERT INTO alerts (
  id,
  monitor_id,
  run_id,
  status,
  severity,
  title,
  description,
  failure_category,
  channels_json,
  deliveries_json,
  first_triggered_at,
  last_triggered_at,
  last_delivered_at,
  resolved_at,
  acknowledged_by,
  acknowledged_at,
  snoozed_until,
  suppression_reason,
  created_at,
  updated_at
)
VALUES (
  $1,
  $2,
  sqlc.narg('run_id'),
  $3,
  $4,
  $5,
  $6,
  $7,
  $8,
  $9,
  $10,
  $11,
  sqlc.narg('last_delivered_at'),
  sqlc.narg('resolved_at'),
  sqlc.narg('acknowledged_by'),
  sqlc.narg('acknowledged_at'),
  sqlc.narg('snoozed_until'),
  sqlc.narg('suppression_reason'),
  $12,
  $13
)
ON CONFLICT (id) DO UPDATE SET
  run_id = EXCLUDED.run_id,
  status = EXCLUDED.status,
  severity = EXCLUDED.severity,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  failure_category = EXCLUDED.failure_category,
  channels_json = EXCLUDED.channels_json,
  deliveries_json = EXCLUDED.deliveries_json,
  last_triggered_at = EXCLUDED.last_triggered_at,
  last_delivered_at = EXCLUDED.last_delivered_at,
  resolved_at = EXCLUDED.resolved_at,
  acknowledged_by = EXCLUDED.acknowledged_by,
  acknowledged_at = EXCLUDED.acknowledged_at,
  snoozed_until = EXCLUDED.snoozed_until,
  suppression_reason = EXCLUDED.suppression_reason,
  updated_at = EXCLUDED.updated_at;

-- name: ResolveOpenAlerts :execrows
UPDATE alerts
SET status = $2, resolved_at = $3, updated_at = NOW()
WHERE monitor_id = $1 AND status = ANY($4::text[]);
