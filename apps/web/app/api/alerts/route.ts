import { listRuns } from "@/lib/pulse-mock-store"
import { proxyToPulseApi } from "@/lib/pulse-upstream"

export async function GET(request: Request) {
  const upstream = await proxyToPulseApi(request, "/api/alerts")
  if (upstream) return upstream

  const alerts = listRuns()
    .filter((run) => run.status !== "success")
    .map((run) => ({
      id: `alert-${run.id}`,
      monitorId: run.monitorId,
      status: "open",
      severity: run.status === "failed" ? "critical" : "warning",
      title: `${run.monitorName} is ${run.status}`,
      description: run.failureReason ?? "Monitor run did not complete successfully.",
      failureCategory: run.failureCategory ?? "UNKNOWN_ERROR",
      firstTriggeredAt: run.endedAt,
      lastTriggeredAt: run.endedAt,
      channels: ["email", "slack"],
    }))

  return Response.json({ alerts })
}
