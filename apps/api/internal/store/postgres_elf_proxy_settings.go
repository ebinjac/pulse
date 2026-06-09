package store

import (
	"context"
	"encoding/json"
	"log"

	pulsedb "github.com/ensemble-pulse/pulse/apps/api/internal/db"
	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
)

func (s *PostgresStore) GetElfProxySettings() domain.ElfProxySettings {
	row, err := s.queries.GetSystemSetting(context.Background(), elfProxySettingsKey)
	if err != nil {
		if err == pgx.ErrNoRows {
			return defaultElfProxySettings()
		}
		log.Printf("get elf proxy settings: %v", err)
		return defaultElfProxySettings()
	}

	settings := domain.ElfProxySettings{}
	if len(row.ValueJson) > 0 {
		if err := json.Unmarshal(row.ValueJson, &settings); err != nil {
			log.Printf("decode elf proxy settings: %v", err)
			return defaultElfProxySettings()
		}
	}
	return normalizeElfProxySettings(settings)
}

func (s *PostgresStore) UpdateElfProxySettings(settings domain.ElfProxySettings) domain.ElfProxySettings {
	normalized := normalizeElfProxySettings(settings)
	payload, err := json.Marshal(normalized)
	if err != nil {
		log.Printf("encode elf proxy settings: %v", err)
		return normalized
	}
	if err := s.queries.UpsertSystemSetting(context.Background(), pulsedb.UpsertSystemSettingParams{
		Key:       elfProxySettingsKey,
		ValueJson: payload,
	}); err != nil {
		log.Printf("update elf proxy settings: %v", err)
	}
	return normalized
}
