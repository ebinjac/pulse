package alerting

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/smtp"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func (s *Service) TestNotifications(overrides domain.NotificationTestOverrides) []domain.AlertDelivery {
	now := time.Now().UTC()
	channels := normalizeTestChannels(overrides.Channels)

	monitor := domain.Monitor{
		ID:   "mon-test-notification",
		Name: "Pulse notification test",
	}
	run := domain.MonitorRun{
		ID:              "run-test-notification",
		MonitorID:       monitor.ID,
		MonitorName:     monitor.Name,
		Status:          domain.StatusFailed,
		TriggeredBy:     "test",
		StartedAt:       now,
		EndedAt:         now,
		DurationMS:      1,
		FailureCategory: domain.FailureAssertion,
		FailureReason:   "This is a test alert from Pulse settings. No incident was triggered.",
	}

	policy := ResolvedAlertPolicy{
		Severity: "info",
		EmailTo:  splitCSV(overrides.SMTPTo),
	}

	deliveries := make([]domain.AlertDelivery, 0, len(channels))
	for _, channel := range channels {
		switch channel {
		case "email":
			deliveries = append(deliveries, s.deliverTestEmail(monitor, run, policy, overrides, now))
		case "slack":
			deliveries = append(deliveries, s.deliverTestSlack(monitor, run, overrides, now))
		default:
			deliveries = append(deliveries, domain.AlertDelivery{
				Channel: channel,
				Status:  "skipped",
				Detail:  "unknown channel",
				SentAt:  now,
			})
		}
	}

	if len(deliveries) == 0 {
		deliveries = append(deliveries, domain.AlertDelivery{
			Channel: "none",
			Status:  "skipped",
			Detail:  "no channels selected for test",
			SentAt:  now,
		})
	}

	return deliveries
}

func (s *Service) deliverTestEmail(monitor domain.Monitor, run domain.MonitorRun, policy ResolvedAlertPolicy, overrides domain.NotificationTestOverrides, now time.Time) domain.AlertDelivery {
	addr := s.smtpAddr(overrides)
	from := s.settingOrOverride("alertEmailFrom", "PULSE_ALERT_EMAIL_FROM", overrides.SMTPFrom)
	to := policy.EmailTo
	if len(to) == 0 {
		to = splitCSV(s.settingOrOverride("alertEmailTo", "PULSE_ALERT_EMAIL_TO", overrides.SMTPTo))
	}
	if addr == "" || from == "" || len(to) == 0 {
		return domain.AlertDelivery{Channel: "email", Status: "skipped", Detail: "SMTP alert email not configured", SentAt: now}
	}

	host := addr
	if strings.Contains(addr, ":") {
		host = strings.Split(addr, ":")[0]
	}
	var auth smtp.Auth
	if user := s.settingOrOverride("alertSmtpUser", "PULSE_ALERT_SMTP_USER", overrides.SMTPUser); user != "" {
		auth = smtp.PlainAuth("", user, s.settingOrOverride("alertSmtpPassword", "PULSE_ALERT_SMTP_PASSWORD", overrides.SMTPPassword), host)
	}

	subject := "Pulse test alert: notification channel check"
	message := strings.Join([]string{
		"From: " + from,
		"To: " + strings.Join(to, ", "),
		"Subject: " + subject,
		"Content-Type: text/plain; charset=UTF-8",
		"",
		subject,
		"",
		run.FailureReason,
		"",
		"If you received this message, Pulse SMTP delivery is configured correctly.",
	}, "\r\n")

	if err := smtp.SendMail(addr, auth, from, to, []byte(message)); err != nil {
		return domain.AlertDelivery{Channel: "email", Status: "failed", Detail: err.Error(), SentAt: now}
	}

	return domain.AlertDelivery{Channel: "email", Status: "sent", Detail: "SMTP accepted test alert", SentAt: now}
}

func (s *Service) deliverTestSlack(monitor domain.Monitor, run domain.MonitorRun, overrides domain.NotificationTestOverrides, now time.Time) domain.AlertDelivery {
	webhookURL := s.slackURL(overrides)
	if webhookURL == "" || strings.Contains(webhookURL, "example") {
		return domain.AlertDelivery{Channel: "slack", Status: "skipped", Detail: "Slack webhook not configured", SentAt: now}
	}

	payload := map[string]string{
		"text": "Pulse test alert: Slack notification channel check. " + run.FailureReason,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		return domain.AlertDelivery{Channel: "slack", Status: "failed", Detail: err.Error(), SentAt: now}
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return domain.AlertDelivery{Channel: "slack", Status: "failed", Detail: err.Error(), SentAt: now}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return domain.AlertDelivery{Channel: "slack", Status: "failed", Detail: resp.Status, SentAt: now}
	}

	return domain.AlertDelivery{Channel: "slack", Status: "sent", Detail: "Slack webhook accepted test alert", SentAt: now}
}

func (s *Service) smtpAddr(overrides domain.NotificationTestOverrides) string {
	if strings.TrimSpace(overrides.SMTPHost) != "" {
		port := strings.TrimSpace(overrides.SMTPPort)
		if port == "" {
			port = "25"
		}
		return strings.TrimSpace(overrides.SMTPHost) + ":" + port
	}
	return s.secretAliasOrEnv("alertSmtpAddr", "PULSE_ALERT_SMTP_ADDR")
}

func (s *Service) slackURL(overrides domain.NotificationTestOverrides) string {
	if url := strings.TrimSpace(overrides.SlackWebhookURL); url != "" {
		return url
	}
	return s.slackWebhookURL(ResolvedAlertPolicy{})
}

func (s *Service) settingOrOverride(alias, envKey, override string) string {
	if strings.TrimSpace(override) != "" {
		return strings.TrimSpace(override)
	}
	return s.secretAliasOrEnv(alias, envKey)
}

func normalizeTestChannels(channels []string) []string {
	if len(channels) == 0 {
		return []string{"email", "slack"}
	}
	normalized := make([]string, 0, len(channels))
	seen := map[string]bool{}
	for _, channel := range channels {
		item := strings.ToLower(strings.TrimSpace(channel))
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		normalized = append(normalized, item)
	}
	return normalized
}
