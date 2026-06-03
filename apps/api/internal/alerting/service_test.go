package alerting

import (
	"testing"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

func TestProcessRunCreatesOpenAlertAfterThreshold(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	service := NewService(memoryStore)
	monitor := testMonitor()
	memoryStore.UpsertMonitor(monitor)
	run := failedRun(monitor.ID, "run-1", time.Now().UTC())
	memoryStore.SaveRun(run)

	service.ProcessRun(monitor, run)

	alerts := memoryStore.ListAlerts()
	if len(alerts) != 1 {
		t.Fatalf("alerts = %d, want 1", len(alerts))
	}
	alert := alerts[0]
	if alert.Status != domain.AlertStatusOpen {
		t.Fatalf("alert status = %s, want open", alert.Status)
	}
	if len(alert.Channels) != 2 {
		t.Fatalf("channels = %v, want email and slack", alert.Channels)
	}
	if len(alert.Deliveries) != 2 {
		t.Fatalf("deliveries = %d, want 2", len(alert.Deliveries))
	}
	for _, delivery := range alert.Deliveries {
		if delivery.Status != "skipped" {
			t.Fatalf("delivery status = %s, want skipped without channel config", delivery.Status)
		}
	}
}

func TestProcessRunSuppressesDeliveryDuringCooldown(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	service := NewService(memoryStore)
	monitor := testMonitor()
	monitor.AlertPolicy.CooldownMinutes = 30
	memoryStore.UpsertMonitor(monitor)

	start := time.Now().UTC()
	openAlert := domain.AlertEvent{
		ID:               "alert-existing",
		MonitorID:        monitor.ID,
		RunID:            "run-1",
		Status:           domain.AlertStatusOpen,
		Severity:         "critical",
		Title:            "Synthetic monitor is failing",
		Description:      "failure",
		Channels:         []string{"email"},
		FirstTriggeredAt: start.Add(-5 * time.Minute),
		LastTriggeredAt:  start.Add(-5 * time.Minute),
		LastDeliveredAt:  &start,
	}
	memoryStore.SaveAlert(openAlert)
	run := failedRun(monitor.ID, "run-2", start.Add(time.Minute))
	memoryStore.SaveRun(run)

	service.ProcessRun(monitor, run)

	alerts := memoryStore.ListAlerts()
	if len(alerts) != 1 {
		t.Fatalf("alerts = %d, want 1", len(alerts))
	}
	if alerts[0].Deliveries[0].Status != "suppressed" {
		t.Fatalf("delivery status = %s, want suppressed", alerts[0].Deliveries[0].Status)
	}
}

func TestProcessRunResolvesOpenAlertOnSuccess(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	service := NewService(memoryStore)
	monitor := testMonitor()
	memoryStore.UpsertMonitor(monitor)
	memoryStore.SaveAlert(domain.AlertEvent{
		ID:               "alert-existing",
		MonitorID:        monitor.ID,
		Status:           domain.AlertStatusOpen,
		Severity:         "critical",
		FirstTriggeredAt: time.Now().UTC(),
		LastTriggeredAt:  time.Now().UTC(),
	})

	service.ProcessRun(monitor, domain.MonitorRun{
		ID:          "run-success",
		MonitorID:   monitor.ID,
		MonitorName: monitor.Name,
		Status:      domain.StatusSuccess,
		EndedAt:     time.Now().UTC(),
	})

	alerts := memoryStore.ListAlerts()
	if len(alerts) != 1 {
		t.Fatalf("alerts = %d, want 1", len(alerts))
	}
	if alerts[0].Status != domain.AlertStatusResolved {
		t.Fatalf("alert status = %s, want resolved", alerts[0].Status)
	}
	if alerts[0].ResolvedAt == nil {
		t.Fatal("resolved alert missing resolvedAt")
	}
}

func testMonitor() domain.Monitor {
	return domain.Monitor{
		ID:               "mon-alert-test",
		Name:             "Synthetic monitor",
		IsActive:         true,
		FailureThreshold: 1,
		AlertEnabled:     true,
		AlertPolicy: domain.AlertPolicy{
			Enabled:         true,
			Threshold:       1,
			Email:           true,
			SlackWebhook:    true,
			CooldownMinutes: 30,
		},
		Variables: map[string]string{},
	}
}

func failedRun(monitorID string, runID string, endedAt time.Time) domain.MonitorRun {
	startedAt := endedAt.Add(-100 * time.Millisecond)
	return domain.MonitorRun{
		ID:              runID,
		MonitorID:       monitorID,
		MonitorName:     "Synthetic monitor",
		Status:          domain.StatusFailed,
		TriggeredBy:     "manual",
		StartedAt:       startedAt,
		EndedAt:         endedAt,
		DurationMS:      100,
		FailureCategory: domain.FailureAssertion,
		FailureReason:   "assertion failed",
	}
}
