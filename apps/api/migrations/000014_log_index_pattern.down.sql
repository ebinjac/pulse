ALTER TABLE application_services
    DROP COLUMN IF EXISTS index_path_template;

ALTER TABLE applications
    DROP COLUMN IF EXISTS index_path_template;
