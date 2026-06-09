package jobqueue

import (
	"context"
	"testing"
	"time"
)

func TestMemoryQueueContract(t *testing.T) {
	ctx := context.Background()
	queue := NewMemoryQueue(8)
	t.Cleanup(func() { _ = queue.Close() })

	job := MonitorRunJob{
		MonitorID:   "mon-contract",
		Trigger:     "schedule",
		EnqueuedAt:  time.Now().UTC(),
		ScheduledAt: time.Now().UTC(),
	}

	enqueued, err := queue.EnqueueMonitorRun(ctx, job)
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	if !enqueued {
		t.Fatal("expected first enqueue to succeed")
	}

	dup, err := queue.EnqueueMonitorRun(ctx, job)
	if err != nil {
		t.Fatalf("duplicate enqueue: %v", err)
	}
	if dup {
		t.Fatal("expected duplicate enqueue to be suppressed")
	}

	dequeued, err := queue.DequeueMonitorRun(ctx, time.Second)
	if err != nil {
		t.Fatalf("dequeue: %v", err)
	}
	if dequeued.MonitorID != job.MonitorID {
		t.Fatalf("monitor id = %q, want %q", dequeued.MonitorID, job.MonitorID)
	}

	lock, acquired, err := queue.AcquireRunLock(ctx, job.MonitorID, time.Minute)
	if err != nil {
		t.Fatalf("acquire lock: %v", err)
	}
	if !acquired || lock == nil {
		t.Fatal("expected run lock to be acquired")
	}

	_, acquiredAgain, err := queue.AcquireRunLock(ctx, job.MonitorID, time.Minute)
	if err != nil {
		t.Fatalf("second acquire: %v", err)
	}
	if acquiredAgain {
		t.Fatal("expected run lock to remain held")
	}

	if err := lock.Release(ctx); err != nil {
		t.Fatalf("release lock: %v", err)
	}

	_, acquiredAfterRelease, err := queue.AcquireRunLock(ctx, job.MonitorID, time.Minute)
	if err != nil {
		t.Fatalf("acquire after release: %v", err)
	}
	if !acquiredAfterRelease {
		t.Fatal("expected lock after release")
	}
}
