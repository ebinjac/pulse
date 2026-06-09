package worker

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/jobqueue"
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
		TriggeredBy: "manual",
	}
}

func (m *mockExecutor) RunScheduled(monitor domain.Monitor) domain.MonitorRun {
	run := m.Run(monitor)
	run.TriggeredBy = "schedule"
	return run
}

func (m *mockExecutor) RunDraft(monitor domain.Monitor) domain.MonitorRun {
	run := m.Run(monitor)
	run.TriggeredBy = "draft"
	return run
}

func (m *mockExecutor) Test(monitor domain.Monitor) domain.MonitorRun {
	return domain.MonitorRun{}
}

func TestWorkerProcessesQueuedMonitorRun(t *testing.T) {
	mStore := store.NewMemoryStore()
	queue := jobqueue.NewMemoryQueue(8)
	exec := &mockExecutor{runs: make(map[string]int)}
	worker := NewWorker(mStore, exec, queue, nil)

	monitor := domain.Monitor{
		ID:           "mon-worker",
		Name:         "Worker Test Monitor",
		IsActive:     true,
		Cron:         "* * * * *",
		ScheduleMode: "every-1m",
	}
	mStore.UpsertMonitor(monitor)

	worker.process(context.Background(), jobqueue.MonitorRunJob{MonitorID: monitor.ID, Trigger: "schedule"})

	exec.mu.Lock()
	count := exec.runs[monitor.ID]
	exec.mu.Unlock()

	if count != 1 {
		t.Fatalf("executor run count = %d, want 1", count)
	}
}

func TestWorkerSkipsInactiveMonitor(t *testing.T) {
	mStore := store.NewMemoryStore()
	queue := jobqueue.NewMemoryQueue(8)
	exec := &mockExecutor{runs: make(map[string]int)}
	worker := NewWorker(mStore, exec, queue, nil)

	monitor := domain.Monitor{ID: "mon-inactive", Name: "Inactive", IsActive: false}
	mStore.UpsertMonitor(monitor)

	worker.process(context.Background(), jobqueue.MonitorRunJob{MonitorID: monitor.ID, Trigger: "schedule"})

	exec.mu.Lock()
	count := exec.runs[monitor.ID]
	exec.mu.Unlock()

	if count != 0 {
		t.Fatalf("executor run count = %d, want 0", count)
	}
}

func TestWorkerSkipsDuplicateWhenRunLockHeld(t *testing.T) {
	ctx := context.Background()
	mStore := store.NewMemoryStore()
	queue := jobqueue.NewMemoryQueue(8)
	exec := &mockExecutor{runs: make(map[string]int)}
	worker := NewWorker(mStore, exec, queue, nil)

	monitor := domain.Monitor{ID: "mon-locked", Name: "Locked", IsActive: true}
	mStore.UpsertMonitor(monitor)

	lock, acquired, err := queue.AcquireRunLock(ctx, monitor.ID, time.Minute)
	if err != nil {
		t.Fatalf("acquire lock: %v", err)
	}
	if !acquired {
		t.Fatal("expected initial run lock")
	}
	defer lock.Release(ctx)

	worker.process(ctx, jobqueue.MonitorRunJob{MonitorID: monitor.ID, Trigger: "schedule"})

	exec.mu.Lock()
	count := exec.runs[monitor.ID]
	exec.mu.Unlock()

	if count != 0 {
		t.Fatalf("executor run count = %d, want 0", count)
	}
}
