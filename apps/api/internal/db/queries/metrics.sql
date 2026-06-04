-- name: GetMonitorRunUptimeStats :one
SELECT
  COUNT(*)::bigint AS total_runs,
  COUNT(*) FILTER (WHERE UPPER(COALESCE(status, '')) = 'SUCCESS')::bigint AS successful_runs
FROM monitor_runs
WHERE monitor_id = $1
  AND started_at >= $2
  AND COALESCE(triggered_by, '') NOT IN ('draft', 'test');

-- name: GetMonitorRunLatencyPercentiles :one
SELECT
  COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms), 0)::int AS p50_ms,
  COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::int AS p95_ms,
  COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms), 0)::int AS p99_ms,
  COALESCE(AVG(duration_ms), 0)::int AS avg_ms
FROM monitor_runs
WHERE monitor_id = $1
  AND started_at >= $2
  AND COALESCE(triggered_by, '') NOT IN ('draft', 'test')
  AND duration_ms IS NOT NULL;

-- name: GetMonitorStepLatencyPercentiles :one
SELECT
  COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY sr.latency_ms), 0)::int AS p50_ms,
  COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY sr.latency_ms), 0)::int AS p95_ms,
  COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY sr.latency_ms), 0)::int AS p99_ms,
  COALESCE(AVG(sr.latency_ms), 0)::int AS avg_ms
FROM monitor_step_runs sr
INNER JOIN monitor_runs r ON r.id = sr.monitor_run_id
WHERE r.monitor_id = $1
  AND r.started_at >= $2
  AND COALESCE(r.triggered_by, '') NOT IN ('draft', 'test')
  AND sr.latency_ms IS NOT NULL;

-- name: GetApplicationRunUptimeStats :one
SELECT
  COUNT(*)::bigint AS total_runs,
  COUNT(*) FILTER (WHERE UPPER(COALESCE(r.status, '')) = 'SUCCESS')::bigint AS successful_runs
FROM monitor_runs r
INNER JOIN monitors m ON m.id = r.monitor_id
WHERE m.application_id = $1
  AND r.started_at >= $2
  AND COALESCE(r.triggered_by, '') NOT IN ('draft', 'test');

-- name: GetApplicationRunLatencyPercentiles :one
SELECT
  COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY r.duration_ms), 0)::int AS p50_ms,
  COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY r.duration_ms), 0)::int AS p95_ms,
  COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY r.duration_ms), 0)::int AS p99_ms,
  COALESCE(AVG(r.duration_ms), 0)::int AS avg_ms
FROM monitor_runs r
INNER JOIN monitors m ON m.id = r.monitor_id
WHERE m.application_id = $1
  AND r.started_at >= $2
  AND COALESCE(r.triggered_by, '') NOT IN ('draft', 'test')
  AND r.duration_ms IS NOT NULL;

-- name: GetGlobalRunUptimeStats :one
SELECT
  COUNT(*)::bigint AS total_runs,
  COUNT(*) FILTER (WHERE UPPER(COALESCE(status, '')) = 'SUCCESS')::bigint AS successful_runs
FROM monitor_runs
WHERE started_at >= $1
  AND COALESCE(triggered_by, '') NOT IN ('draft', 'test');

-- name: GetGlobalRunLatencyPercentiles :one
SELECT
  COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms), 0)::int AS p50_ms,
  COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::int AS p95_ms,
  COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms), 0)::int AS p99_ms,
  COALESCE(AVG(duration_ms), 0)::int AS avg_ms
FROM monitor_runs
WHERE started_at >= $1
  AND COALESCE(triggered_by, '') NOT IN ('draft', 'test')
  AND duration_ms IS NOT NULL;
