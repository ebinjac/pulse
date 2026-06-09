-- name: ListApplicationServices :many
SELECT
  id,
  application_id,
  name,
  log_service_name,
  COALESCE(squad, '')::text AS squad,
  COALESCE(owner, '')::text AS owner,
  COALESCE(environment, '')::text AS environment,
  COALESCE(elf_app_id, '')::text AS elf_app_id,
  COALESCE(index_path_template, '')::text AS index_path_template,
  log_field_mapping_json,
  is_active,
  created_at,
  updated_at
FROM application_services
WHERE application_id = $1
ORDER BY name ASC;

-- name: GetApplicationService :one
SELECT
  id,
  application_id,
  name,
  log_service_name,
  COALESCE(squad, '')::text AS squad,
  COALESCE(owner, '')::text AS owner,
  COALESCE(environment, '')::text AS environment,
  COALESCE(elf_app_id, '')::text AS elf_app_id,
  COALESCE(index_path_template, '')::text AS index_path_template,
  log_field_mapping_json,
  is_active,
  created_at,
  updated_at
FROM application_services
WHERE id = $1;

-- name: UpsertApplicationService :exec
INSERT INTO application_services (
  id,
  application_id,
  name,
  log_service_name,
  squad,
  owner,
  environment,
  elf_app_id,
  index_path_template,
  log_field_mapping_json,
  is_active,
  created_at,
  updated_at
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
ON CONFLICT (id) DO UPDATE SET
  application_id = EXCLUDED.application_id,
  name = EXCLUDED.name,
  log_service_name = EXCLUDED.log_service_name,
  squad = EXCLUDED.squad,
  owner = EXCLUDED.owner,
  environment = EXCLUDED.environment,
  elf_app_id = EXCLUDED.elf_app_id,
  index_path_template = EXCLUDED.index_path_template,
  log_field_mapping_json = EXCLUDED.log_field_mapping_json,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

-- name: DeleteApplicationService :execrows
DELETE FROM application_services
WHERE id = $1;
