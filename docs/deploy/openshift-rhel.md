# OpenShift deployment (RHEL / private cloud)

Deploy Pulse to a company **OpenShift** cluster with **managed PostgreSQL and Redis** provided by your platform team. You deploy **three application workloads**: API, worker(s), and web.

Example manifests: [`deploy/openshift/`](../../deploy/openshift/).

## Topology

```text
Internet → Route (pulse-web) → web pod
web pod  → Service pulse-api:8080 (internal)
API      → managed PostgreSQL + Redis (enqueue)
worker(s)→ same PostgreSQL + Redis (dequeue, execute)
```

Migrate runs from your **laptop or CI** against the company database — not as a long-running Deployment.

## Prerequisites

- OpenShift project/namespace with deploy permissions
- `DATABASE_URL` and `REDIS_URL` from platform team (private endpoints)
- Container registry access (internal or `image-registry.openshift-image-registry.svc:5000`)
- `oc` CLI logged in

## Step 1 — Build and push images

### Backend (API + worker + migrate)

Uses [`apps/api/Dockerfile`](../../apps/api/Dockerfile) from **repository root**:

```bash
docker build -f apps/api/Dockerfile -t pulse-api:latest .
docker tag pulse-api:latest image-registry.openshift-image-registry.svc:5000/<namespace>/pulse-api:latest
docker push image-registry.openshift-image-registry.svc:5000/<namespace>/pulse-api:latest
```

Or create an OpenShift **BuildConfig** from the Dockerfile (recommended if your cluster disallows local push).

One image, three commands:

| Workload | Command |
|----------|---------|
| API | `/app/pulse-api` |
| Worker | `/app/pulse-worker` |
| Migrate (Job) | `/app/pulse-migrate up` |

### Web

**Option A — Dockerfile** ([`apps/web/Dockerfile`](../../apps/web/Dockerfile)):

```bash
docker build -f apps/web/Dockerfile -t pulse-web:latest .
```

**Option B — RHEL Node.js S2I buildpack**

Build from monorepo root:

```bash
npm ci
npm run build --workspace web
npm run start --workspace web   # port 3000
```

Set `PULSE_API_BASE_URL` to the internal API Service URL.

## Step 2 — Secrets

Create an OpenShift Secret (see [`deploy/openshift/secrets.example.yaml`](../../deploy/openshift/secrets.example.yaml)):

```bash
oc create secret generic pulse-backend \
  --from-literal=DATABASE_URL='postgres://...' \
  --from-literal=REDIS_URL='redis://...' \
  --from-literal=PULSE_SECRET_ENCRYPTION_KEY='...'
```

Create `pulse-web` secret with `PULSE_API_BASE_URL=http://pulse-api.<namespace>.svc.cluster.local:8080`.

Use your company's secrets operator if required instead of plain Secrets.

## Step 3 — Migrate

From laptop (same as cloud test):

```bash
docker run --rm \
  -e DATABASE_URL='postgres://...' \
  pulse-api:latest /app/pulse-migrate up
```

Or apply the example Job once:

```bash
oc apply -f deploy/openshift/migrate-job.yaml
oc wait --for=condition=complete job/pulse-migrate --timeout=120s
```

Re-run migrate before each rollout that includes new SQL migrations.

## Step 4 — Deploy API

```bash
oc apply -f deploy/openshift/api-deployment.yaml
```

Key settings:

- `PULSE_SCHEDULER_ENABLED=true`
- `PULSE_WORKER_ENABLED=false`
- Liveness/readiness: `GET /healthz` on port 8080

Expose via Route only if web runs outside the cluster. Prefer **internal Service** for API when web is in-cluster.

## Step 5 — Deploy worker(s)

```bash
oc apply -f deploy/openshift/worker-deployment.yaml
```

Default example uses `replicas: 2`. Increase for many monitors:

```bash
oc scale deployment/pulse-worker --replicas=4
```

Each replica processes one monitor job at a time. Parallelism = replica count (for different monitors).

## Step 6 — Deploy web

```bash
oc apply -f deploy/openshift/web-deployment.yaml
```

Public **Route** on `pulse-web`. Set:

```bash
PULSE_API_BASE_URL=http://pulse-api:8080
```

(Service DNS name within the same namespace.)

## RHEL buildpack notes

- Build API image from repo root; the Dockerfile copies `apps/api` only.
- Web builds need the **full monorepo** (`npm ci` at root) because of workspace packages (`@workspace/ui`).
- Non-root containers: API image already runs as user `pulse`. Web Dockerfile should run as non-root per cluster policy.
- If only S2I is allowed, use golang builder for backend binaries and Node builder for web — equivalent to the Dockerfiles.

## Networking checklist

| From | To | URL |
|------|-----|-----|
| Browser | Web | `https://pulse-web-<apps>.<cluster>` |
| Web pod | API | `http://pulse-api:8080` |
| API / worker | Postgres | Platform `DATABASE_URL` |
| API / worker | Redis | Platform `REDIS_URL` |

## Smoke test

Same as [free-tier guide](free-tier-vercel-render.md#step-8--smoke-test), using OpenShift Route URLs.

## Optional: split worker scaling later

The example manifests keep API and worker separate. Do **not** set `PULSE_WORKER_ENABLED=true` on API when running dedicated worker Deployments.

If you later add HorizontalPodAutoscaler on `pulse-worker`, scale on CPU or custom metrics (queue depth requires extra instrumentation).
