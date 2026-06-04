package store

import (
	"context"
	"log"
	"time"
)

func StartRetentionPurger(ctx context.Context, activeStore Store, interval time.Duration) {
	if interval <= 0 {
		interval = time.Hour
	}

	go func() {
		runRetentionPurge(activeStore)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				runRetentionPurge(activeStore)
			}
		}
	}()
}

func runRetentionPurge(activeStore Store) {
	settings := activeStore.GetRetentionSettings()
	if !settings.Enabled {
		return
	}

	deleted, err := activeStore.PurgeExpiredRuns(settings.RunsRetentionDays)
	if err != nil {
		log.Printf("retention purge failed: %v", err)
		return
	}
	if deleted > 0 {
		log.Printf("retention purge deleted %d monitor runs older than %d days", deleted, settings.RunsRetentionDays)
	}
}
