# Pulse API

Go API service for the Pulse MVP.

This service owns monitor persistence, scheduling, encrypted database secrets, run history, and persisted alert events. Scheduled monitor execution is queue-backed: the API scheduler enqueues Redis jobs, and the worker process consumes them. Manual runs still execute synchronously through the API.

## Endpoints

- `GET /healthz`
- `GET /api/monitors`
- `POST /api/monitors`
- `GET /api/monitors/{monitorId}`
- `PUT /api/monitors/{monitorId}`
- `DELETE /api/monitors/{monitorId}`
- `POST /api/monitors/{monitorId}/run`
- `GET /api/monitors/{monitorId}/runs`
- `GET /api/runs/{runId}`
- `GET /api/runs/{runId}/steps`
- `GET /api/secrets`
- `POST /api/secrets`
- `GET /api/secrets/{secretId}`
- `PUT /api/secrets/{secretId}`
- `POST /api/secrets/{secretId}/test`
- `GET /api/alerts`

## Run

```bash
go run ./cmd/api
```

The service listens on `:8080` by default. Override with `PULSE_API_ADDR`.

Run the scheduled execution worker in a second terminal:

```bash
go run ./cmd/worker
```

## Environment

Local values live in `.env`.

Required for the real runtime:

```bash
DATABASE_URL=postgres://pulse:pulse@localhost:5432/pulse?sslmode=disable
REDIS_URL=redis://localhost:6379/0
PULSE_SECRET_ENCRYPTION_KEY=base64-encoded-32-byte-key
PULSE_SCHEDULER_ENABLED=true
PULSE_WORKER_ENABLED=false
```

Optional alert delivery:

```bash
PULSE_ALERT_SLACK_WEBHOOK_URL=
PULSE_ALERT_SMTP_ADDR=
PULSE_ALERT_SMTP_USER=
PULSE_ALERT_SMTP_PASSWORD=
PULSE_ALERT_EMAIL_FROM=
PULSE_ALERT_EMAIL_TO=
```

## Database

PostgreSQL migrations live in `migrations` and are run by the `cmd/migrate` command.

```bash
set -a; source .env; set +a
go run ./cmd/migrate up
go run ./cmd/migrate version
```

The Docker image also includes `/app/pulse-migrate` and `/app/pulse-worker`. The root `docker-compose.yml` runs migrations first, starts the API scheduler, then starts the worker as a separate service.

See `../../MIGRATIONS.md` for the full migration runbook.

## sqlc

Typed pgx query code is generated with sqlc.

Install sqlc:

```bash
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
```

Regenerate after changing SQL files:

```bash
sqlc generate
```

Configuration lives at `sqlc.yaml`. Query files live in `internal/db/queries`, and generated code is written to `internal/db`.
