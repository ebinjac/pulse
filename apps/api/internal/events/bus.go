package events

import (
	"context"
	"log"
	"os"
)

// NewBusFromEnv returns a Redis bus when REDIS_URL is set, otherwise an in-memory bus.
func NewBusFromEnv(ctx context.Context) Bus {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		log.Print("REDIS_URL not set; using in-memory event bus")
		return NewMemoryBus()
	}

	bus, err := NewRedisBus(redisURL)
	if err != nil {
		log.Fatalf("invalid REDIS_URL for events: %v", err)
	}
	if err := bus.Ping(ctx); err != nil {
		log.Fatalf("redis event bus unavailable: %v", err)
	}
	log.Print("using Redis event bus")
	return bus
}
