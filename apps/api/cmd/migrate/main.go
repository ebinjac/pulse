package main

import (
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func main() {
	log.SetFlags(0)

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	migrationsPath := env("PULSE_MIGRATIONS_PATH", "file://migrations")
	command := "up"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}

	m, err := migrate.New(migrationsPath, databaseURL)
	if err != nil {
		log.Fatalf("create migrator: %v", err)
	}
	defer func() {
		sourceErr, dbErr := m.Close()
		if sourceErr != nil {
			log.Printf("close migration source: %v", sourceErr)
		}
		if dbErr != nil {
			log.Printf("close migration database: %v", dbErr)
		}
	}()

	switch command {
	case "up":
		runNoChangeOK("migrate up", m.Up())
	case "down":
		downFlags := flag.NewFlagSet("down", flag.ExitOnError)
		yes := downFlags.Bool("yes", false, "confirm destructive rollback")
		_ = downFlags.Parse(os.Args[2:])
		if !*yes {
			log.Fatal("down is destructive; rerun with: down --yes")
		}
		runNoChangeOK("migrate down", m.Down())
	case "steps":
		if len(os.Args) < 3 {
			log.Fatal("steps requires a signed integer, for example: steps 1 or steps -1")
		}
		count, err := strconv.Atoi(os.Args[2])
		if err != nil {
			log.Fatalf("invalid steps count: %v", err)
		}
		runNoChangeOK(fmt.Sprintf("migrate steps %d", count), m.Steps(count))
	case "version":
		version, dirty, err := m.Version()
		if errors.Is(err, migrate.ErrNilVersion) {
			log.Print("version: none")
			return
		}
		if err != nil {
			log.Fatalf("migration version: %v", err)
		}
		log.Printf("version: %d dirty: %t", version, dirty)
	case "force":
		if len(os.Args) < 3 {
			log.Fatal("force requires a target version, for example: force 2")
		}
		version, err := strconv.Atoi(os.Args[2])
		if err != nil {
			log.Fatalf("invalid force version: %v", err)
		}
		if err := m.Force(version); err != nil {
			log.Fatalf("force version: %v", err)
		}
		log.Printf("forced migration version to %d", version)
	default:
		log.Fatalf("unknown command %q; use up, down, steps, version, or force", command)
	}
}

func runNoChangeOK(label string, err error) {
	if errors.Is(err, migrate.ErrNoChange) {
		log.Printf("%s: no change", label)
		return
	}
	if err != nil {
		log.Fatalf("%s: %v", label, err)
	}
	log.Printf("%s: ok", label)
}

func env(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}
