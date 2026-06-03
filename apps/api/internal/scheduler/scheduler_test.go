package scheduler

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

type mockExecutor struct {
	mu   sync.Mutex
	runs map[string]int
}

func (m *mockExecutor) Run(monitor domain.Monitor) domain.MonitorRun {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.runs[monitor.ID]++
	return domain.MonitorRun{
		ID:          "run-test",
		MonitorID:   monitor.ID,
		MonitorName: monitor.Name,
		Status:      domain.StatusSuccess,
	}
}

func (m *mockExecutor) RunScheduled(monitor domain.Monitor) domain.MonitorRun {
	run := m.Run(monitor)
	run.TriggeredBy = "schedule"
	return run
}

func (m *mockExecutor) Test(monitor domain.Monitor) domain.MonitorRun {
	return domain.MonitorRun{}
}

func TestSchedulerSync(t *testing.T) {
	ctx := context.Background()
	mStore := store.NewMemoryStore()
	exec := &mockExecutor{runs: make(map[string]int)}
	sched := NewScheduler(mStore, exec)

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
	exec := &mockExecutor{runs: make(map[string]int)}
	sched := NewScheduler(mStore, exec)

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

func TestSchedulerExecuteJob(t *testing.T) {
	mStore := store.NewMemoryStore()
	exec := &mockExecutor{runs: make(map[string]int)}
	sched := NewScheduler(mStore, exec)

	m3 := domain.Monitor{
		ID:           "mon-3",
		Name:         "Exec Test Monitor",
		IsActive:     true,
		Cron:         "* * * * *",
		ScheduleMode: "every-1m",
	}
	mStore.UpsertMonitor(m3)

	// Directly call executeJob (the callback registered in cron)
	sched.executeJob("mon-3")

	exec.mu.Lock()
	count := exec.runs["mon-3"]
	exec.mu.Unlock()

	if count != 1 {
		t.Errorf("Expected executor to be called exactly 1 time, called %d times", count)
	}

	// Unschedule monitor or disable it, verify skipped execution
	m3.IsActive = false
	mStore.UpsertMonitor(m3)

	sched.executeJob("mon-3")

	exec.mu.Lock()
	count2 := exec.runs["mon-3"]
	exec.mu.Unlock()

	if count2 != 1 {
		t.Errorf("Expected execution to be skipped when monitor is inactive, got run count: %d", count2)
	}
}

func TestSchedulerStartStop(t *testing.T) {
	mStore := store.NewMemoryStore()
	exec := &mockExecutor{runs: make(map[string]int)}
	sched := NewScheduler(mStore, exec)

	ctx, cancel := context.WithCancel(context.Background())
	sched.Start(ctx)

	// Quick sleep to let background sync complete
	time.Sleep(50 * time.Millisecond)

	cancel()

	// Stop can be called safely
	sched.Stop()
}
