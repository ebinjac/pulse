package store

import (
	"context"
	"encoding/json"
	"log"
	"time"

	pulsedb "github.com/ensemble-pulse/pulse/apps/api/internal/db"
	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
)

func (s *PostgresStore) GetRetentionSettings() domain.RetentionSettings {
	row, err := s.queries.GetSystemSetting(context.Background(), retentionSettingsKey)
	if err != nil {
		if err == pgx.ErrNoRows {
			return defaultRetentionSettings()
		}
		log.Printf("get retention settings: %v", err)
		return defaultRetentionSettings()
	}

	settings := domain.RetentionSettings{}
	if len(row.ValueJson) > 0 {
		if err := json.Unmarshal(row.ValueJson, &settings); err != nil {
			log.Printf("decode retention settings: %v", err)
			return defaultRetentionSettings()
		}
	}

	return normalizeRetentionSettings(settings)
}

func (s *PostgresStore) UpdateRetentionSettings(settings domain.RetentionSettings) domain.RetentionSettings {
	normalized := normalizeRetentionSettings(settings)
	payload, err := json.Marshal(normalized)
	if err != nil {
		log.Printf("encode retention settings: %v", err)
		return normalized
	}

	if err := s.queries.UpsertSystemSetting(context.Background(), pulsedb.UpsertSystemSettingParams{
		Key:       retentionSettingsKey,
		ValueJson: payload,
	}); err != nil {
		log.Printf("update retention settings: %v", err)
	}

	return normalized
}

func (s *PostgresStore) PurgeExpiredRuns(retentionDays int) (int, error) {
	if retentionDays <= 0 {
		return 0, nil
	}
	cutoff := time.Now().UTC().Add(-time.Duration(retentionDays) * 24 * time.Hour)
	deleted, err := s.queries.DeleteRunsOlderThan(context.Background(), pgTimestamp(cutoff))
	if err != nil {
		return 0, err
	}
	return int(deleted), nil
}
