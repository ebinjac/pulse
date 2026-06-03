package jobqueue

import (
	"context"
	"errors"
	"time"
)

var ErrNoJob = errors.New("no job available")

type MonitorRunJob struct {
	MonitorID   string    `json:"monitorId"`
	Trigger     string    `json:"trigger"`
	EnqueuedAt  time.Time `json:"enqueuedAt"`
	ScheduledAt time.Time `json:"scheduledAt,omitempty"`
}

type Lock interface {
	Release(ctx context.Context) error
}

type Queue interface {
	EnqueueMonitorRun(ctx context.Context, job MonitorRunJob) (bool, error)
	DequeueMonitorRun(ctx context.Context, timeout time.Duration) (MonitorRunJob, error)
	AcquireRunLock(ctx context.Context, monitorID string, ttl time.Duration) (Lock, bool, error)
	Close() error
}
