ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS log_field_mapping_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS application_services (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    log_service_name TEXT NOT NULL,
    squad TEXT,
    owner TEXT,
    environment TEXT,
    elf_app_id VARCHAR(64),
    log_field_mapping_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_services_app ON application_services (application_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_application_services_log_name
    ON application_services (application_id, log_service_name);

ALTER TABLE monitors
    ADD COLUMN IF NOT EXISTS service_id TEXT REFERENCES application_services(id) ON DELETE SET NULL;

ALTER TABLE elf_queries
    ADD COLUMN IF NOT EXISTS signal_type VARCHAR(64) NOT NULL DEFAULT 'custom',
    ADD COLUMN IF NOT EXISTS comparison_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS service_id TEXT REFERENCES application_services(id) ON DELETE SET NULL;

ALTER TABLE deployment_validations
    ADD COLUMN IF NOT EXISTS service_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS observability_profile VARCHAR(32) NOT NULL DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS signal_pack_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb;
