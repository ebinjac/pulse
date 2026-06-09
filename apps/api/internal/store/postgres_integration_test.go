//go:build integration

package store

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/secretcrypto"
)

func openPostgresStore(t *testing.T) Store {
	t.Helper()

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL not set")
	}

	codec, err := secretcrypto.NewCodec("integration-test-key-material")
	if err != nil {
		codec = secretcrypto.NewDevCodec()
	}

	pgStore, err := NewPostgresStore(context.Background(), databaseURL, codec)
	if err != nil {
		t.Fatalf("open postgres store: %v", err)
	}
	t.Cleanup(pgStore.Close)

	return pgStore
}

func TestPostgresStoreMonitorDraftPublish(t *testing.T) {
	store := openPostgresStore(t)

	monitorID := "mon-integration-" + time.Now().UTC().Format("150405")
	published := store.UpsertMonitor(domain.Monitor{
		ID:   monitorID,
		Name: "Integration monitor",
		Cron: "*/10 * * * *",
	})
	if published.ID != monitorID {
		t.Fatalf("published id = %q", published.ID)
	}

	draft := store.SaveMonitorDraft(domain.Monitor{
		ID:   monitorID,
		Name: "Integration monitor draft",
		Cron: "*/10 * * * *",
	})
	if draft.Name != "Integration monitor draft" {
		t.Fatalf("draft name = %q", draft.Name)
	}

	published, err := store.PublishMonitorDraft(monitorID, "integration test", "ci")
	if err != nil {
		t.Fatalf("publish draft: %v", err)
	}
	if published.Name != "Integration monitor draft" {
		t.Fatalf("published name = %q", published.Name)
	}

	versions := store.ListMonitorVersions(monitorID)
	if len(versions) == 0 {
		t.Fatal("expected at least one monitor version")
	}
}

func TestPostgresStoreRunAndAlertLifecycle(t *testing.T) {
	store := openPostgresStore(t)

	monitorID := "mon-alert-integration-" + time.Now().UTC().Format("150405")
	monitor := store.UpsertMonitor(domain.Monitor{
		ID:   monitorID,
		Name: "Alert integration monitor",
		Cron: "*/15 * * * *",
	})

	now := time.Now().UTC()
	runID := "run-integration-" + now.Format("150405")
	store.SaveRun(domain.MonitorRun{
		ID:        runID,
		MonitorID: monitor.ID,
		Status:    domain.StatusFailed,
		StartedAt: now,
		EndedAt:   now,
	})

	runs := store.ListRuns(monitor.ID)
	found := false
	for _, run := range runs {
		if run.ID == runID {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected saved run in list")
	}

	alertID := "alert-integration-" + now.Format("150405")
	store.SaveAlert(domain.AlertEvent{
		ID:               alertID,
		MonitorID:        monitor.ID,
		Status:           domain.AlertStatusOpen,
		FirstTriggeredAt: now,
		LastTriggeredAt:  now,
		CreatedAt:        now,
		UpdatedAt:        now,
	})

	open, ok := store.GetOpenAlert(monitor.ID)
	if !ok || open.ID != alertID {
		t.Fatal("expected open alert")
	}

	if store.ResolveOpenAlerts(monitor.ID, now) != 1 {
		t.Fatal("expected one alert resolved")
	}
}
