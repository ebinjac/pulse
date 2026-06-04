-- name: ListCertificateProfiles :many
SELECT
  id,
  name,
  host,
  port,
  cert_type,
  COALESCE(cert_secret_alias, '')::text AS cert_secret_alias,
  COALESCE(key_secret_alias, '')::text AS key_secret_alias,
  COALESCE(pfx_secret_alias, '')::text AS pfx_secret_alias,
  COALESCE(ca_cert_secret_alias, '')::text AS ca_cert_secret_alias,
  COALESCE(passphrase_secret_alias, '')::text AS passphrase_secret_alias,
  insecure_skip_verify,
  is_active,
  last_tested_at,
  created_at,
  updated_at
FROM certificate_profiles
ORDER BY updated_at DESC;

-- name: GetCertificateProfile :one
SELECT
  id,
  name,
  host,
  port,
  cert_type,
  COALESCE(cert_secret_alias, '')::text AS cert_secret_alias,
  COALESCE(key_secret_alias, '')::text AS key_secret_alias,
  COALESCE(pfx_secret_alias, '')::text AS pfx_secret_alias,
  COALESCE(ca_cert_secret_alias, '')::text AS ca_cert_secret_alias,
  COALESCE(passphrase_secret_alias, '')::text AS passphrase_secret_alias,
  insecure_skip_verify,
  is_active,
  last_tested_at,
  created_at,
  updated_at
FROM certificate_profiles
WHERE id = $1;

-- name: UpsertCertificateProfile :exec
INSERT INTO certificate_profiles (
  id,
  name,
  host,
  port,
  cert_type,
  cert_secret_alias,
  key_secret_alias,
  pfx_secret_alias,
  ca_cert_secret_alias,
  passphrase_secret_alias,
  insecure_skip_verify,
  is_active,
  last_tested_at,
  updated_at
)
VALUES (
  $1,
  $2,
  $3,
  $4,
  $5,
  sqlc.narg('cert_secret_alias'),
  sqlc.narg('key_secret_alias'),
  sqlc.narg('pfx_secret_alias'),
  sqlc.narg('ca_cert_secret_alias'),
  sqlc.narg('passphrase_secret_alias'),
  $6,
  $7,
  sqlc.narg('last_tested_at'),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  host = EXCLUDED.host,
  port = EXCLUDED.port,
  cert_type = EXCLUDED.cert_type,
  cert_secret_alias = EXCLUDED.cert_secret_alias,
  key_secret_alias = EXCLUDED.key_secret_alias,
  pfx_secret_alias = EXCLUDED.pfx_secret_alias,
  ca_cert_secret_alias = EXCLUDED.ca_cert_secret_alias,
  passphrase_secret_alias = EXCLUDED.passphrase_secret_alias,
  insecure_skip_verify = EXCLUDED.insecure_skip_verify,
  is_active = EXCLUDED.is_active,
  last_tested_at = COALESCE(EXCLUDED.last_tested_at, certificate_profiles.last_tested_at),
  updated_at = NOW();

-- name: DeleteCertificateProfile :execrows
DELETE FROM certificate_profiles
WHERE id = $1;
