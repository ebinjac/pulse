ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS alert_routing_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS acknowledged_by TEXT,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMP,
  ADD COLUMN IF NOT EXISTS suppression_reason TEXT;

CREATE TABLE IF NOT EXISTS alert_maintenance_windows (
  id TEXT PRIMARY KEY,
  scope_type VARCHAR(20) NOT NULL,
  scope_id TEXT,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  reason TEXT,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_maintenance_active
  ON alert_maintenance_windows (ends_at DESC, scope_type, scope_id);
