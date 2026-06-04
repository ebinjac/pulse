# Pulse Deployment Guide

This MVP is designed as two application services:

- **Web**: Next.js app in `apps/web`
- **API**: Go service in `apps/api`

The API owns monitor execution, scheduling, persistence, and encrypted secret storage. The web service serves the UI and proxies `/api/**` requests to the Go API through `PULSE_API_BASE_URL`.

## Runtime Dependencies

Provision these before deploying the API:

- PostgreSQL 16+
- Redis 7+
- A stable secret encryption key for `PULSE_SECRET_ENCRYPTION_KEY`

Generate a production encryption key:

```bash
openssl rand -base64 32
```

Keep this value stable. Existing encrypted secrets cannot be decrypted if the key changes.

## API Service

Required environment variables:

```bash
PULSE_API_ADDR=:8080
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require
REDIS_URL=redis://HOST:6379/0
PULSE_SECRET_ENCRYPTION_KEY=replace-with-base64-32-byte-key
```

Optional alert delivery environment variables:

```bash
PULSE_ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
PULSE_ALERT_SMTP_ADDR=smtp.example.com:587
PULSE_ALERT_SMTP_USER=alerts-smtp-user
PULSE_ALERT_SMTP_PASSWORD=alerts-smtp-password
PULSE_ALERT_EMAIL_FROM=pulse-alerts@example.com
PULSE_ALERT_EMAIL_TO=oncall@example.com,platform@example.com
```

Slack can also use an encrypted Pulse secret with alias `slackWebhook`. If neither Slack nor SMTP is configured, alert events are still persisted, but delivery attempts are marked `skipped`.

For local development, `apps/api/.env` is already created with localhost values.

### Database Migrations

Run database migrations before starting or rolling out the API service. The API image contains both runtime binaries:

```text
/app/pulse-migrate
/app/pulse-api
```

Production deployment order:

1. Build and publish the API image.
2. Back up the database or confirm managed point-in-time recovery.
3. Run `/app/pulse-migrate up` once against the target database.
4. Confirm `/app/pulse-migrate version` reports the expected version with `dirty: false`.
5. Start or roll out `/app/pulse-api`.

Docker example:

```bash
docker run --rm \
  -e DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require' \
  -e PULSE_MIGRATIONS_PATH='file:///app/migrations' \
  ensemble-pulse-api \
  /app/pulse-migrate up
```

See [MIGRATIONS.md](MIGRATIONS.md) for rollback, dirty migration repair, and sqlc regeneration guidance.

### Build And Run With Go

```bash
cd apps/api
set -a; source .env; set +a
go test ./...
go build -o pulse-api ./cmd/api
./pulse-api
```

The API health check is:

```bash
curl http://localhost:8080/healthz
```

### Build And Run With Docker

From the repository root:

```bash
docker build -f apps/api/Dockerfile -t ensemble-pulse-api .
docker run --rm \
  -e DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require' \
  ensemble-pulse-api \
  /app/pulse-migrate up
docker run --rm -p 8080:8080 \
  -e PULSE_API_ADDR=:8080 \
  -e DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require' \
  -e REDIS_URL='redis://HOST:6379/0' \
  -e PULSE_SECRET_ENCRYPTION_KEY='replace-with-base64-32-byte-key' \
  -e PULSE_ALERT_EMAIL_TO='oncall@example.com' \
  ensemble-pulse-api
```

If PostgreSQL or Redis are running outside the container, do not use `localhost` from inside the API container. Use the service DNS name, private network hostname, or managed database hostname.

## Web Service

Required environment variables:

```bash
PULSE_API_BASE_URL=https://your-api-service.example.com
```

The web app does not serve mock data when this variable is unset. Next.js `/api/*` routes return `503` with code `PULSE_API_REQUIRED` instead.

For local development, copy `apps/web/.env.example` to `apps/web/.env.local` and point it at your Go API (for example `http://localhost:8080`).

`PULSE_API_BASE_URL` is intentionally not prefixed with `NEXT_PUBLIC_`. It is read by Next.js Route Handlers on the server and is not exposed to browser JavaScript.

### Build And Run

From the repository root:

```bash
npm ci
npm run build --workspace web
npm run start --workspace web
```

By default, Next.js serves on port `3000`. Set the port outside `.env` when starting the server:

```bash
PORT=3000 npm run start --workspace web
```

## Separate Service Topology

Recommended production topology:

```text
Browser
  |
  v
Web service, Next.js, port 3000
  |
  | server-side proxy using PULSE_API_BASE_URL
  v
API service, Go, port 8080
  |
  +--> PostgreSQL
  |
  +--> Redis
        |
        v
Worker service, Go
```

Expose the web service publicly. Keep the API private if your host supports private networking, then set `PULSE_API_BASE_URL` to the API private URL from the web service. If the API must be public for the MVP, put it behind HTTPS and restrict access at the platform/firewall level where possible.

## Platform Checklist

1. Create PostgreSQL and Redis services.
2. Run database migrations against PostgreSQL.
3. Run the API service with `DATABASE_URL`, `REDIS_URL`, `PULSE_SECRET_ENCRYPTION_KEY`, `PULSE_SCHEDULER_ENABLED=true`, and `PULSE_WORKER_ENABLED=false`.
4. Run one or more worker services from the same image with command `/app/pulse-worker` and the same `DATABASE_URL`, `REDIS_URL`, `PULSE_SECRET_ENCRYPTION_KEY`, and alert delivery variables.
5. Confirm `GET /healthz` returns healthy.
6. Run the web service with `PULSE_API_BASE_URL` pointing to the API base URL.
7. Open the web URL and create a secret from `/secrets`.
8. Verify the secret test succeeds and monitor creation/manual runs work.
9. Force a monitor failure until its threshold is reached and verify `/api/alerts` shows a persisted alert with delivery statuses.

## Local Two-Service Development

Start infrastructure and API:

```bash
docker compose up -d postgres redis migrate api worker
```

If this is a fresh machine or after pulling new migration files, rebuild the API image used by the migration service:

```bash
docker compose up -d --build postgres redis migrate api worker
```

If `migrate` logs `migrate up: no change` but the API says tables are missing, check whether only the migration bookkeeping table exists:

```bash
docker compose exec postgres psql -U pulse -d pulse -c '\dt'
docker compose exec postgres psql -U pulse -d pulse -c 'select * from schema_migrations;'
docker compose run --rm migrate /app/pulse-migrate version
```

For a local development database with no data you need to keep, reset the PostgreSQL volume and rerun migrations:

```bash
docker compose down -v
docker compose up -d --build postgres redis migrate api worker
```

Do not use `docker compose down -v` against a database that contains data you need. It deletes the local PostgreSQL volume.

Start the web service separately:

```bash
npm run dev --workspace web
```

Open:

```text
http://localhost:3000
```

The web app will proxy API route calls to `http://localhost:8080` through `apps/web/.env.local`.

## Notes

- Do not commit `.env` files with real secrets.
- Rotate `PULSE_SECRET_ENCRYPTION_KEY` only with a planned re-encryption migration.
- Use HTTPS for both public web traffic and any public API traffic.
- If you scale the API to multiple instances, all API and worker instances must use the same `PULSE_SECRET_ENCRYPTION_KEY`.
- Scheduled monitor jobs use Redis enqueue deduplication plus per-monitor worker run locks. You can scale workers horizontally; duplicate queued jobs for the same monitor are skipped while a lock is active.
- If you scale the web service to multiple Next.js instances and later add Server Actions, set a shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
