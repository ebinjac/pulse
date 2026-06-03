# Pulse API

Early Go API skeleton for the Pulse MVP.

This service currently uses an in-memory store and a mock executor. It mirrors the Next.js mock API surface so the UI can later be pointed at this service without changing product contracts.

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
- `GET /api/secrets/{secretId}`
- `POST /api/secrets/{secretId}/test`
- `GET /api/alerts`

## Run

```bash
go run ./cmd/api
```

The service listens on `:8080` by default. Override with `PULSE_API_ADDR`.

## Database

The first PostgreSQL migration lives at `migrations/001_initial_schema.sql`. The Go service does not use it yet; the next backend step is replacing the in-memory store with PostgreSQL persistence and encrypted DB secret storage.
