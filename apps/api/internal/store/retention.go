package store

import (
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

const retentionSettingsKey = "retention"

func defaultRetentionSettings() domain.RetentionSettings {
	return domain.RetentionSettings{
		RunsRetentionDays: 90,
		Enabled:           true,
	}
}

func normalizeRetentionSettings(settings domain.RetentionSettings) domain.RetentionSettings {
	if settings.RunsRetentionDays <= 0 {
		settings.RunsRetentionDays = 90
	}
	if settings.RunsRetentionDays < 7 {
		settings.RunsRetentionDays = 7
	}
	if settings.RunsRetentionDays > 365 {
		settings.RunsRetentionDays = 365
	}
	return settings
}

func (s *MemoryStore) GetRetentionSettings() domain.RetentionSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.retention.RunsRetentionDays == 0 {
		return defaultRetentionSettings()
	}
	return s.retention
}

func (s *MemoryStore) UpdateRetentionSettings(settings domain.RetentionSettings) domain.RetentionSettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.retention = normalizeRetentionSettings(settings)
	return s.retention
}

func (s *MemoryStore) PurgeExpiredRuns(retentionDays int) (int, error) {
	if retentionDays <= 0 {
		return 0, nil
	}
	cutoff := time.Now().UTC().Add(-time.Duration(retentionDays) * 24 * time.Hour)

	s.mu.Lock()
	defer s.mu.Unlock()

	deleted := 0
	for id, run := range s.runs {
		if run.StartedAt.Before(cutoff) {
			delete(s.runs, id)
			deleted++
		}
	}
	return deleted, nil
}
