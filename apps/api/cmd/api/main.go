package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/alerting"
	"github.com/ensemble-pulse/pulse/apps/api/internal/events"
	"github.com/ensemble-pulse/pulse/apps/api/internal/executor"
	"github.com/ensemble-pulse/pulse/apps/api/internal/httpapi"
	"github.com/ensemble-pulse/pulse/apps/api/internal/jobqueue"
	"github.com/ensemble-pulse/pulse/apps/api/internal/scheduler"
	"github.com/ensemble-pulse/pulse/apps/api/internal/secretcrypto"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
	"github.com/ensemble-pulse/pulse/apps/api/internal/worker"
)

func main() {
	addr := env("PULSE_API_ADDR", ":8080")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	activeStore := newStore(ctx)
	eventBus := events.NewBusFromEnv(ctx)
	defer eventBus.Close()
	if envBool("PULSE_RETENTION_PURGE_ENABLED", true) {
		store.StartRetentionPurger(ctx, activeStore, time.Hour)
	}
	alertService := alerting.NewService(activeStore, eventBus)
	executor := executor.NewRealExecutor(activeStore, alertService)
	runQueue := newRunQueue(ctx)
	defer runQueue.Close()

	if envBool("PULSE_SCHEDULER_ENABLED", true) {
		bgScheduler := scheduler.NewScheduler(activeStore, runQueue)
		bgScheduler.Start(ctx)
	}
	if envBool("PULSE_WORKER_ENABLED", os.Getenv("REDIS_URL") == "") {
		bgWorker := worker.NewWorker(activeStore, executor, runQueue, eventBus)
		bgWorker.Start(ctx)
	}

	server := httpapi.NewServerWithDeps(activeStore, executor, runQueue, eventBus)

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	// Capture OS signals to gracefully shut down the scheduler and API server
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Shutting down pulse api service gracefully...")

		// Stop the scheduler and sync routine
		cancel()

		// Shut down HTTP server with a 5-second timeout
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutdownCancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			log.Printf("HTTP server Shutdown error: %v", err)
		}
	}()

	log.Printf("pulse api listening on %s", addr)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func newStore(ctx context.Context) store.Store {
	secretCodec := newSecretCodec()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Print("DATABASE_URL not set; using in-memory store")
		return store.NewMemoryStore()
	}

	postgresStore, err := store.NewPostgresStore(ctx, databaseURL, secretCodec)
	if err != nil {
		log.Fatalf("postgres store unavailable: %v; run migrations before starting the API", err)
	}

	log.Print("using PostgreSQL store")
	return postgresStore
}

func newRunQueue(ctx context.Context) jobqueue.Queue {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		log.Print("REDIS_URL not set; using in-memory monitor run queue")
		return jobqueue.NewMemoryQueue(256)
	}

	queue, err := jobqueue.NewRedisQueue(redisURL)
	if err != nil {
		log.Fatalf("invalid REDIS_URL: %v", err)
	}
	if err := queue.Ping(ctx); err != nil {
		log.Fatalf("redis queue unavailable: %v", err)
	}

	log.Print("using Redis monitor run queue")
	return queue
}

func newSecretCodec() *secretcrypto.Codec {
	key := os.Getenv("PULSE_SECRET_ENCRYPTION_KEY")
	if key == "" {
		log.Print("PULSE_SECRET_ENCRYPTION_KEY not set; using local development secret encryption key")
		return secretcrypto.NewDevCodec()
	}

	codec, err := secretcrypto.NewCodec(key)
	if err != nil {
		log.Fatalf("invalid PULSE_SECRET_ENCRYPTION_KEY: %v", err)
	}

	return codec
}

func env(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}

func envBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	switch value {
	case "1", "true", "TRUE", "yes", "YES", "on", "ON":
		return true
	case "0", "false", "FALSE", "no", "NO", "off", "OFF":
		return false
	default:
		log.Printf("invalid boolean value for %s=%q; using %v", key, value, fallback)
		return fallback
	}
}
