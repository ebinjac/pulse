-- name: GetMonitorDraft :one
SELECT config_json, updated_at
FROM monitor_drafts
WHERE monitor_id = $1;

-- name: UpsertMonitorDraft :exec
INSERT INTO monitor_drafts (monitor_id, config_json, updated_at)
VALUES ($1, $2, NOW())
ON CONFLICT (monitor_id) DO UPDATE SET
  config_json = EXCLUDED.config_json,
  updated_at = NOW();

-- name: DeleteMonitorDraft :exec
DELETE FROM monitor_drafts
WHERE monitor_id = $1;

-- name: SetMonitorDraftFlags :exec
UPDATE monitors
SET
  has_unpublished_draft = $2,
  updated_at = NOW()
WHERE id = $1;

-- name: BumpPublishedVersion :exec
UPDATE monitors
SET
  published_version = $2,
  has_unpublished_draft = FALSE,
  updated_at = NOW()
WHERE id = $1;

-- name: InsertMonitorVersion :exec
INSERT INTO monitor_versions (
  id,
  monitor_id,
  version_number,
  config_json,
  change_note,
  created_by,
  source,
  created_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: ListMonitorVersions :many
SELECT
  id,
  monitor_id,
  version_number,
  change_note,
  COALESCE(created_by, '')::text AS created_by,
  source,
  created_at
FROM monitor_versions
WHERE monitor_id = $1
ORDER BY version_number DESC;

-- name: GetMonitorVersion :one
SELECT
  id,
  monitor_id,
  version_number,
  config_json,
  change_note,
  COALESCE(created_by, '')::text AS created_by,
  source,
  created_at
FROM monitor_versions
WHERE monitor_id = $1 AND version_number = $2;

-- name: GetMaxMonitorVersion :one
SELECT COALESCE(MAX(version_number), 0)::int AS max_version
FROM monitor_versions
WHERE monitor_id = $1;

-- name: DeleteMonitorVersions :exec
DELETE FROM monitor_versions
WHERE monitor_id = $1;
