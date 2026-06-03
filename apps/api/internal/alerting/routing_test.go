package alerting

import (
	"testing"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func TestResolveAlertPolicyInheritsApplication(t *testing.T) {
	monitor := domain.Monitor{
		AlertEnabled: false,
		AlertPolicy: domain.AlertPolicy{
			InheritFromApplication: true,
		},
	}
	app := domain.Application{
		AlertRouting: domain.AlertRouting{
			Enabled:      true,
			Email:        true,
			SlackWebhook: true,
			Threshold:    2,
			Severity:     "critical",
			EmailTo:      []string{"oncall@example.com"},
		},
	}

	policy := ResolveAlertPolicy(monitor, app)
	if !policy.Enabled {
		t.Fatal("expected enabled from application routing")
	}
	if !policy.Email || !policy.SlackWebhook {
		t.Fatal("expected channels from application")
	}
	if policy.Threshold != 2 {
		t.Fatalf("expected threshold 2, got %d", policy.Threshold)
	}
	if policy.Severity != "critical" {
		t.Fatalf("expected critical severity, got %q", policy.Severity)
	}
	if len(policy.EmailTo) != 1 || policy.EmailTo[0] != "oncall@example.com" {
		t.Fatalf("unexpected email targets: %#v", policy.EmailTo)
	}
}
