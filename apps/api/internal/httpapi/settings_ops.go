package httpapi

import (
	"net/http"

	"github.com/ensemble-pulse/pulse/apps/api/internal/alerting"
	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func (s *Server) testNotificationSettings(w http.ResponseWriter, r *http.Request) {
	var overrides domain.NotificationTestOverrides
	if r.Body != nil && r.ContentLength != 0 {
		if !decodeJSON(w, r, &overrides) {
			return
		}
	}

	deliveries := alerting.NewService(s.store).TestNotifications(overrides)
	ok := false
	for _, delivery := range deliveries {
		if delivery.Status == "sent" {
			ok = true
			break
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         ok,
		"deliveries": deliveries,
	})
}

func (s *Server) getRetentionSettings(w http.ResponseWriter, _ *http.Request) {
	settings := s.store.GetRetentionSettings()
	writeJSON(w, http.StatusOK, map[string]any{"settings": settings})
}

func (s *Server) updateRetentionSettings(w http.ResponseWriter, r *http.Request) {
	var settings domain.RetentionSettings
	if !decodeJSON(w, r, &settings) {
		return
	}

	updated := s.store.UpdateRetentionSettings(settings)
	writeJSON(w, http.StatusOK, map[string]any{"settings": updated})
}

func (s *Server) purgeRetention(w http.ResponseWriter, _ *http.Request) {
	settings := s.store.GetRetentionSettings()
	if !settings.Enabled {
		writeJSON(w, http.StatusOK, map[string]any{
			"deleted": 0,
			"enabled": false,
			"message": "retention purge is disabled",
		})
		return
	}

	deleted, err := s.store.PurgeExpiredRuns(settings.RunsRetentionDays)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"deleted":             deleted,
		"runsRetentionDays":   settings.RunsRetentionDays,
		"enabled":             settings.Enabled,
	})
}
