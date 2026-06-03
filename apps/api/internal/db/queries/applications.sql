-- name: ListApplications :many
SELECT
  id,
  name,
  car_id,
  COALESCE(description, '')::text AS description,
  COALESCE(owner, '')::text AS owner,
  COALESCE(environment, '')::text AS environment,
  tags_json,
  created_at,
  updated_at
FROM applications
ORDER BY name ASC;

-- name: GetApplication :one
SELECT
  id,
  name,
  car_id,
  COALESCE(description, '')::text AS description,
  COALESCE(owner, '')::text AS owner,
  COALESCE(environment, '')::text AS environment,
  tags_json,
  created_at,
  updated_at
FROM applications
WHERE id = $1;

-- name: UpsertApplication :exec
INSERT INTO applications (
  id,
  name,
  car_id,
  description,
  owner,
  environment,
  tags_json,
  created_at,
  updated_at
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  car_id = EXCLUDED.car_id,
  description = EXCLUDED.description,
  owner = EXCLUDED.owner,
  environment = EXCLUDED.environment,
  tags_json = EXCLUDED.tags_json,
  updated_at = EXCLUDED.updated_at;

-- name: DeleteApplication :execrows
DELETE FROM applications
WHERE id = $1;
