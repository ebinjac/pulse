ALTER TABLE deployment_validations
ADD COLUMN IF NOT EXISTS deployment_started_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS baseline_window_hours INTEGER NOT NULL DEFAULT 24,
ADD COLUMN IF NOT EXISTS baseline_run_count INTEGER NOT NULL DEFAULT 30;

UPDATE deployment_validations
SET deployment_started_at = COALESCE(deployment_started_at, created_at),
    baseline_window_hours = CASE WHEN baseline_window_hours <= 0 THEN 24 ELSE baseline_window_hours END,
    baseline_run_count = CASE WHEN baseline_run_count <= 0 THEN 30 ELSE baseline_run_count END;
