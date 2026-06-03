# Pulse API

Go API service for the Pulse MVP.

This service owns monitor persistence, monitor execution, scheduling, encrypted database secrets, run history, and persisted alert events. It uses PostgreSQL when `DATABASE_URL` is configured and falls back to an in-memory store for local contract testing.

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

## Environment

Local values live in `.env`.

Required for the real runtime:

```bash
DATABASE_URL=postgres://pulse:pulse@localhost:5432/pulse?sslmode=disable
REDIS_URL=redis://localhost:6379/0
PULSE_SECRET_ENCRYPTION_KEY=base64-encoded-32-byte-key
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

The PostgreSQL migration lives at `migrations/001_initial_schema.sql`. Startup also applies compatible schema patches for existing local databases.

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
