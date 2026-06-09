ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS elf_app_id VARCHAR(64);

CREATE TABLE IF NOT EXISTS elf_queries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    elf_app_id VARCHAR(64),
    index_path_template TEXT,
    search_body_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    gate_mode VARCHAR(20) NOT NULL DEFAULT 'advisory',
    pass_criteria_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
    tags_json JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_elf_queries_application ON elf_queries (application_id);
CREATE INDEX IF NOT EXISTS idx_elf_queries_active ON elf_queries (is_active);

ALTER TABLE deployment_validations
    ADD COLUMN IF NOT EXISTS elf_query_ids_json JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS auto_run_log_check BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS elf_results_json JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS log_started_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS log_completed_at TIMESTAMP;

INSERT INTO system_settings (key, value_json)
VALUES (
    'elfProxy',
    '{"baseUrl":"https://elfproxy-dev.aexp.com","indexPathTemplate":"*:elf-{{elfAppId}}-*","pretty":true,"timeoutSeconds":30}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
