package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/ensemble-pulse/pulse/apps/api/internal/alerting"
	"github.com/ensemble-pulse/pulse/apps/api/internal/executor"
	"github.com/ensemble-pulse/pulse/apps/api/internal/jobqueue"
	"github.com/ensemble-pulse/pulse/apps/api/internal/secretcrypto"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
	"github.com/ensemble-pulse/pulse/apps/api/internal/worker"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	activeStore := newStore(ctx)
	alertService := alerting.NewService(activeStore)
	executor := executor.NewRealExecutor(activeStore, alertService)
	runQueue := newRunQueue(ctx)
	defer runQueue.Close()

	bgWorker := worker.NewWorker(activeStore, executor, runQueue)
	bgWorker.Start(ctx)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan
	log.Println("Shutting down pulse worker service gracefully...")
	cancel()
}

func newStore(ctx context.Context) store.Store {
	secretCodec := newSecretCodec()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required for the worker")
	}

	postgresStore, err := store.NewPostgresStore(ctx, databaseURL, secretCodec)
	if err != nil {
		log.Fatalf("postgres store unavailable: %v; run migrations before starting the worker", err)
	}

	log.Print("using PostgreSQL store")
	return postgresStore
}

func newRunQueue(ctx context.Context) jobqueue.Queue {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		log.Fatal("REDIS_URL is required for the worker")
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
