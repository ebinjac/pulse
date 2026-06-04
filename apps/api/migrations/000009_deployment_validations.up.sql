CREATE TABLE IF NOT EXISTS deployment_validations (
    id TEXT PRIMARY KEY,
    application_id TEXT REFERENCES applications(id) ON DELETE CASCADE,
    application_name TEXT NOT NULL,
    car_id VARCHAR(64) NOT NULL,
    name TEXT NOT NULL,
    version TEXT,
    build_id TEXT,
    environment TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    monitor_ids_json JSONB DEFAULT '[]'::jsonb,
    report_json JSONB DEFAULT '{}'::jsonb,
    pre_started_at TIMESTAMP,
    pre_completed_at TIMESTAMP,
    post_started_at TIMESTAMP,
    post_completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deployment_validation_runs (
    validation_id TEXT REFERENCES deployment_validations(id) ON DELETE CASCADE,
    phase VARCHAR(50) NOT NULL,
    monitor_id TEXT REFERENCES monitors(id) ON DELETE CASCADE,
    run_id TEXT REFERENCES monitor_runs(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (validation_id, phase, monitor_id, run_id)
);

CREATE INDEX IF NOT EXISTS idx_deployment_validations_application_created
    ON deployment_validations (application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deployment_validation_runs_validation_phase
    ON deployment_validation_runs (validation_id, phase);
