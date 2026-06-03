package scheduler

import (
	"context"
	"testing"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/jobqueue"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

func TestSchedulerSync(t *testing.T) {
	ctx := context.Background()
	mStore := store.NewMemoryStore()
	queue := jobqueue.NewMemoryQueue(8)
	sched := NewScheduler(mStore, queue)

	// Create a test monitor
	m1 := domain.Monitor{
		ID:           "mon-1",
		Name:         "Sync Test Monitor",
		IsActive:     true,
		Cron:         "*/5 * * * *",
		ScheduleMode: "every-5m",
	}
	mStore.UpsertMonitor(m1)

	// 1. Initial Sync
	sched.sync(ctx)

	sched.mu.RLock()
	spec, exists := sched.schedules["mon-1"]
	_, hasEntry := sched.entries["mon-1"]
	sched.mu.RUnlock()

	if !exists || spec != "CRON_TZ=UTC */5 * * * *" {
		t.Errorf("Expected spec 'CRON_TZ=UTC */5 * * * *', got '%s' (exists: %v)", spec, exists)
	}
	if !hasEntry {
		t.Error("Expected mon-1 to have an entry registered in cron")
	}

	// 2. Update schedule
	m1.Cron = "*/10 * * * *"
	mStore.UpsertMonitor(m1)

	sched.sync(ctx)

	sched.mu.RLock()
	spec2 := sched.schedules["mon-1"]
	sched.mu.RUnlock()

	if spec2 != "CRON_TZ=UTC */10 * * * *" {
		t.Errorf("Expected updated spec 'CRON_TZ=UTC */10 * * * *', got '%s'", spec2)
	}

	// 3. Disable monitor (should unschedule)
	m1.IsActive = false
	mStore.UpsertMonitor(m1)

	sched.sync(ctx)

	sched.mu.RLock()
	_, existsAfterDisable := sched.schedules["mon-1"]
	_, entryExistsAfterDisable := sched.entries["mon-1"]
	sched.mu.RUnlock()

	if existsAfterDisable || entryExistsAfterDisable {
		t.Error("Expected monitor to be unscheduled after setting IsActive to false")
	}
}

func TestSchedulerTimezoneSpec(t *testing.T) {
	ctx := context.Background()
	mStore := store.NewMemoryStore()
	queue := jobqueue.NewMemoryQueue(8)
	sched := NewScheduler(mStore, queue)

	// Create test monitor with timezone
	m2 := domain.Monitor{
		ID:           "mon-2",
		Name:         "TZ Test Monitor",
		IsActive:     true,
		Cron:         "30 8 * * *",
		Timezone:     "America/New_York",
		ScheduleMode: "custom-cron",
	}
	mStore.UpsertMonitor(m2)

	sched.sync(ctx)

	sched.mu.RLock()
	spec := sched.schedules["mon-2"]
	sched.mu.RUnlock()

	expectedSpec := "CRON_TZ=America/New_York 30 8 * * *"
	if spec != expectedSpec {
		t.Errorf("Expected timezone injected spec '%s', got '%s'", expectedSpec, spec)
	}
}

func TestSchedulerExecuteJobEnqueuesRun(t *testing.T) {
	mStore := store.NewMemoryStore()
	queue := jobqueue.NewMemoryQueue(8)
	sched := NewScheduler(mStore, queue)

	m3 := domain.Monitor{
		ID:           "mon-3",
		Name:         "Exec Test Monitor",
		IsActive:     true,
		Cron:         "* * * * *",
		ScheduleMode: "every-1m",
	}
	mStore.UpsertMonitor(m3)

	sched.executeJob("mon-3")

	job, err := queue.DequeueMonitorRun(context.Background(), time.Millisecond)
	if err != nil {
		t.Fatalf("expected queued monitor run job, got error: %v", err)
	}
	if job.MonitorID != "mon-3" {
		t.Fatalf("queued monitor ID = %s, want mon-3", job.MonitorID)
	}
	if job.Trigger != "schedule" {
		t.Fatalf("queued trigger = %s, want schedule", job.Trigger)
	}

	// Unschedule monitor or disable it, verify skipped execution
	m3.IsActive = false
	mStore.UpsertMonitor(m3)

	sched.executeJob("mon-3")

	if _, err := queue.DequeueMonitorRun(context.Background(), time.Millisecond); err != jobqueue.ErrNoJob {
		t.Fatalf("expected no job after inactive monitor, got %v", err)
	}
}

func TestSchedulerStartStop(t *testing.T) {
	mStore := store.NewMemoryStore()
	queue := jobqueue.NewMemoryQueue(8)
	sched := NewScheduler(mStore, queue)

	ctx, cancel := context.WithCancel(context.Background())
	sched.Start(ctx)

	// Quick sleep to let background sync complete
	time.Sleep(50 * time.Millisecond)

	cancel()

	// Stop can be called safely
	sched.Stop()
}
