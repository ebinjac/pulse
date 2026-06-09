import { PulseConsole } from "@/components/pulse/console"

export default async function AlertDetailPage({
  params,
}: {
  params: Promise<{ alertId: string }>
}) {
  const { alertId } = await params

  return <PulseConsole view="alert-detail" alertId={alertId} />
}
