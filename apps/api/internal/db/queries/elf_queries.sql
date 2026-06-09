-- name: ListElfQueries :many
SELECT
  id,
  name,
  COALESCE(description, '')::text AS description,
  COALESCE(elf_app_id, '')::text AS elf_app_id,
  COALESCE(index_path_template, '')::text AS index_path_template,
  search_body_json,
  gate_mode,
  pass_criteria_json,
  COALESCE(application_id, '')::text AS application_id,
  COALESCE(signal_type, 'custom')::text AS signal_type,
  comparison_config_json,
  COALESCE(service_id, '')::text AS service_id,
  probe_config_json,
  field_mapping_json,
  field_schema_json,
  COALESCE(check_kind, 'raw')::text AS check_kind,
  check_config_json,
  generated_search_body_json,
  last_probe_at,
  last_probe_summary_json,
  tags_json,
  is_active,
  created_at,
  updated_at
FROM elf_queries
WHERE sqlc.narg('application_id')::text IS NULL OR application_id = sqlc.narg('application_id')
ORDER BY name ASC;

-- name: GetElfQuery :one
SELECT
  id,
  name,
  COALESCE(description, '')::text AS description,
  COALESCE(elf_app_id, '')::text AS elf_app_id,
  COALESCE(index_path_template, '')::text AS index_path_template,
  search_body_json,
  gate_mode,
  pass_criteria_json,
  COALESCE(application_id, '')::text AS application_id,
  COALESCE(signal_type, 'custom')::text AS signal_type,
  comparison_config_json,
  COALESCE(service_id, '')::text AS service_id,
  probe_config_json,
  field_mapping_json,
  field_schema_json,
  COALESCE(check_kind, 'raw')::text AS check_kind,
  check_config_json,
  generated_search_body_json,
  last_probe_at,
  last_probe_summary_json,
  tags_json,
  is_active,
  created_at,
  updated_at
FROM elf_queries
WHERE id = $1;

-- name: UpsertElfQuery :exec
INSERT INTO elf_queries (
  id,
  name,
  description,
  elf_app_id,
  index_path_template,
  search_body_json,
  gate_mode,
  pass_criteria_json,
  application_id,
  signal_type,
  comparison_config_json,
  service_id,
  probe_config_json,
  field_mapping_json,
  field_schema_json,
  check_kind,
  check_config_json,
  generated_search_body_json,
  last_probe_at,
  last_probe_summary_json,
  tags_json,
  is_active,
  created_at,
  updated_at
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  elf_app_id = EXCLUDED.elf_app_id,
  index_path_template = EXCLUDED.index_path_template,
  search_body_json = EXCLUDED.search_body_json,
  gate_mode = EXCLUDED.gate_mode,
  pass_criteria_json = EXCLUDED.pass_criteria_json,
  application_id = EXCLUDED.application_id,
  signal_type = EXCLUDED.signal_type,
  comparison_config_json = EXCLUDED.comparison_config_json,
  service_id = EXCLUDED.service_id,
  probe_config_json = EXCLUDED.probe_config_json,
  field_mapping_json = EXCLUDED.field_mapping_json,
  field_schema_json = EXCLUDED.field_schema_json,
  check_kind = EXCLUDED.check_kind,
  check_config_json = EXCLUDED.check_config_json,
  generated_search_body_json = EXCLUDED.generated_search_body_json,
  last_probe_at = EXCLUDED.last_probe_at,
  last_probe_summary_json = EXCLUDED.last_probe_summary_json,
  tags_json = EXCLUDED.tags_json,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

-- name: DeleteElfQuery :execrows
DELETE FROM elf_queries
WHERE id = $1;
