-- name: ListApplications :many
SELECT
  id,
  name,
  car_id,
  COALESCE(elf_app_id, '')::text AS elf_app_id,
  COALESCE(index_path_template, '')::text AS index_path_template,
  log_field_mapping_json,
  COALESCE(description, '')::text AS description,
  COALESCE(owner, '')::text AS owner,
  COALESCE(environment, '')::text AS environment,
  tags_json,
  alert_routing_json,
  created_at,
  updated_at
FROM applications
ORDER BY name ASC;

-- name: GetApplication :one
SELECT
  id,
  name,
  car_id,
  COALESCE(elf_app_id, '')::text AS elf_app_id,
  COALESCE(index_path_template, '')::text AS index_path_template,
  log_field_mapping_json,
  COALESCE(description, '')::text AS description,
  COALESCE(owner, '')::text AS owner,
  COALESCE(environment, '')::text AS environment,
  tags_json,
  alert_routing_json,
  created_at,
  updated_at
FROM applications
WHERE id = $1;

-- name: UpsertApplication :exec
INSERT INTO applications (
  id,
  name,
  car_id,
  elf_app_id,
  index_path_template,
  log_field_mapping_json,
  description,
  owner,
  environment,
  tags_json,
  alert_routing_json,
  created_at,
  updated_at
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  car_id = EXCLUDED.car_id,
  elf_app_id = EXCLUDED.elf_app_id,
  index_path_template = EXCLUDED.index_path_template,
  log_field_mapping_json = EXCLUDED.log_field_mapping_json,
  description = EXCLUDED.description,
  owner = EXCLUDED.owner,
  environment = EXCLUDED.environment,
  tags_json = EXCLUDED.tags_json,
  alert_routing_json = EXCLUDED.alert_routing_json,
  updated_at = EXCLUDED.updated_at;

-- name: DeleteApplication :execrows
DELETE FROM applications
WHERE id = $1;
