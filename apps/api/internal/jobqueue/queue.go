package jobqueue

import (
	"context"
	"errors"
	"strconv"
	"time"
)

var ErrNoJob = errors.New("no job available")

type MonitorRunJob struct {
	MonitorID       string    `json:"monitorId"`
	Trigger         string    `json:"trigger"`
	EnqueuedAt      time.Time `json:"enqueuedAt"`
	ScheduledAt     time.Time `json:"scheduledAt,omitempty"`
	ValidationID    string    `json:"validationId,omitempty"`
	ValidationPhase string    `json:"validationPhase,omitempty"`
	SampleIndex     int       `json:"sampleIndex,omitempty"`
	ApplicationID   string    `json:"applicationId,omitempty"`
	BatchID         string    `json:"batchId,omitempty"`
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

func enqueueDedupKey(job MonitorRunJob) string {
	if job.ValidationID != "" || job.ValidationPhase != "" {
		return job.MonitorID + ":" + job.ValidationID + ":" + job.ValidationPhase + ":" + strconv.Itoa(job.SampleIndex)
	}
	return job.MonitorID
}
