-- name: ListDeploymentValidations :many
SELECT
  id,
  COALESCE(application_id, '')::text AS application_id,
  application_name,
  car_id,
  name,
  COALESCE(version, '')::text AS version,
  COALESCE(build_id, '')::text AS build_id,
  COALESCE(environment, '')::text AS environment,
  status,
  monitor_ids_json,
  report_json,
  COALESCE(ai_report_json, '{}'::jsonb) AS ai_report_json,
  COALESCE(sample_count, 1)::int AS sample_count,
  COALESCE(interval_seconds, 0)::int AS interval_seconds,
  deployment_started_at,
  COALESCE(baseline_window_hours, 24)::int AS baseline_window_hours,
  COALESCE(baseline_run_count, 30)::int AS baseline_run_count,
  pre_started_at,
  pre_completed_at,
  post_started_at,
  post_completed_at,
  COALESCE(elf_query_ids_json, '[]'::jsonb) AS elf_query_ids_json,
  COALESCE(auto_run_log_check, FALSE) AS auto_run_log_check,
  COALESCE(service_ids_json, '[]'::jsonb) AS service_ids_json,
  COALESCE(observability_profile, 'standard')::text AS observability_profile,
  COALESCE(signal_pack_ids_json, '[]'::jsonb) AS signal_pack_ids_json,
  COALESCE(elf_results_json, '[]'::jsonb) AS elf_results_json,
  log_started_at,
  log_completed_at,
  created_at,
  updated_at
FROM deployment_validations
WHERE sqlc.narg('application_id')::text IS NULL OR application_id = sqlc.narg('application_id')
ORDER BY created_at DESC;

-- name: GetDeploymentValidation :one
SELECT
  id,
  COALESCE(application_id, '')::text AS application_id,
  application_name,
  car_id,
  name,
  COALESCE(version, '')::text AS version,
  COALESCE(build_id, '')::text AS build_id,
  COALESCE(environment, '')::text AS environment,
  status,
  monitor_ids_json,
  report_json,
  COALESCE(ai_report_json, '{}'::jsonb) AS ai_report_json,
  COALESCE(sample_count, 1)::int AS sample_count,
  COALESCE(interval_seconds, 0)::int AS interval_seconds,
  deployment_started_at,
  COALESCE(baseline_window_hours, 24)::int AS baseline_window_hours,
  COALESCE(baseline_run_count, 30)::int AS baseline_run_count,
  pre_started_at,
  pre_completed_at,
  post_started_at,
  post_completed_at,
  COALESCE(elf_query_ids_json, '[]'::jsonb) AS elf_query_ids_json,
  COALESCE(auto_run_log_check, FALSE) AS auto_run_log_check,
  COALESCE(service_ids_json, '[]'::jsonb) AS service_ids_json,
  COALESCE(observability_profile, 'standard')::text AS observability_profile,
  COALESCE(signal_pack_ids_json, '[]'::jsonb) AS signal_pack_ids_json,
  COALESCE(elf_results_json, '[]'::jsonb) AS elf_results_json,
  log_started_at,
  log_completed_at,
  created_at,
  updated_at
FROM deployment_validations
WHERE id = $1;

-- name: UpsertDeploymentValidation :exec
INSERT INTO deployment_validations (
  id,
  application_id,
  application_name,
  car_id,
  name,
  version,
  build_id,
  environment,
  status,
  monitor_ids_json,
  report_json,
  ai_report_json,
  sample_count,
  interval_seconds,
  deployment_started_at,
  baseline_window_hours,
  baseline_run_count,
  pre_started_at,
  pre_completed_at,
  post_started_at,
  post_completed_at,
  elf_query_ids_json,
  auto_run_log_check,
  service_ids_json,
  observability_profile,
  signal_pack_ids_json,
  elf_results_json,
  log_started_at,
  log_completed_at,
  created_at,
  updated_at
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
ON CONFLICT (id) DO UPDATE SET
  application_id = EXCLUDED.application_id,
  application_name = EXCLUDED.application_name,
  car_id = EXCLUDED.car_id,
  name = EXCLUDED.name,
  version = EXCLUDED.version,
  build_id = EXCLUDED.build_id,
  environment = EXCLUDED.environment,
  status = EXCLUDED.status,
  monitor_ids_json = EXCLUDED.monitor_ids_json,
  report_json = EXCLUDED.report_json,
  ai_report_json = EXCLUDED.ai_report_json,
  sample_count = EXCLUDED.sample_count,
  interval_seconds = EXCLUDED.interval_seconds,
  deployment_started_at = EXCLUDED.deployment_started_at,
  baseline_window_hours = EXCLUDED.baseline_window_hours,
  baseline_run_count = EXCLUDED.baseline_run_count,
  pre_started_at = EXCLUDED.pre_started_at,
  pre_completed_at = EXCLUDED.pre_completed_at,
  post_started_at = EXCLUDED.post_started_at,
  post_completed_at = EXCLUDED.post_completed_at,
  elf_query_ids_json = EXCLUDED.elf_query_ids_json,
  auto_run_log_check = EXCLUDED.auto_run_log_check,
  service_ids_json = EXCLUDED.service_ids_json,
  observability_profile = EXCLUDED.observability_profile,
  signal_pack_ids_json = EXCLUDED.signal_pack_ids_json,
  elf_results_json = EXCLUDED.elf_results_json,
  log_started_at = EXCLUDED.log_started_at,
  log_completed_at = EXCLUDED.log_completed_at,
  updated_at = EXCLUDED.updated_at;

-- name: DeleteDeploymentValidation :execrows
DELETE FROM deployment_validations
WHERE id = $1;

-- name: LinkDeploymentValidationRun :exec
INSERT INTO deployment_validation_runs (
  validation_id,
  phase,
  monitor_id,
  run_id
)
VALUES ($1,$2,$3,$4)
ON CONFLICT DO NOTHING;

-- name: ListDeploymentValidationRuns :many
SELECT
  r.id,
  r.monitor_id,
  COALESCE(m.name, '')::text AS monitor_name,
  COALESCE(r.status, '')::text AS status,
  COALESCE(r.failure_category, '')::text AS failure_category,
  COALESCE(r.failure_reason, '')::text AS failure_reason,
  COALESCE(r.triggered_by, '')::text AS triggered_by,
  r.started_at,
  r.ended_at,
  COALESCE(r.duration_ms, 0)::int AS duration_ms
FROM deployment_validation_runs l
INNER JOIN monitor_runs r ON r.id = l.run_id
LEFT JOIN monitors m ON m.id = r.monitor_id
WHERE l.validation_id = $1 AND l.phase = $2
ORDER BY r.started_at DESC;
