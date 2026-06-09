ALTER TABLE elf_queries
    ADD COLUMN IF NOT EXISTS probe_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS field_mapping_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS check_kind VARCHAR(32) NOT NULL DEFAULT 'raw',
    ADD COLUMN IF NOT EXISTS check_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS generated_search_body_json JSONB,
    ADD COLUMN IF NOT EXISTS last_probe_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS last_probe_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb;
