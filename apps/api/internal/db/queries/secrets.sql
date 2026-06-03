-- name: ListSecrets :many
SELECT
  id,
  name,
  alias,
  provider,
  COALESCE(description, '')::text AS description,
  COALESCE(secret_path, '')::text AS secret_path,
  COALESCE(secret_key, '')::text AS secret_key,
  is_active,
  created_at
FROM secret_references
ORDER BY created_at DESC;

-- name: GetSecret :one
SELECT
  id,
  name,
  alias,
  provider,
  COALESCE(description, '')::text AS description,
  COALESCE(secret_path, '')::text AS secret_path,
  COALESCE(secret_key, '')::text AS secret_key,
  is_active,
  created_at
FROM secret_references
WHERE id = $1;

-- name: GetRawSecretByAlias :one
SELECT id, COALESCE(encrypted_value, '')::text AS encrypted_value
FROM secret_references
WHERE alias = $1 AND is_active = TRUE;

-- name: GetEncryptedSecretByID :one
SELECT COALESCE(encrypted_value, '')::text AS encrypted_value
FROM secret_references
WHERE id = $1;

-- name: ListLegacySecretsForBackfill :many
SELECT id, alias
FROM secret_references
WHERE COALESCE(encrypted_value, '') = '' OR encrypted_value = 'encrypted-placeholder';

-- name: UpdateSecretEncryptedValue :exec
UPDATE secret_references
SET encrypted_value = $2, updated_at = NOW()
WHERE id = $1;

-- name: UpsertSecret :exec
INSERT INTO secret_references (
  id,
  name,
  alias,
  description,
  provider,
  secret_path,
  secret_key,
  encrypted_value,
  is_active,
  updated_at
)
VALUES (
  $1,
  $2,
  $3,
  $4,
  $5,
  sqlc.narg('secret_path'),
  sqlc.narg('secret_key'),
  $6,
  $7,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  alias = EXCLUDED.alias,
  description = EXCLUDED.description,
  provider = EXCLUDED.provider,
  secret_path = EXCLUDED.secret_path,
  secret_key = EXCLUDED.secret_key,
  encrypted_value = EXCLUDED.encrypted_value,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- name: DeleteSecret :execrows
DELETE FROM secret_references
WHERE id = $1;
