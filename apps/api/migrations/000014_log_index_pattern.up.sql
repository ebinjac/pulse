ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS index_path_template TEXT;

ALTER TABLE application_services
    ADD COLUMN IF NOT EXISTS index_path_template TEXT;
