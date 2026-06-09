import { PulseConsole } from "@/components/pulse/console"

export default async function EditMonitorPage({
  params,
}: {
  params: Promise<{ monitorId: string }>
}) {
  const { monitorId } = await params

  return <PulseConsole view="builder" monitorId={monitorId} />
}
