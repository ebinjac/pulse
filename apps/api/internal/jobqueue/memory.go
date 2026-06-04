package jobqueue

import (
	"context"
	"sync"
	"time"
)

type MemoryQueue struct {
	mu          sync.Mutex
	jobs        chan MonitorRunJob
	enqueueHeld map[string]time.Time
	runHeld     map[string]time.Time
	closed      bool
}

func NewMemoryQueue(size int) *MemoryQueue {
	if size <= 0 {
		size = 128
	}

	return &MemoryQueue{
		jobs:        make(chan MonitorRunJob, size),
		enqueueHeld: map[string]time.Time{},
		runHeld:     map[string]time.Time{},
	}
}

func (q *MemoryQueue) EnqueueMonitorRun(ctx context.Context, job MonitorRunJob) (bool, error) {
	q.mu.Lock()
	now := time.Now().UTC()
	dedupKey := enqueueDedupKey(job)
	if heldUntil, ok := q.enqueueHeld[dedupKey]; ok && heldUntil.After(now) {
		q.mu.Unlock()
		return false, nil
	}
	q.enqueueHeld[dedupKey] = now.Add(55 * time.Second)
	q.mu.Unlock()

	select {
	case q.jobs <- job:
		return true, nil
	case <-ctx.Done():
		return false, ctx.Err()
	}
}

func (q *MemoryQueue) DequeueMonitorRun(ctx context.Context, timeout time.Duration) (MonitorRunJob, error) {
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case job, ok := <-q.jobs:
		if !ok {
			return MonitorRunJob{}, ErrNoJob
		}
		return job, nil
	case <-timer.C:
		return MonitorRunJob{}, ErrNoJob
	case <-ctx.Done():
		return MonitorRunJob{}, ctx.Err()
	}
}

func (q *MemoryQueue) AcquireRunLock(ctx context.Context, monitorID string, ttl time.Duration) (Lock, bool, error) {
	select {
	case <-ctx.Done():
		return nil, false, ctx.Err()
	default:
	}

	q.mu.Lock()
	defer q.mu.Unlock()

	now := time.Now().UTC()
	if heldUntil, ok := q.runHeld[monitorID]; ok && heldUntil.After(now) {
		return nil, false, nil
	}
	q.runHeld[monitorID] = now.Add(ttl)
	return memoryLock{queue: q, monitorID: monitorID}, true, nil
}

func (q *MemoryQueue) Close() error {
	q.mu.Lock()
	defer q.mu.Unlock()

	if !q.closed {
		close(q.jobs)
		q.closed = true
	}
	return nil
}

type memoryLock struct {
	queue     *MemoryQueue
	monitorID string
}

func (l memoryLock) Release(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	l.queue.mu.Lock()
	defer l.queue.mu.Unlock()
	delete(l.queue.runHeld, l.monitorID)
	return nil
}
