CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value_json)
VALUES ('retention', '{"runsRetentionDays":90,"enabled":true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
