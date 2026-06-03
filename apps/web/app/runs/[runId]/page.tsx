import { PulseConsole } from "@/components/pulse/console"

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = await params

  return <PulseConsole view="run-detail" runId={runId} />
}
