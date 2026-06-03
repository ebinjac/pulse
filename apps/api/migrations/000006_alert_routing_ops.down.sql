DROP INDEX IF EXISTS idx_alert_maintenance_active;
DROP TABLE IF EXISTS alert_maintenance_windows;

ALTER TABLE alerts
  DROP COLUMN IF EXISTS suppression_reason,
  DROP COLUMN IF EXISTS snoozed_until,
  DROP COLUMN IF EXISTS acknowledged_at,
  DROP COLUMN IF EXISTS acknowledged_by;

ALTER TABLE applications
  DROP COLUMN IF EXISTS alert_routing_json;
