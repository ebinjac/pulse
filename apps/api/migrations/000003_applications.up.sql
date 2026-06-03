CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    car_id VARCHAR(64) UNIQUE NOT NULL,
    description TEXT,
    owner VARCHAR(255),
    environment VARCHAR(100),
    tags_json JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE monitors
    ADD COLUMN IF NOT EXISTS application_id TEXT REFERENCES applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applications_car_id ON applications (car_id);
CREATE INDEX IF NOT EXISTS idx_monitors_application ON monitors (application_id);
