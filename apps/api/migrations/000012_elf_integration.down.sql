ALTER TABLE deployment_validations
    DROP COLUMN IF EXISTS log_completed_at,
    DROP COLUMN IF EXISTS log_started_at,
    DROP COLUMN IF EXISTS elf_results_json,
    DROP COLUMN IF EXISTS auto_run_log_check,
    DROP COLUMN IF EXISTS elf_query_ids_json;

DROP TABLE IF EXISTS elf_queries;

ALTER TABLE applications
    DROP COLUMN IF EXISTS elf_app_id;

DELETE FROM system_settings WHERE key = 'elfProxy';
