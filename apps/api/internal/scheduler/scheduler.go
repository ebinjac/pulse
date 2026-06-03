package scheduler

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/jobqueue"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
	"github.com/robfig/cron/v3"
)

type Scheduler struct {
	store     store.Store
	queue     jobqueue.Queue
	cron      *cron.Cron
	entries   map[string]cron.EntryID // monitorID -> cron EntryID
	schedules map[string]string       // monitorID -> resolved spec string
	mu        sync.RWMutex
}

func NewScheduler(store store.Store, queue jobqueue.Queue) *Scheduler {
	return &Scheduler{
		store:     store,
		queue:     queue,
		cron:      cron.New(cron.WithParser(cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor))),
		entries:   make(map[string]cron.EntryID),
		schedules: make(map[string]string),
	}
}

// Start starts the scheduler and launches a background sync routine.
func (s *Scheduler) Start(ctx context.Context) {
	log.Println("[Scheduler] Starting background scheduler...")
	s.cron.Start()

	// Initial sync
	s.sync(ctx)

	go func() {
		// Self-healing synchronization every 10 seconds
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Println("[Scheduler] Context cancelled, stopping scheduler...")
				s.cron.Stop()
				return
			case <-ticker.C:
				s.sync(ctx)
			}
		}
	}()
}

// Stop stops the scheduler runner.
func (s *Scheduler) Stop() {
	s.cron.Stop()
}

// sync matches active database monitors with scheduler entries.
func (s *Scheduler) sync(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()

	monitors := s.store.ListMonitors()
	activeMonitors := make(map[string]bool)

	for _, monitor := range monitors {
		// We only schedule active monitors that have a schedule (not manual or empty)
		if monitor.IsActive && monitor.Cron != "" && monitor.ScheduleMode != "manual" {
			activeMonitors[monitor.ID] = true

			// Resolve spec string incorporating timezone if present
			spec := monitor.Cron
			if monitor.Timezone != "" {
				spec = fmt.Sprintf("CRON_TZ=%s %s", monitor.Timezone, monitor.Cron)
			}

			currentSpec, exists := s.schedules[monitor.ID]
			if !exists {
				// 1. Add new scheduled monitor
				s.scheduleMonitor(monitor.ID, spec)
			} else if currentSpec != spec {
				// 2. Schedule changed, remove old and register new
				s.unscheduleMonitor(monitor.ID)
				s.scheduleMonitor(monitor.ID, spec)
			}
		}
	}

	// 3. Remove any currently scheduled monitors that are no longer active or deleted
	for monitorID := range s.schedules {
		if !activeMonitors[monitorID] {
			s.unscheduleMonitor(monitorID)
		}
	}
}

// scheduleMonitor registers a new cron schedule entry. Assumes lock is held.
func (s *Scheduler) scheduleMonitor(monitorID string, spec string) {
	entryID, err := s.cron.AddFunc(spec, func() {
		s.executeJob(monitorID)
	})

	if err != nil {
		log.Printf("[Scheduler] Error scheduling monitor %s with spec '%s': %v", monitorID, spec, err)
		return
	}

	s.entries[monitorID] = entryID
	s.schedules[monitorID] = spec
	log.Printf("[Scheduler] Successfully scheduled monitor %s with spec '%s'", monitorID, spec)
}

// unscheduleMonitor removes a cron schedule entry. Assumes lock is held.
func (s *Scheduler) unscheduleMonitor(monitorID string) {
	entryID, exists := s.entries[monitorID]
	if exists {
		s.cron.Remove(entryID)
		delete(s.entries, monitorID)
		delete(s.schedules, monitorID)
		log.Printf("[Scheduler] Successfully unscheduled monitor %s", monitorID)
	}
}

// executeJob fetches the latest monitor config and runs it.
func (s *Scheduler) executeJob(monitorID string) {
	latestMonitor, ok := s.store.GetMonitor(monitorID)
	if !ok {
		log.Printf("[Scheduler] Monitor %s no longer exists in store, skipping job execution", monitorID)
		return
	}

	if !latestMonitor.IsActive {
		log.Printf("[Scheduler] Monitor %s is inactive, skipping job execution", monitorID)
		return
	}

	enqueued, err := s.queue.EnqueueMonitorRun(context.Background(), jobqueue.MonitorRunJob{
		MonitorID:   latestMonitor.ID,
		Trigger:     "schedule",
		EnqueuedAt:  time.Now().UTC(),
		ScheduledAt: time.Now().UTC(),
	})
	if err != nil {
		log.Printf("[Scheduler] Failed to enqueue scheduled monitor check for %s (%s): %v", latestMonitor.Name, latestMonitor.ID, err)
		return
	}
	if !enqueued {
		log.Printf("[Scheduler] Scheduled monitor check for %s (%s) is already queued, skipping duplicate", latestMonitor.Name, latestMonitor.ID)
		return
	}

	log.Printf("[Scheduler] Enqueued scheduled monitor check for: %s (%s)", latestMonitor.Name, latestMonitor.ID)
}
