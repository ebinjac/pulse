ALTER TABLE elf_queries
    DROP COLUMN IF EXISTS probe_config_json,
    DROP COLUMN IF EXISTS field_mapping_json,
    DROP COLUMN IF EXISTS check_kind,
    DROP COLUMN IF EXISTS check_config_json,
    DROP COLUMN IF EXISTS generated_search_body_json,
    DROP COLUMN IF EXISTS last_probe_at,
    DROP COLUMN IF EXISTS last_probe_summary_json;
