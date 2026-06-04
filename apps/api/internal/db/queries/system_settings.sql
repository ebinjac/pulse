-- name: GetSystemSetting :one
SELECT value_json, updated_at
FROM system_settings
WHERE key = $1;

-- name: UpsertSystemSetting :exec
INSERT INTO system_settings (key, value_json, updated_at)
VALUES ($1, $2, NOW())
ON CONFLICT (key) DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = NOW();
