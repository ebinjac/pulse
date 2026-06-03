# Pulse

Pulse is an MVP synthetic API monitoring platform for simple endpoint checks and multi-step API workflows with variables, secret references, assertions, extractors, run history, and basic alert paths.

## Apps

- `apps/web`: Next.js 16 UI with shadcn-style shared components.
- `apps/api`: Go API with PostgreSQL persistence, real monitor execution, scheduling, encrypted DB secrets, and persisted alert events.

## Current MVP Shape

The web app includes:

- Dashboard, monitor inventory, monitor builder, run history, run detail, secrets, and settings pages.
- Editable monitor builder with form controls and raw JSON config.
- Next.js API route handlers under `apps/web/app/api/**` that proxy to the Go API when `PULSE_API_BASE_URL` is set, with local mock fallbacks for early UI work.
- Real API-backed draft testing and execution, with masked/truncated run output.

The Go app includes:

- Monitor CRUD, draft tests, manual runs, scheduled runs, run details, secret create/edit/test, and persisted alert endpoints.
- PostgreSQL store with encrypted database-backed secret values.
- In-memory fallback for local contract testing if PostgreSQL is unavailable.

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

This starts PostgreSQL, Redis, and the Go API. The API uses PostgreSQL when `DATABASE_URL` is available and falls back to memory only if Postgres is unavailable.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for separate web/API service deployment, required environment variables, and alert delivery configuration.
