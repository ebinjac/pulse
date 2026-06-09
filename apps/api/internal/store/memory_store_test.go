package store

import (
	"testing"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func TestMemoryStoreMonitorRunAlertContract(t *testing.T) {
	store := NewMemoryStore()
	var repo MonitorRepo = store
	var runs RunRepo = store
	var alerts AlertRepo = store

	monitor := repo.UpsertMonitor(domain.Monitor{
		ID:   "mon-memory-test",
		Name: "Memory contract monitor",
		Cron: "*/5 * * * *",
	})

	run := domain.MonitorRun{
		ID:        "run-memory-test",
		MonitorID: monitor.ID,
		Status:    domain.StatusFailed,
		StartedAt: time.Now().UTC(),
		EndedAt:   time.Now().UTC(),
	}
	runs.SaveRun(run)

	saved, ok := runs.GetRun(run.ID)
	if !ok || saved.MonitorID != monitor.ID {
		t.Fatal("expected saved run")
	}

	now := time.Now().UTC()
	alert := domain.AlertEvent{
		ID:               "alert-memory-test",
		MonitorID:        monitor.ID,
		Status:           domain.AlertStatusOpen,
		FirstTriggeredAt: now,
		LastTriggeredAt:  now,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	alerts.SaveAlert(alert)

	open, ok := alerts.GetOpenAlert(monitor.ID)
	if !ok || open.ID != alert.ID {
		t.Fatal("expected open alert")
	}

	resolved := alerts.ResolveOpenAlerts(monitor.ID, time.Now().UTC())
	if resolved != 1 {
		t.Fatalf("resolved = %d, want 1", resolved)
	}
}
