# Pulse domain glossary

Shared vocabulary for the Pulse synthetic monitoring platform. Backend types live in [`apps/api/internal/domain/types.go`](apps/api/internal/domain/types.go); the web app mirrors them in [`apps/web/lib/pulse-types.ts`](apps/web/lib/pulse-types.ts).

## Core entities

- **Application** — A logical grouping of monitors (e.g. a product or CAR). Has a CAR ID, schedule, and member monitors.
- **Monitor** — A synthetic check definition: ordered steps, schedule, variables, secrets, and alert policy.
- **MonitorRun** — One execution of a monitor. Contains step runs, timing, status, and failure reason.
- **AlertEvent** — A persisted alert when a monitor breaches policy (open, acknowledged, resolved, suppressed).

## Monitor lifecycle

- **Published monitor** — The live configuration used by the scheduler and production runs.
- **Draft** — An unpublished edit of a monitor. Saved separately; **publish** promotes draft to published and bumps version.
- **Monitor version** — Immutable snapshot of a published configuration for rollback.

## Deployment validation

- **DeploymentValidation** — A release gate that samples monitors before and after a deployment.
- **Pre phase / Post phase** — Run samples linked to the validation before vs after deploy.
- **Baseline window** — Historical runs used to compare post-deploy behavior.
- **ELF log check** — Optional phase after post-deploy sampling. Runs reusable OpenSearch queries against the company ELF proxy (`*:elf-{elfAppId}-*/_search`).
- **ElfQuery** — Library definition with `searchBody`, `gateMode` (`blocking` | `advisory`), and pass criteria (`max_hits`, `min_hits`, `aggregation`).
- **elfAppId** — Per-application ELF index segment (e.g. `200003773`); configured on Application or overridden per query.

## Execution

- **Scheduled run** — Enqueued by the scheduler, executed by the worker via Redis (or in-memory queue locally).
- **Manual run** — Triggered via API; may execute synchronously in the API process.
- **Draft run / Test run** — Executes draft config without persisting as production state.

## Secrets and certificates

- **SecretReference** — Named encrypted value (alias) referenced by monitors and certificate profiles.
- **CertificateProfile** — Host/port-bound mTLS material (PEM or PFX) stored as secret aliases.
