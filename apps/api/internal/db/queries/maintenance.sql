-- name: ListMaintenanceWindows :many
SELECT
  id,
  scope_type,
  COALESCE(scope_id, '')::text AS scope_id,
  starts_at,
  ends_at,
  COALESCE(reason, '')::text AS reason,
  COALESCE(created_by, '')::text AS created_by,
  created_at
FROM alert_maintenance_windows
ORDER BY ends_at DESC;

-- name: ListActiveMaintenanceWindows :many
SELECT
  id,
  scope_type,
  COALESCE(scope_id, '')::text AS scope_id,
  starts_at,
  ends_at,
  COALESCE(reason, '')::text AS reason,
  COALESCE(created_by, '')::text AS created_by,
  created_at
FROM alert_maintenance_windows
WHERE starts_at <= $1 AND ends_at > $1
ORDER BY ends_at DESC;

-- name: UpsertMaintenanceWindow :exec
INSERT INTO alert_maintenance_windows (
  id,
  scope_type,
  scope_id,
  starts_at,
  ends_at,
  reason,
  created_by,
  created_at
)
VALUES ($1, $2, sqlc.narg('scope_id'), $3, $4, $5, $6, $7)
ON CONFLICT (id) DO UPDATE SET
  scope_type = EXCLUDED.scope_type,
  scope_id = EXCLUDED.scope_id,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at,
  reason = EXCLUDED.reason,
  created_by = EXCLUDED.created_by;

-- name: DeleteMaintenanceWindow :execrows
DELETE FROM alert_maintenance_windows
WHERE id = $1;
