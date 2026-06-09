package worker

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/events"
	"github.com/ensemble-pulse/pulse/apps/api/internal/executor"
	"github.com/ensemble-pulse/pulse/apps/api/internal/jobqueue"
	"github.com/ensemble-pulse/pulse/apps/api/internal/logcheck"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

type Worker struct {
	store       store.Store
	executor    executor.Executor
	queue       jobqueue.Queue
	events      events.Publisher
	pollTimeout time.Duration
	lockTTL     time.Duration
}

func NewWorker(store store.Store, executor executor.Executor, queue jobqueue.Queue, pub events.Publisher) *Worker {
	if pub == nil {
		pub = events.NoopPublisher{}
	}
	return &Worker{
		store:       store,
		executor:    executor,
		queue:       queue,
		events:      pub,
		pollTimeout: 5 * time.Second,
		lockTTL:     5 * time.Minute,
	}
}

func (w *Worker) Start(ctx context.Context) {
	log.Println("[Worker] Starting monitor run worker...")

	go func() {
		for {
			select {
			case <-ctx.Done():
				log.Println("[Worker] Context cancelled, stopping worker...")
				return
			default:
			}

			job, err := w.queue.DequeueMonitorRun(ctx, w.pollTimeout)
			if err != nil {
				if errors.Is(err, jobqueue.ErrNoJob) || errors.Is(err, context.Canceled) {
					continue
				}
				log.Printf("[Worker] Dequeue monitor run job failed: %v", err)
				time.Sleep(time.Second)
				continue
			}

			w.process(ctx, job)
		}
	}()
}

func (w *Worker) process(ctx context.Context, job jobqueue.MonitorRunJob) {
	if job.MonitorID == "" {
		log.Print("[Worker] Skipping monitor run job without monitor ID")
		return
	}

	monitor, ok := w.store.GetMonitor(job.MonitorID)
	if !ok {
		log.Printf("[Worker] Monitor %s no longer exists, skipping queued job", job.MonitorID)
		return
	}
	if !monitor.IsActive {
		log.Printf("[Worker] Monitor %s is inactive, skipping queued job", job.MonitorID)
		return
	}

	lock, acquired, err := w.queue.AcquireRunLock(ctx, monitor.ID, w.lockTTLForMonitor(monitor.TimeoutMS))
	if err != nil {
		log.Printf("[Worker] Failed to acquire run lock for monitor %s: %v", monitor.ID, err)
		return
	}
	if !acquired {
		log.Printf("[Worker] Monitor %s already has an active run, skipping duplicate job", monitor.ID)
		return
	}
	defer func() {
		if err := lock.Release(context.Background()); err != nil {
			log.Printf("[Worker] Failed to release run lock for monitor %s: %v", monitor.ID, err)
		}
	}()

	log.Printf("[Worker] Executing queued monitor check for: %s (%s)", monitor.Name, monitor.ID)
	run := w.executor.RunScheduled(monitor)
	if job.Trigger == "manual" {
		run = w.executor.Run(monitor)
	}
	if job.ValidationID != "" && job.ValidationPhase != "" {
		phase := domain.DeploymentValidationPhase(job.ValidationPhase)
		w.store.LinkDeploymentValidationRun(job.ValidationID, phase, monitor.ID, run.ID)
		events.PublishValidationRunLinked(w.events, job.ValidationID, phase, monitor.ID, run.ID, run.Status)
		w.refreshValidationReport(job.ValidationID, phase)
	}
	if job.BatchID != "" && job.ApplicationID != "" {
		events.PublishRunCompleted(w.events, job.ApplicationID, job.BatchID, monitor.ID, run.ID, run.Status, run.DurationMS, run.FailureReason)
	}
	log.Printf("[Worker] Finished queued check for %s. Duration: %dms, Status: %s", monitor.Name, run.DurationMS, run.Status)
}

func (w *Worker) refreshValidationReport(validationID string, phase domain.DeploymentValidationPhase) {
	validation, ok := w.store.GetDeploymentValidation(validationID)
	if !ok {
		return
	}
	preRuns := w.store.ListDeploymentValidationRuns(validationID, domain.DeploymentValidationPhasePre)
	postRuns := w.store.ListDeploymentValidationRuns(validationID, domain.DeploymentValidationPhasePost)
	now := time.Now().UTC()
	expectedRuns := len(validation.MonitorIDs) * validation.SampleCount
	if expectedRuns <= 0 {
		expectedRuns = len(validation.MonitorIDs)
	}
	if phase == domain.DeploymentValidationPhasePre && len(preRuns) >= expectedRuns {
		validation.Status = domain.DeploymentValidationPreComplete
		validation.PreCompletedAt = &now
		events.PublishValidationStatusChanged(w.events, validation.ID, validation.Status)
	}
	if phase == domain.DeploymentValidationPhasePost && len(postRuns) >= expectedRuns {
		validation.PostCompletedAt = &now
		if validation.AutoRunLogCheck && len(validation.ElfQueryIDs) > 0 {
			validation.Status = domain.DeploymentValidationLogRunning
			validation.LogStartedAt = &now
			w.store.UpdateDeploymentValidation(validation)
			events.PublishValidationStatusChanged(w.events, validation.ID, validation.Status)
			go (&logcheck.Service{Store: w.store, Events: w.events}).Execute(validation.ID, preRuns, postRuns)
			return
		}
		validation.Status = domain.DeploymentValidationReportReady
		validation.Report = store.BuildDeploymentValidationReport(validation, preRuns, postRuns)
	}
	w.store.UpdateDeploymentValidation(validation)
	events.PublishValidationStatusChanged(w.events, validation.ID, validation.Status)
	if validation.Status == domain.DeploymentValidationReportReady {
		events.PublishValidationReportUpdated(w.events, validation.ID, validation.Status)
	}
}

func (w *Worker) lockTTLForMonitor(timeoutMS int) time.Duration {
	if timeoutMS <= 0 {
		return w.lockTTL
	}

	timeout := time.Duration(timeoutMS) * time.Millisecond
	if timeout+time.Minute > w.lockTTL {
		return timeout + time.Minute
	}
	return w.lockTTL
}
