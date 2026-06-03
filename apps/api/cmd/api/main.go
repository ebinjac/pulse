package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/executor"
	"github.com/ensemble-pulse/pulse/apps/api/internal/httpapi"
	"github.com/ensemble-pulse/pulse/apps/api/internal/scheduler"
	"github.com/ensemble-pulse/pulse/apps/api/internal/secretcrypto"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

func main() {
	addr := env("PULSE_API_ADDR", ":8080")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	activeStore := newStore(ctx)
	executor := executor.NewRealExecutor(activeStore)

	// Initialize and start background monitor scheduler
	bgScheduler := scheduler.NewScheduler(activeStore, executor)
	bgScheduler.Start(ctx)

	server := httpapi.NewServer(activeStore, executor)

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
		log.Printf("postgres unavailable (%v); using in-memory store", err)
		return store.NewMemoryStore()
	}

	log.Print("using PostgreSQL store")
	return postgresStore
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
