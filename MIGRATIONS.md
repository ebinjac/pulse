# Pulse Database Migrations

Pulse uses `golang-migrate` through the API image's `pulse-migrate` binary. Migrations are explicit deployment steps, not hidden API startup work.

## Files

Migration files live in:

```text
apps/api/migrations
```

Use golang-migrate naming:

```text
000001_initial_schema.up.sql
000001_initial_schema.down.sql
000002_compatibility_patches.up.sql
000002_compatibility_patches.down.sql
000005_monitor_versions.up.sql
000005_monitor_versions.down.sql
000006_alert_routing_ops.up.sql
000006_alert_routing_ops.down.sql
000007_system_settings.up.sql
000007_system_settings.down.sql
```

Each schema change must add a new numbered pair:

```text
000003_short_description.up.sql
000003_short_description.down.sql
```

Prefer reversible `down` migrations for local development. For production data-preserving changes where rollback would drop data, make the `down` file intentionally no-op and explain why in a SQL comment.

## Local Docker Compose

The local Compose stack has a dedicated `migrate` service. It runs before the API starts.

```bash
docker compose up -d --build postgres redis migrate api
```

Check migration logs:

```bash
docker compose logs migrate
```

Run migrations again after adding SQL files:

```bash
docker compose run --rm migrate
```

Check current DB migration version:

```bash
docker compose run --rm migrate /app/pulse-migrate version
```

## Local Go

Start PostgreSQL, load API env, then run:

```bash
cd apps/api
set -a; source .env; set +a
go run ./cmd/migrate up
go run ./cmd/api
```

Check version:

```bash
go run ./cmd/migrate version
```

Roll back one migration locally:

```bash
go run ./cmd/migrate steps -1
```

Roll back all migrations locally:

```bash
go run ./cmd/migrate down --yes
```

Do not run `down --yes` against production unless you have a verified backup and an approved rollback plan.

## Production Deployment Pattern

Recommended order for every API deployment:

1. Build and publish the API image.
2. Back up the production database or confirm managed point-in-time recovery.
3. Run the migration job once with the new image.
4. Confirm `pulse-migrate version` reports the expected latest version and `dirty: false`.
5. Deploy or restart the API service.
6. Smoke test `GET /healthz`, monitor list, secret test, and one manual run.

Example migration job using the API image:

```bash
docker run --rm \
  -e DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require' \
  -e PULSE_MIGRATIONS_PATH='file:///app/migrations' \
  ensemble-pulse-api \
  /app/pulse-migrate up
```

Version check:

```bash
docker run --rm \
  -e DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require' \
  -e PULSE_MIGRATIONS_PATH='file:///app/migrations' \
  ensemble-pulse-api \
  /app/pulse-migrate version
```

## Troubleshooting Empty Databases

If `pulse-migrate up` prints `migrate up: no change` but the API fails with missing PostgreSQL tables, the migration metadata and actual schema are out of sync, or the migration image/path is stale.

First confirm the image can see migrations:

```bash
docker compose run --rm migrate sh -lc 'ls -1 /app/migrations/*.up.sql'
```

Then check the database state:

```bash
docker compose exec postgres psql -U pulse -d pulse -c '\dt'
docker compose exec postgres psql -U pulse -d pulse -c 'select * from schema_migrations;'
docker compose run --rm migrate /app/pulse-migrate version
```

If this is only a local development database and there is no data to preserve, reset the local volume and rebuild the image:

```bash
docker compose down -v
docker compose up -d --build postgres redis migrate api worker
```

If there is data to preserve, do not delete the volume. Inspect `schema_migrations`, restore the missing schema from backup, or repair the schema manually before using `pulse-migrate force`.

## Dirty Migrations

If a migration fails partway through, golang-migrate marks the database as dirty and blocks future migrations.

1. Inspect the failed migration logs.
2. Manually repair the database to the expected state.
3. Force the migration version only after repair:

```bash
docker run --rm \
  -e DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require' \
  ensemble-pulse-api \
  /app/pulse-migrate force 2
```

Then rerun:

```bash
/app/pulse-migrate up
```

Use `force` carefully. It changes migration bookkeeping only; it does not modify schema.

## sqlc After Schema Changes

If a migration changes tables used by the Go store:

```bash
cd apps/api
sqlc generate
go test ./...
```

`apps/api/sqlc.yaml` reads the migration SQL as schema input and writes generated pgx query code to `apps/api/internal/db`.

## API Startup Rule

When `DATABASE_URL` is set, the API expects the database schema to already be migrated. It will fail startup if PostgreSQL or required tables are unavailable. This is intentional so production never silently falls back to in-memory storage.
