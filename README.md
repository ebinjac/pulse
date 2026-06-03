# Pulse

Pulse is an MVP synthetic API monitoring platform for simple endpoint checks and multi-step API workflows with variables, secret references, assertions, extractors, run history, and basic alert paths.

## Apps

- `apps/web`: Next.js 16 UI with shadcn-style shared components.
- `apps/api`: Go API with PostgreSQL persistence, Redis-backed scheduled execution, encrypted DB secrets, and persisted alert events.

## Current MVP Shape

The web app includes:

- Dashboard, monitor inventory, monitor builder, run history, run detail, secrets, and settings pages.
- Editable monitor builder with form controls and raw JSON config.
- Next.js API route handlers under `apps/web/app/api/**` that proxy to the Go API. `PULSE_API_BASE_URL` is required; without it, routes return a `503` with code `PULSE_API_REQUIRED`.
- Real API-backed draft testing and execution, with masked/truncated run output.
- Monitor import/export: Postman Collection v2.1, OpenAPI 3 / Swagger 2, and Pulse JSON/YAML bundles (builder + inventory UI).
- Monitor drafts and version history: save unpublished draft config, publish to production, diff/rollback versions, and run draft executions without affecting scheduled monitors.

The Go app includes:

- Monitor CRUD, draft tests, manual runs, scheduled runs, run details, secret create/edit/test, and persisted alert endpoints.
- PostgreSQL store with encrypted database-backed secret values.
- Redis queue with API scheduler enqueueing and a separate worker process for scheduled monitor execution.
- sqlc-generated pgx queries and explicit golang-migrate database migrations.

## Run Web

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The local web env file points the Next.js API routes at the Go API:

```bash
cat apps/web/.env.local
```

## Run Go API

Requires Go 1.23+.

```bash
cd apps/api
go run ./cmd/api
```

The API listens on `http://localhost:8080` by default.

## Local Infrastructure

Requires Docker.

```bash
docker compose up --build
```

This starts PostgreSQL, Redis, the migration service, the Go API scheduler, and the Go worker. When `DATABASE_URL` is set, the API and worker require PostgreSQL and the migrated schema to be available.
The Compose stack runs the `migrate` service before starting the API and worker.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for separate web/API service deployment, required environment variables, and alert delivery configuration.
See [MIGRATIONS.md](MIGRATIONS.md) for the database migration runbook.
