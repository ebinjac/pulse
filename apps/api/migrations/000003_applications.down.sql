DROP INDEX IF EXISTS idx_monitors_application;
DROP INDEX IF EXISTS idx_applications_car_id;

ALTER TABLE monitors
    DROP COLUMN IF EXISTS application_id;

DROP TABLE IF EXISTS applications;
