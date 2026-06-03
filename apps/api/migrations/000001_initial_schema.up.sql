CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    car_id VARCHAR(64) UNIQUE NOT NULL,
    description TEXT,
    owner VARCHAR(255),
    environment VARCHAR(100),
    tags_json JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitors (
    id TEXT PRIMARY KEY,
    application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    schedule_mode VARCHAR(100),
    schedule_label VARCHAR(255),
    schedule_cron VARCHAR(100),
    timezone VARCHAR(100) DEFAULT 'UTC',
    timeout_ms INTEGER DEFAULT 30000,
    retry_count INTEGER DEFAULT 0,
    failure_threshold INTEGER DEFAULT 3,
    response_body_limit_kb INTEGER DEFAULT 32,
    is_active BOOLEAN DEFAULT TRUE,
    alert_enabled BOOLEAN DEFAULT FALSE,
    variables_json JSONB DEFAULT '{}'::jsonb,
    alert_policy_json JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50),
    last_run_at TIMESTAMP,
    last_duration_ms INTEGER DEFAULT 0,
    success_rate_24h NUMERIC DEFAULT 0,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitor_steps (
    id TEXT PRIMARY KEY,
    monitor_id TEXT REFERENCES monitors(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    step_type VARCHAR(100) NOT NULL,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    actions_json JSONB DEFAULT '[]'::jsonb,
    assertions_json JSONB DEFAULT '[]'::jsonb,
    extractors_json JSONB DEFAULT '[]'::jsonb,
    timeout_ms INTEGER,
    retry_count INTEGER DEFAULT 0,
    continue_on_failure BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (monitor_id, step_order)
);

CREATE TABLE IF NOT EXISTS secret_references (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    alias VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    provider VARCHAR(50) NOT NULL,
    secret_path TEXT,
    secret_key VARCHAR(255),
    encrypted_value TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitor_secret_bindings (
    id TEXT PRIMARY KEY,
    monitor_id TEXT REFERENCES monitors(id) ON DELETE CASCADE,
    secret_reference_id TEXT REFERENCES secret_references(id),
    alias VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (monitor_id, alias)
);

CREATE TABLE IF NOT EXISTS monitor_runs (
    id TEXT PRIMARY KEY,
    monitor_id TEXT REFERENCES monitors(id) ON DELETE CASCADE,
    status VARCHAR(50),
    failure_category VARCHAR(100),
    failure_reason TEXT,
    triggered_by VARCHAR(100),
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitor_step_runs (
    id TEXT PRIMARY KEY,
    monitor_run_id TEXT REFERENCES monitor_runs(id) ON DELETE CASCADE,
    step_id TEXT REFERENCES monitor_steps(id) ON DELETE SET NULL,
    step_order INTEGER,
    step_name VARCHAR(255),
    step_type VARCHAR(100),
    status VARCHAR(50),
    request_summary_json JSONB,
    response_summary_json JSONB,
    assertion_results_json JSONB DEFAULT '[]'::jsonb,
    extractor_results_json JSONB DEFAULT '[]'::jsonb,
    console_output_json JSONB DEFAULT '[]'::jsonb,
    timing_json JSONB DEFAULT '{}'::jsonb,
    latency_ms INTEGER,
    error_message TEXT,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    monitor_id TEXT REFERENCES monitors(id) ON DELETE CASCADE,
    run_id TEXT REFERENCES monitor_runs(id) ON DELETE SET NULL,
    status VARCHAR(50),
    severity VARCHAR(50),
    title VARCHAR(255),
    description TEXT,
    failure_category VARCHAR(100),
    channels_json JSONB DEFAULT '[]'::jsonb,
    deliveries_json JSONB DEFAULT '[]'::jsonb,
    first_triggered_at TIMESTAMP,
    last_triggered_at TIMESTAMP,
    last_delivered_at TIMESTAMP,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_car_id ON applications (car_id);
CREATE INDEX IF NOT EXISTS idx_monitors_application ON monitors (application_id);
CREATE INDEX IF NOT EXISTS idx_monitors_active_schedule ON monitors (is_active, schedule_cron);
CREATE INDEX IF NOT EXISTS idx_monitor_steps_monitor_order ON monitor_steps (monitor_id, step_order);
CREATE INDEX IF NOT EXISTS idx_monitor_runs_monitor_started ON monitor_runs (monitor_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_step_runs_run_order ON monitor_step_runs (monitor_run_id, step_order);
CREATE INDEX IF NOT EXISTS idx_alerts_monitor_status ON alerts (monitor_id, status);
