# Pulse deployment runbooks

Platform-specific guides for deploying Pulse **without Docker Compose**. Each service is deployed independently.

## Guides

| Guide | When to use |
|-------|-------------|
| [free-tier-vercel-render.md](free-tier-vercel-render.md) | Test from your laptop: Vercel + Render + Neon + Upstash |
| [openshift-rhel.md](openshift-rhel.md) | Company private OpenShift cluster (managed Postgres + Redis) |
| [env-templates.md](env-templates.md) | Copy-paste environment variables per service |

Canonical env reference: [DEPLOYMENT.md](../../DEPLOYMENT.md). Migration runbook: [MIGRATIONS.md](../../MIGRATIONS.md).

## Default topology (split API + worker)

Pulse runs as **three application services** plus managed data stores:

```text
Browser → Web (Next.js :3000)
            → API (Go :8080) → PostgreSQL
                    ↘ Redis queue
                         ↓
                      Worker(s) (Go, /app/pulse-worker)
```

| Unit | Deploy as a service? | Artifact |
|------|----------------------|----------|
| PostgreSQL 16+ | Managed (connection string) | Neon, RDS, company DB |
| Redis 7+ | Managed (connection string) | Upstash, ElastiCache, company Redis |
| **migrate** | No — run once from laptop or CI | `/app/pulse-migrate up` |
| **api** | Yes | [`apps/api/Dockerfile`](../../apps/api/Dockerfile) → `/app/pulse-api` |
| **worker** | Yes (1+ replicas) | Same image → `/app/pulse-worker` |
| **web** | Yes | [`apps/web`](../../apps/web) or [`apps/web/Dockerfile`](../../apps/web/Dockerfile) |

## Deploy order

```text
1. Provision DATABASE_URL and REDIS_URL
2. Generate PULSE_SECRET_ENCRYPTION_KEY (openssl rand -base64 32)
3. Run pulse-migrate up from laptop or CI
4. Deploy API (scheduler on, embedded worker off)
5. Deploy worker(s) — scale replicas for monitor load
6. Deploy web with PULSE_API_BASE_URL
7. Smoke test (healthz, secrets, manual run, scheduled run)
```

## Worker parallelism and scaling

The worker is **not** limited by Go — it is limited by the current implementation: **one job at a time per worker process** ([`worker.go`](../../apps/api/internal/worker/worker.go) dequeues and runs `process(job)` synchronously).

| Worker replicas | Concurrent monitor runs (typical) |
|-----------------|-----------------------------------|
| 1 | 1 |
| 3 | Up to 3 different monitors |
| N | Up to N |

All workers share one Redis queue. Per-monitor Redis locks prevent the same monitor from running twice in parallel across workers.

### Sizing guidance

- **Many monitors (dozens+, 1–5 min cron):** start with **2 worker replicas**, increase when runs start late or the queue backs up.
- **API replicas:** keep **1–2** with `PULSE_WORKER_ENABLED=false`. Scale API for HTTP traffic only.
- **Worker replicas:** scale for scheduled execution throughput.
- Watch Postgres connection limits and Redis connection caps as workers grow.

### API vs worker responsibilities

| Process | Role |
|---------|------|
| API | HTTP API, cron scheduler (enqueues jobs to Redis), SSE/event bus |
| Worker | Dequeues and executes monitor runs, deployment validation batches, log-check triggers |

Set on API:

```bash
PULSE_SCHEDULER_ENABLED=true
PULSE_WORKER_ENABLED=false
```

Worker uses the same image with command `/app/pulse-worker`.

## Combined API + worker (dev only)

For a **tiny** local or single-container test (a handful of monitors), you may set `PULSE_WORKER_ENABLED=true` on the API process. The same binary runs scheduler, HTTP, and one sequential worker loop.

**Not recommended for production or many monitors** because:

- Monitor execution competes with API CPU/memory in one process
- Only one job runs at a time per process (no horizontal worker scaling)
- Scaling API replicas with embedded workers duplicates schedulers

Use split API + worker for your production and OpenShift deployments.

## OpenShift manifests

Example Kubernetes/OpenShift resources live in [`deploy/openshift/`](../../deploy/openshift/).

## Optional Render blueprint

[`render.yaml`](../../render.yaml) declares API + worker services with a shared env group for quick Render setup.
