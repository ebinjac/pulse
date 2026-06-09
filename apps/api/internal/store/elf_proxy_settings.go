package store

import (
	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

const elfProxySettingsKey = "elfProxy"

func defaultElfProxySettings() domain.ElfProxySettings {
	return domain.ElfProxySettings{
		BaseURL:        "https://elfproxy-dev.aexp.com",
		Pretty:         true,
		TimeoutSeconds: 30,
	}
}

func normalizeElfProxySettings(settings domain.ElfProxySettings) domain.ElfProxySettings {
	defaults := defaultElfProxySettings()
	if settings.BaseURL == "" {
		settings.BaseURL = defaults.BaseURL
	}
	if settings.TimeoutSeconds <= 0 {
		settings.TimeoutSeconds = defaults.TimeoutSeconds
	}
	return settings
}

func (s *MemoryStore) GetElfProxySettings() domain.ElfProxySettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.elfProxy.BaseURL == "" {
		return defaultElfProxySettings()
	}
	return normalizeElfProxySettings(s.elfProxy)
}

func (s *MemoryStore) UpdateElfProxySettings(settings domain.ElfProxySettings) domain.ElfProxySettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.elfProxy = normalizeElfProxySettings(settings)
	return s.elfProxy
}
