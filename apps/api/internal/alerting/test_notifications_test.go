package alerting

import (
	"strings"
	"testing"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

func TestNotificationsUsesSavedSecretsWhenOverridesEmpty(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	_, err := memoryStore.UpsertSecret(domain.SecretReference{
		ID:       "sec-slack",
		Alias:    "slackWebhook",
		Name:     "Slack",
		Provider: "encrypted-db",
		RawValue: "https://hooks.slack.example/test",
	})
	if err != nil {
		t.Fatalf("upsert slack secret: %v", err)
	}

	service := NewService(memoryStore)
	deliveries := service.TestNotifications(domain.NotificationTestOverrides{})

	foundSlack := false
	for _, delivery := range deliveries {
		if delivery.Channel == "slack" {
			foundSlack = true
			if delivery.Status != "skipped" && !strings.Contains(delivery.Detail, "example") {
				t.Fatalf("unexpected slack delivery for example webhook: %+v", delivery)
			}
		}
	}
	if !foundSlack {
		t.Fatalf("expected slack channel in deliveries: %+v", deliveries)
	}
}
