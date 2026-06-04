ALTER TABLE deployment_validations
DROP COLUMN IF EXISTS deployment_started_at,
DROP COLUMN IF EXISTS baseline_window_hours,
DROP COLUMN IF EXISTS baseline_run_count;
