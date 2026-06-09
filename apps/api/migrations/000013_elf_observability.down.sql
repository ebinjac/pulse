ALTER TABLE deployment_validations
    DROP COLUMN IF EXISTS signal_pack_ids_json,
    DROP COLUMN IF EXISTS observability_profile,
    DROP COLUMN IF EXISTS service_ids_json;

ALTER TABLE elf_queries
    DROP COLUMN IF EXISTS service_id,
    DROP COLUMN IF EXISTS comparison_config_json,
    DROP COLUMN IF EXISTS signal_type;

ALTER TABLE monitors
    DROP COLUMN IF EXISTS service_id;

DROP INDEX IF EXISTS idx_application_services_log_name;
DROP INDEX IF EXISTS idx_application_services_app;
DROP TABLE IF EXISTS application_services;

ALTER TABLE applications
    DROP COLUMN IF EXISTS log_field_mapping_json;
