import { PulseConsole } from "@/components/pulse/console"

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>
}) {
  const { applicationId } = await params
  return <PulseConsole view="application-detail" applicationId={applicationId} />
}
