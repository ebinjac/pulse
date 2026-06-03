ALTER TABLE monitor_step_runs
    ADD COLUMN IF NOT EXISTS timing_json JSONB DEFAULT '{}'::jsonb;
