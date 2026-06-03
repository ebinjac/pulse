# Pulse

Pulse is an MVP synthetic API monitoring platform for simple endpoint checks and multi-step API workflows with variables, secret references, assertions, extractors, run history, and basic alert paths.

## Apps

- `apps/web`: Next.js 16 UI with shadcn-style shared components.
- `apps/api`: Go API skeleton with in-memory monitor storage and mock execution.

## Current MVP Shape

The web app includes:

- Dashboard, monitor inventory, monitor builder, run history, run detail, secrets, and settings pages.
- Editable monitor builder with form controls and raw JSON config.
- Mock API route handlers under `apps/web/app/api/**`.
- Local mocked execution with assertion failure handling and masked/truncated run output.

The Go app includes:

- API-shaped monitor CRUD, manual run, run detail, secret test, and alert endpoints.
- In-memory store for early contract testing.
- PostgreSQL migration at `apps/api/migrations/001_initial_schema.sql`.

## Run Web

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

By default, the Next.js API routes use an in-memory mock store. To proxy those routes to the Go API instead:

```bash
PULSE_API_BASE_URL=http://localhost:8080 npm run dev
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

This starts PostgreSQL, Redis, and the Go API. The Go API still uses its in-memory store in this scaffold; the database is ready for the next persistence step.
