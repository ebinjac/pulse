ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS published_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS has_unpublished_draft BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS monitor_drafts (
  monitor_id TEXT PRIMARY KEY REFERENCES monitors(id) ON DELETE CASCADE,
  config_json JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitor_versions (
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  config_json JSONB NOT NULL,
  change_note TEXT,
  created_by TEXT,
  source VARCHAR(50) NOT NULL DEFAULT 'publish',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (monitor_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_monitor_versions_monitor
  ON monitor_versions (monitor_id, version_number DESC);
