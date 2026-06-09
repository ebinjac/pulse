package httpapi

import (
	"net/http"
	"strings"

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

	deliveries := alerting.NewService(s.store, s.events).TestNotifications(overrides)
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
type notificationSettingsPayload struct {
	SMTPHost        string `json:"smtpHost"`
	SMTPPort        string `json:"smtpPort"`
	SMTPFrom        string `json:"smtpFrom"`
	SMTPTo          string `json:"smtpTo"`
	SMTPUser        string `json:"smtpUser"`
	SMTPPassword    string `json:"smtpPassword"`
	SlackWebhookURL string `json:"slackWebhookUrl"`
}

func (s *Server) getNotificationSettings(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"settings": map[string]any{
			"smtp": map[string]any{
				"addrConfigured":     s.settingConfigured("alertSmtpAddr"),
				"fromConfigured":     s.settingConfigured("alertEmailFrom"),
				"toConfigured":       s.settingConfigured("alertEmailTo"),
				"userConfigured":     s.settingConfigured("alertSmtpUser"),
				"passwordConfigured": s.settingConfigured("alertSmtpPassword"),
			},
			"slack": map[string]any{
				"webhookConfigured": s.settingConfigured("slackWebhook"),
			},
		},
	})
}

func (s *Server) updateNotificationSettings(w http.ResponseWriter, r *http.Request) {
	var payload notificationSettingsPayload
	if !decodeJSON(w, r, &payload) {
		return
	}

	if payload.SMTPHost != "" || payload.SMTPPort != "" {
		host := strings.TrimSpace(payload.SMTPHost)
		port := strings.TrimSpace(payload.SMTPPort)
		if host == "" {
			writeError(w, http.StatusBadRequest, "SMTP host is required when updating SMTP address")
			return
		}
		if port == "" {
			port = "25"
		}
		if err := s.upsertSettingSecret("notification-smtp-addr", "alertSmtpAddr", "SMTP server address", host+":"+port); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if err := s.upsertOptionalSetting("notification-email-from", "alertEmailFrom", "Alert email sender", payload.SMTPFrom); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.upsertOptionalSetting("notification-email-to", "alertEmailTo", "Alert email recipients", payload.SMTPTo); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.upsertOptionalSetting("notification-smtp-user", "alertSmtpUser", "SMTP username", payload.SMTPUser); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.upsertOptionalSetting("notification-smtp-password", "alertSmtpPassword", "SMTP password", payload.SMTPPassword); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.upsertOptionalSetting("notification-slack-webhook", "slackWebhook", "Slack incoming webhook URL", payload.SlackWebhookURL); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	s.getNotificationSettings(w, r)
}

func (s *Server) settingConfigured(alias string) bool {
	_, ok := s.store.GetRawSecretValue(alias)
	return ok
}

func (s *Server) upsertOptionalSetting(id string, alias string, name string, value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}

	return s.upsertSettingSecret(id, alias, name, value)
}

func (s *Server) upsertSettingSecret(id string, alias string, name string, value string) error {
	_, err := s.store.UpsertSecret(domain.SecretReference{
		ID:          "sec-" + id,
		Name:        name,
		Alias:       alias,
		Description: "Runtime notification setting managed from Pulse settings.",
		Provider:    "encrypted-db",
		MaskedValue: "********",
		IsActive:    true,
		RawValue:    value,
	})

	return err
}
