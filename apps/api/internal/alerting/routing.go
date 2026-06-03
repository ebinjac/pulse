package alerting

import (
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type ResolvedAlertPolicy struct {
	Enabled          bool
	Threshold        int
	ResponseTimeMS   int
	CooldownMinutes  int
	Severity         string
	Email            bool
	SlackWebhook     bool
	EmailTo          []string
	OnCallTargets    []string
	SlackWebhookSecret string
}

func ResolveAlertPolicy(monitor domain.Monitor, application domain.Application) ResolvedAlertPolicy {
	mon := monitor.AlertPolicy
	app := application.AlertRouting

	resolved := ResolvedAlertPolicy{
		Enabled:         monitor.AlertEnabled || mon.Enabled,
		Threshold:       pickInt(mon.Threshold, monitor.FailureThreshold, app.Threshold, 1),
		ResponseTimeMS:  pickInt(mon.ResponseTimeMS, app.ResponseTimeMS, 0),
		CooldownMinutes: pickInt(mon.CooldownMinutes, app.CooldownMinutes, 30),
		Email:           mon.Email || app.Email,
		SlackWebhook:    mon.SlackWebhook || app.SlackWebhook,
	}

	if mon.InheritFromApplication || (!mon.Email && !mon.SlackWebhook && (app.Email || app.SlackWebhook)) {
		if app.Email {
			resolved.Email = true
		}
		if app.SlackWebhook {
			resolved.SlackWebhook = true
		}
		if mon.Threshold <= 0 && app.Threshold > 0 {
			resolved.Threshold = app.Threshold
		}
		if mon.CooldownMinutes <= 0 && app.CooldownMinutes > 0 {
			resolved.CooldownMinutes = app.CooldownMinutes
		}
		if mon.ResponseTimeMS <= 0 && app.ResponseTimeMS > 0 {
			resolved.ResponseTimeMS = app.ResponseTimeMS
		}
	}

	resolved.Severity = pickSeverity(mon.Severity, app.Severity)
	resolved.EmailTo = pickStrings(mon.EmailTo, app.EmailTo)
	resolved.OnCallTargets = pickStrings(mon.OnCallTargets, app.OnCallTargets)
	resolved.SlackWebhookSecret = strings.TrimSpace(mon.SlackWebhookSecret)
	if resolved.SlackWebhookSecret == "" {
		resolved.SlackWebhookSecret = strings.TrimSpace(app.SlackWebhookSecret)
	}

	if app.Enabled && !mon.Enabled && !monitor.AlertEnabled {
		resolved.Enabled = true
	}

	return resolved
}

func channelsForResolved(policy ResolvedAlertPolicy) []string {
	channels := []string{}
	if policy.Email {
		channels = append(channels, "email")
	}
	if policy.SlackWebhook {
		channels = append(channels, "slack")
	}
	return channels
}

func severityForRunWithPolicy(run domain.MonitorRun, policy ResolvedAlertPolicy) string {
	if s := strings.TrimSpace(policy.Severity); s != "" && s != "inherit" {
		return s
	}
	return severityForRun(run)
}

func pickInt(values ...int) int {
	for _, v := range values {
		if v > 0 {
			return v
		}
	}
	return 0
}

func pickSeverity(monitorSeverity, appSeverity string) string {
	if s := strings.TrimSpace(monitorSeverity); s != "" && s != "inherit" {
		return s
	}
	if s := strings.TrimSpace(appSeverity); s != "" && s != "inherit" {
		return s
	}
	return ""
}

func pickStrings(primary, fallback []string) []string {
	if len(primary) > 0 {
		return primary
	}
	return fallback
}
