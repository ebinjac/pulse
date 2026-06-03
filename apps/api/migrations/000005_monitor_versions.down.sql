DROP INDEX IF EXISTS idx_monitor_versions_monitor;
DROP TABLE IF EXISTS monitor_versions;
DROP TABLE IF EXISTS monitor_drafts;

ALTER TABLE monitors
  DROP COLUMN IF EXISTS has_unpublished_draft,
  DROP COLUMN IF EXISTS published_version;
