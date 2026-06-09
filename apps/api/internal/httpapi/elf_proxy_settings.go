package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/elfsearch"
)

type elfProxySettingsPayload struct {
	BaseURL           string `json:"baseUrl"`
	IndexPathTemplate string `json:"indexPathTemplate"`
	Pretty            *bool  `json:"pretty"`
	TimeoutSeconds    int    `json:"timeoutSeconds"`
	BearerToken       string `json:"bearerToken"`
}

type elfProxyTestPayload struct {
	BaseURL           string `json:"baseUrl"`
	IndexPathTemplate string `json:"indexPathTemplate"`
	ElfAppID          string `json:"elfAppId"`
	Pretty            *bool  `json:"pretty"`
}

func (s *Server) getElfProxySettings(w http.ResponseWriter, _ *http.Request) {
	settings := s.store.GetElfProxySettings()
	writeJSON(w, http.StatusOK, map[string]any{
		"settings": map[string]any{
			"baseUrl":               settings.BaseURL,
			"indexPathTemplate":     settings.IndexPathTemplate,
			"pretty":                settings.Pretty,
			"timeoutSeconds":        settings.TimeoutSeconds,
			"bearerTokenConfigured": s.settingConfigured("elfProxyBearerToken"),
		},
	})
}

func (s *Server) updateElfProxySettings(w http.ResponseWriter, r *http.Request) {
	var payload elfProxySettingsPayload
	if !decodeJSON(w, r, &payload) {
		return
	}

	current := s.store.GetElfProxySettings()
	updated := current
	if strings.TrimSpace(payload.BaseURL) != "" {
		updated.BaseURL = strings.TrimSpace(payload.BaseURL)
	}
	updated.IndexPathTemplate = strings.TrimSpace(payload.IndexPathTemplate)
	if payload.Pretty != nil {
		updated.Pretty = *payload.Pretty
	}
	if payload.TimeoutSeconds > 0 {
		updated.TimeoutSeconds = payload.TimeoutSeconds
	}
	updated = s.store.UpdateElfProxySettings(updated)
	if strings.TrimSpace(payload.BearerToken) != "" {
		if err := s.upsertSettingSecret("elf-proxy-bearer-token", "elfProxyBearerToken", "ELF proxy bearer token", payload.BearerToken); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	s.getElfProxySettings(w, r)
	_ = updated
}

func (s *Server) testElfProxySettings(w http.ResponseWriter, r *http.Request) {
	var payload elfProxyTestPayload
	if !decodeJSON(w, r, &payload) {
		return
	}

	settings, err := elfsearch.MergeProxySettings(s.store.GetElfProxySettings(), payload.BaseURL, payload.Pretty)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	indexTemplate := strings.TrimSpace(payload.IndexPathTemplate)
	if indexTemplate == "" {
		indexTemplate = strings.TrimSpace(settings.IndexPathTemplate)
	}
	if indexTemplate == "" {
		writeError(w, http.StatusBadRequest, "index pattern is required (for example app-logs-*)")
		return
	}

	query := domain.ElfQuery{
		Name:              "ELF proxy connectivity test",
		IndexPathTemplate: indexTemplate,
		SearchBody:        []byte(`{"query":{"match_all":{}},"size":0}`),
		GateMode:          "advisory",
		PassCriteria: domain.ElfPassCriteria{
			Type:      "max_hits",
			Threshold: 0,
		},
		ElfAppID: strings.TrimSpace(payload.ElfAppID),
	}
	application := domain.Application{ElfAppID: strings.TrimSpace(payload.ElfAppID)}

	prepared, err := elfsearch.PrepareSearch(settings, s.store, query, application, elfsearch.SearchContext{
		ElfAppID: strings.TrimSpace(payload.ElfAppID),
	}, nil)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":    false,
			"curl":  prepared.Curl,
			"error": err.Error(),
		})
		return
	}

	runner := &elfsearch.Runner{Settings: s.store, Secrets: s.store}
	if strings.TrimSpace(payload.BaseURL) != "" || payload.Pretty != nil {
		overrideSettings := settings
		runner.Settings = staticElfSettings{settings: overrideSettings}
	}

	result, runErr := runner.RunQuery(context.Background(), query, application, elfsearch.SearchContext{
		ElfAppID: strings.TrimSpace(payload.ElfAppID),
	})
	result.ResolvedURL = prepared.SearchURL
	ok := runErr == nil && result.ErrorMessage == ""
	errorMessage := result.ErrorMessage
	if runErr != nil && errorMessage == "" {
		errorMessage = runErr.Error()
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        ok,
		"curl":      prepared.Curl,
		"searchUrl": prepared.SearchURL,
		"indexPath": prepared.IndexPath,
		"result":    result,
		"error":     errorMessage,
	})
}

type staticElfSettings struct {
	settings domain.ElfProxySettings
}

func (s staticElfSettings) GetElfProxySettings() domain.ElfProxySettings {
	return s.settings
}
