ALTER TABLE monitor_step_runs
ADD COLUMN IF NOT EXISTS console_output_json JSONB DEFAULT '[]'::jsonb;

ALTER TABLE alerts
ADD COLUMN IF NOT EXISTS run_id TEXT REFERENCES monitor_runs(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS channels_json JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS deliveries_json JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS last_delivered_at TIMESTAMP;

ALTER TABLE monitor_step_runs
DROP CONSTRAINT IF EXISTS monitor_step_runs_step_id_fkey;

ALTER TABLE monitor_step_runs
ADD CONSTRAINT monitor_step_runs_step_id_fkey
FOREIGN KEY (step_id) REFERENCES monitor_steps(id) ON DELETE SET NULL;
