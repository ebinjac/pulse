ALTER TABLE deployment_validations
    DROP COLUMN IF EXISTS ai_report_json,
    DROP COLUMN IF EXISTS interval_seconds,
    DROP COLUMN IF EXISTS sample_count;
