import { PulseConsole } from "@/components/pulse/console"

export default async function MonitorRunsPage({
  params,
}: {
  params: Promise<{ monitorId: string }>
}) {
  const { monitorId } = await params

  return <PulseConsole view="runs" monitorId={monitorId} />
}
