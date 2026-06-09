package alerting

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/events"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

type Service struct {
	store      store.Store
	httpClient *http.Client
	events     events.Publisher
}

func NewService(store store.Store, pub events.Publisher) *Service {
	if pub == nil {
		pub = events.NoopPublisher{}
	}
	return &Service{
		store:      store,
		httpClient: &http.Client{Timeout: 10 * time.Second},
		events:     pub,
	}
}

func (s *Service) ProcessRun(monitor domain.Monitor, run domain.MonitorRun) {
	application := domain.Application{}
	if monitor.ApplicationID != "" {
		if app, ok := s.store.GetApplication(monitor.ApplicationID); ok {
			application = app
		}
	}

	policy := ResolveAlertPolicy(monitor, application)
	if !policy.Enabled {
		return
	}

	if run.Status == domain.StatusSuccess {
		if resolved := s.store.ResolveOpenAlerts(monitor.ID, run.EndedAt); resolved > 0 {
			events.PublishAlertResolved(s.events, monitor.ID, run.EndedAt)
		}
		return
	}

	threshold := policy.Threshold
	if threshold <= 0 {
		threshold = 1
	}
	if s.consecutiveFailures(monitor.ID) < threshold {
		return
	}

	now := time.Now().UTC()
	channels := channelsForResolved(policy)

	if reason, under := s.store.IsUnderMaintenance(monitor.ID, monitor.ApplicationID, now); under {
		s.persistSuppressed(monitor, run, policy, channels, now, reason, "maintenance window")
		return
	}

	alert, exists := s.store.GetOpenAlert(monitor.ID)
	created := !exists
	if !exists {
		alert = domain.AlertEvent{
			ID:               "alert-" + run.ID,
			MonitorID:        monitor.ID,
			Status:           domain.AlertStatusOpen,
			Severity:         severityForRunWithPolicy(run, policy),
			FirstTriggeredAt: run.EndedAt,
			CreatedAt:        now,
		}
	}

	alert.RunID = run.ID
	alert.Severity = severityForRunWithPolicy(run, policy)
	alert.Title = monitor.Name + " is failing"
	alert.Description = descriptionForRun(run)
	alert.FailureCategory = run.FailureCategory
	alert.Channels = channels
	alert.LastTriggeredAt = run.EndedAt

	if alert.Status == domain.AlertStatusAcknowledged {
		s.store.SaveAlert(alert)
		return
	}

	if alert.SnoozedUntil != nil && now.Before(*alert.SnoozedUntil) {
		alert.Status = domain.AlertStatusSuppressed
		if alert.SuppressionReason == "" {
			alert.SuppressionReason = "snoozed"
		}
		s.store.SaveAlert(alert)
		return
	}

	if alert.Status == domain.AlertStatusSuppressed && alert.SnoozedUntil != nil && !now.Before(*alert.SnoozedUntil) {
		alert.Status = domain.AlertStatusOpen
		alert.SnoozedUntil = nil
		alert.SuppressionReason = ""
	}

	alert.Status = domain.AlertStatusOpen

	if cooldownActive(alert.LastDeliveredAt, policy.CooldownMinutes, now) {
		alert.Deliveries = []domain.AlertDelivery{{
			Channel: "cooldown",
			Status:  "suppressed",
			Detail:  fmt.Sprintf("delivery suppressed for %d minute cooldown", policy.CooldownMinutes),
			SentAt:  now,
		}}
		s.store.SaveAlert(alert)
		return
	}

	alert.Deliveries = s.deliver(monitor, run, policy, alert.Channels, now)
	if hasDelivered(alert.Deliveries) {
		alert.LastDeliveredAt = &now
	}
	s.store.SaveAlert(alert)
	if created && alert.Status == domain.AlertStatusOpen {
		events.PublishAlertCreated(s.events, alert)
	}
}

func (s *Service) persistSuppressed(monitor domain.Monitor, run domain.MonitorRun, policy ResolvedAlertPolicy, channels []string, now time.Time, maintenanceReason, label string) {
	alert, exists := s.store.GetOpenAlert(monitor.ID)
	if !exists {
		alert = domain.AlertEvent{
			ID:               "alert-" + run.ID,
			MonitorID:        monitor.ID,
			FirstTriggeredAt: run.EndedAt,
			CreatedAt:        now,
		}
	}
	alert.RunID = run.ID
	alert.Status = domain.AlertStatusSuppressed
	alert.Severity = severityForRunWithPolicy(run, policy)
	alert.Title = monitor.Name + " is failing"
	alert.Description = descriptionForRun(run)
	alert.FailureCategory = run.FailureCategory
	alert.Channels = channels
	alert.LastTriggeredAt = run.EndedAt
	alert.SuppressionReason = label + ": " + maintenanceReason
	alert.Deliveries = []domain.AlertDelivery{{
		Channel: "maintenance",
		Status:  "suppressed",
		Detail:  alert.SuppressionReason,
		SentAt:  now,
	}}
	s.store.SaveAlert(alert)
}

func (s *Service) consecutiveFailures(monitorID string) int {
	runs := s.store.ListRuns(monitorID)
	sort.Slice(runs, func(i, j int) bool {
		return runs[i].StartedAt.After(runs[j].StartedAt)
	})

	count := 0
	for _, run := range runs {
		if run.Status == domain.StatusSuccess {
			break
		}
		count++
	}

	return count
}

func (s *Service) deliver(monitor domain.Monitor, run domain.MonitorRun, policy ResolvedAlertPolicy, channels []string, now time.Time) []domain.AlertDelivery {
	deliveries := make([]domain.AlertDelivery, 0, len(channels))
	for _, channel := range channels {
		switch channel {
		case "slack":
			deliveries = append(deliveries, s.deliverSlack(monitor, run, policy, now))
		case "email":
			deliveries = append(deliveries, s.deliverEmail(monitor, run, policy, now))
		}
	}
	if len(deliveries) == 0 {
		deliveries = append(deliveries, domain.AlertDelivery{
			Channel: "none",
			Status:  "skipped",
			Detail:  "no alert channels enabled",
			SentAt:  now,
		})
	}

	return deliveries
}

func (s *Service) deliverSlack(monitor domain.Monitor, run domain.MonitorRun, policy ResolvedAlertPolicy, now time.Time) domain.AlertDelivery {
	webhookURL := s.slackWebhookURL(policy)
	if webhookURL == "" || strings.Contains(webhookURL, "example") {
		return domain.AlertDelivery{Channel: "slack", Status: "skipped", Detail: "Slack webhook not configured", SentAt: now}
	}

	onCall := ""
	if len(policy.OnCallTargets) > 0 {
		onCall = " On-call: " + strings.Join(policy.OnCallTargets, ", ")
	}
	payload := map[string]string{
		"text": fmt.Sprintf("Pulse alert [%s]: %s is %s.%s %s", policy.Severity, monitor.Name, run.Status, onCall, descriptionForRun(run)),
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		return domain.AlertDelivery{Channel: "slack", Status: "failed", Detail: err.Error(), SentAt: now}
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		log.Printf("slack alert delivery failed for monitor %s: %v", monitor.ID, err)
		return domain.AlertDelivery{Channel: "slack", Status: "failed", Detail: err.Error(), SentAt: now}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return domain.AlertDelivery{Channel: "slack", Status: "failed", Detail: resp.Status, SentAt: now}
	}

	return domain.AlertDelivery{Channel: "slack", Status: "sent", Detail: "Slack webhook accepted alert", SentAt: now}
}

func (s *Service) deliverEmail(monitor domain.Monitor, run domain.MonitorRun, policy ResolvedAlertPolicy, now time.Time) domain.AlertDelivery {
	addr := s.secretAliasOrEnv("alertSmtpAddr", "PULSE_ALERT_SMTP_ADDR")
	from := s.secretAliasOrEnv("alertEmailFrom", "PULSE_ALERT_EMAIL_FROM")
	to := policy.EmailTo
	if len(to) == 0 {
		to = splitCSV(s.secretAliasOrEnv("alertEmailTo", "PULSE_ALERT_EMAIL_TO"))
	}
	if addr == "" || from == "" || len(to) == 0 {
		return domain.AlertDelivery{Channel: "email", Status: "skipped", Detail: "SMTP alert email not configured", SentAt: now}
	}

	host := addr
	if strings.Contains(addr, ":") {
		host = strings.Split(addr, ":")[0]
	}
	var auth smtp.Auth
	if user := s.secretAliasOrEnv("alertSmtpUser", "PULSE_ALERT_SMTP_USER"); user != "" {
		auth = smtp.PlainAuth("", user, s.secretAliasOrEnv("alertSmtpPassword", "PULSE_ALERT_SMTP_PASSWORD"), host)
	}

	subject := fmt.Sprintf("Pulse alert [%s]: %s is %s", policy.Severity, monitor.Name, run.Status)
	onCallLine := ""
	if len(policy.OnCallTargets) > 0 {
		onCallLine = "On-call: " + strings.Join(policy.OnCallTargets, ", ") + "\r\n"
	}
	message := strings.Join([]string{
		"From: " + from,
		"To: " + strings.Join(to, ", "),
		"Subject: " + subject,
		"Content-Type: text/plain; charset=UTF-8",
		"",
		subject,
		"",
		descriptionForRun(run),
		onCallLine,
		"Run ID: " + run.ID,
		"Failure category: " + string(run.FailureCategory),
		"Duration: " + strconv.Itoa(run.DurationMS) + "ms",
	}, "\r\n")

	if err := smtp.SendMail(addr, auth, from, to, []byte(message)); err != nil {
		log.Printf("email alert delivery failed for monitor %s: %v", monitor.ID, err)
		return domain.AlertDelivery{Channel: "email", Status: "failed", Detail: err.Error(), SentAt: now}
	}

	return domain.AlertDelivery{Channel: "email", Status: "sent", Detail: "SMTP accepted alert", SentAt: now}
}

func (s *Service) slackWebhookURL(policy ResolvedAlertPolicy) string {
	candidate := strings.TrimSpace(policy.SlackWebhookSecret)
	if candidate != "" {
		if strings.HasPrefix(candidate, "http") {
			return candidate
		}
		if value, ok := s.store.GetRawSecretValue(candidate); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return s.secretAliasOrEnv("slackWebhook", "PULSE_ALERT_SLACK_WEBHOOK_URL")
}

func (s *Service) secretAliasOrEnv(alias string, envKey string) string {
	if value, ok := s.store.GetRawSecretValue(alias); ok && strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}

	return strings.TrimSpace(os.Getenv(envKey))
}

func cooldownActive(lastDeliveredAt *time.Time, cooldownMinutes int, now time.Time) bool {
	if lastDeliveredAt == nil || cooldownMinutes <= 0 {
		return false
	}

	return now.Before(lastDeliveredAt.Add(time.Duration(cooldownMinutes) * time.Minute))
}

func hasDelivered(deliveries []domain.AlertDelivery) bool {
	for _, delivery := range deliveries {
		if delivery.Status == "sent" {
			return true
		}
	}

	return false
}

func severityForRun(run domain.MonitorRun) string {
	if run.Status == domain.StatusFailed || run.Status == domain.StatusError {
		return "critical"
	}

	return "warning"
}

func descriptionForRun(run domain.MonitorRun) string {
	if strings.TrimSpace(run.FailureReason) != "" {
		return run.FailureReason
	}

	return "Monitor run did not complete successfully."
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	cleaned := []string{}
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item != "" {
			cleaned = append(cleaned, item)
		}
	}

	return cleaned
}
