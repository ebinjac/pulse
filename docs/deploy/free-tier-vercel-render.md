# Free-tier cloud test (Vercel + Render + Neon + Upstash)

Deploy Pulse from your laptop for integration testing before moving to company OpenShift. Uses **split API + worker** (three app services).

## Architecture

```text
Vercel          → Web (Next.js)
Render          → API (/app/pulse-api)
Render          → Worker (/app/pulse-worker)
Neon            → PostgreSQL
Upstash         → Redis
Your laptop     → pulse-migrate up (one-shot, before deploy)
```

## Prerequisites

- GitHub repo with this code pushed
- Accounts: [Neon](https://neon.tech), [Upstash](https://upstash.com), [Render](https://render.com), [Vercel](https://vercel.com)
- Docker locally (for migrate one-liner) or Go 1.25+

## Step 1 — Managed Postgres (Neon)

1. Create a project and database named `pulse`.
2. Copy the connection string. Append `?sslmode=require` if not present.
3. Save as `DATABASE_URL`.

## Step 2 — Managed Redis (Upstash)

1. Create a Redis database.
2. Copy the **TLS** URL (`rediss://...`).
3. Save as `REDIS_URL`.

## Step 3 — Encryption key

```bash
openssl rand -base64 32
```

Save the output as `PULSE_SECRET_ENCRYPTION_KEY`. Use the **same value** on API and worker.

## Step 4 — Migrate from your laptop

Migrations are **not** a cloud service. Run once before first deploy and again after pulling new migration files.

**Docker (recommended):**

```bash
cd /path/to/ensemble-pulse
docker build -f apps/api/Dockerfile -t pulse-api .
docker run --rm \
  -e DATABASE_URL='postgres://USER:PASS@HOST/pulse?sslmode=require' \
  -e PULSE_MIGRATIONS_PATH='file:///app/migrations' \
  pulse-api /app/pulse-migrate up
docker run --rm \
  -e DATABASE_URL='postgres://USER:PASS@HOST/pulse?sslmode=require' \
  pulse-api /app/pulse-migrate version
```

Confirm `dirty: false`.

**Local Go:**

```bash
cd apps/api
DATABASE_URL='postgres://...' go run ./cmd/migrate up
```

## Step 5 — Render: API service

1. New **Web Service** → connect GitHub repo.
2. **Root directory:** repository root.
3. **Environment:** Docker.
4. **Dockerfile path:** `apps/api/Dockerfile`.
5. **Docker command:** `/app/pulse-api` (or leave default CMD).
6. **Port:** `8080`.
7. **Health check path:** `/healthz`.

Environment variables:

```bash
PULSE_API_ADDR=:8080
DATABASE_URL=...
REDIS_URL=...
PULSE_SECRET_ENCRYPTION_KEY=...
PULSE_SCHEDULER_ENABLED=true
PULSE_WORKER_ENABLED=false
```

Note the public URL, e.g. `https://pulse-api.onrender.com`.

### Render free-tier note

Free web services **spin down** after inactivity. Expect 30–60s cold starts. Upgrade to a paid instance for a stable demo.

## Step 6 — Render: Worker service

1. New **Background Worker** → same repo.
2. **Dockerfile path:** `apps/api/Dockerfile`.
3. **Docker command:** `/app/pulse-worker`.

Environment variables (same as API, minus scheduler flags):

```bash
DATABASE_URL=...
REDIS_URL=...
PULSE_SECRET_ENCRYPTION_KEY=...
```

Optional alert delivery vars — see [env-templates.md](env-templates.md).

### Scaling workers on Render

- Free tier: typically **one** worker instance.
- Paid: increase instance count when you have many monitors. Each instance runs one monitor job at a time; multiple instances process different monitors in parallel.

Alternatively use the repo [`render.yaml`](../../render.yaml) blueprint (API + worker with shared env).

## Step 7 — Vercel: Web

1. Import GitHub repo in Vercel.
2. **Framework preset:** Next.js.
3. **Root directory:** `apps/web` **or** monorepo root with custom commands:

| Setting | Monorepo root |
|---------|---------------|
| Install | `npm ci` |
| Build | `npm run build --workspace web` |
| Output | Next.js default |

4. Environment variables:

```bash
PULSE_API_BASE_URL=https://pulse-api.onrender.com
```

No trailing slash. Do **not** prefix with `NEXT_PUBLIC_`.

Optional Copilot:

```bash
LLM_API_KEY=...
LLM_HTTP_REFERER=https://your-app.vercel.app
```

Deploy and note the Vercel URL.

## Step 8 — Smoke test

1. `curl https://pulse-api.onrender.com/healthz`
2. Open Vercel URL → dashboard loads.
3. **Secrets** → create and test a secret.
4. Create a monitor → **Run now** → run appears in history.
5. Wait for a scheduled cron tick → confirm worker logs on Render show execution.
6. With multiple monitors: add a second worker instance (paid) and confirm parallel execution in logs.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Web shows `PULSE_API_REQUIRED` | `PULSE_API_BASE_URL` set on Vercel, redeploy web |
| API fails on startup | Migrations ran? `DATABASE_URL` correct? |
| Scheduled runs never happen | Worker running? `REDIS_URL` same on API and worker? |
| Worker exits immediately | `DATABASE_URL` and `REDIS_URL` required on worker |
| Secrets fail after redeploy | `PULSE_SECRET_ENCRYPTION_KEY` changed? Must stay stable |

## Next: company OpenShift

See [openshift-rhel.md](openshift-rhel.md) when moving to your company laptop and private cluster.
