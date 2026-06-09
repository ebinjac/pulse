# Environment variable templates

Copy values into your platform's secret store. Never commit real credentials.

Generate encryption key:

```bash
openssl rand -base64 32
```

## Shared backend (API + worker)

These must match on **all** API and worker instances:

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/pulse?sslmode=require
REDIS_URL=rediss://default:TOKEN@HOST:6379
PULSE_SECRET_ENCRYPTION_KEY=base64-encoded-32-byte-key
```

## API only

```bash
PULSE_API_ADDR=:8080
PULSE_SCHEDULER_ENABLED=true
PULSE_WORKER_ENABLED=false
PULSE_RETENTION_PURGE_ENABLED=true
```

Optional alerts (API persists events even when delivery is skipped):

```bash
PULSE_ALERT_SLACK_WEBHOOK_URL=
PULSE_ALERT_SMTP_ADDR=
PULSE_ALERT_SMTP_USER=
PULSE_ALERT_SMTP_PASSWORD=
PULSE_ALERT_EMAIL_FROM=
PULSE_ALERT_EMAIL_TO=
```

## Worker only

Same image as API; command `/app/pulse-worker`.

```bash
DATABASE_URL=...          # same as API
REDIS_URL=...             # same as API
PULSE_SECRET_ENCRYPTION_KEY=...   # same as API
```

Optional: same `PULSE_ALERT_*` vars as API if workers should deliver alerts directly.

No `PULSE_SCHEDULER_ENABLED` or `PULSE_WORKER_ENABLED` on the standalone worker process.

## Migrate (one-shot, laptop or Job)

```bash
DATABASE_URL=...
PULSE_MIGRATIONS_PATH=file:///app/migrations
```

Command: `/app/pulse-migrate up`

## Web only

```bash
PULSE_API_BASE_URL=https://pulse-api.example.com
PORT=3000
```

Internal OpenShift example:

```bash
PULSE_API_BASE_URL=http://pulse-api:8080
```

Optional Copilot (server-side only):

```bash
LLM_API_ENDPOINT=https://openrouter.ai/api/v1/chat/completions
LLM_MODEL=moonshotai/kimi-k2.6:free
LLM_API_KEY=
LLM_HTTP_REFERER=https://pulse.example.com
LLM_APP_TITLE=Pulse
```

Multi-instance web (Server Actions):

```bash
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=
```

## Combined API+worker (dev only)

Single container testing only — **not** for production with many monitors:

```bash
PULSE_SCHEDULER_ENABLED=true
PULSE_WORKER_ENABLED=true
```

When `REDIS_URL` is set, worker defaults to **off** unless you explicitly set `PULSE_WORKER_ENABLED=true`.

## Render env group (both backend services)

Create one Render **Environment Group** and attach to API and worker:

| Key | API | Worker |
|-----|-----|--------|
| `DATABASE_URL` | yes | yes |
| `REDIS_URL` | yes | yes |
| `PULSE_SECRET_ENCRYPTION_KEY` | yes | yes |
| `PULSE_SCHEDULER_ENABLED` | `true` | — |
| `PULSE_WORKER_ENABLED` | `false` | — |
| `PULSE_API_ADDR` | `:8080` | — |

See [`.env.deploy.example`](../../.env.deploy.example) for a single-file reference.
