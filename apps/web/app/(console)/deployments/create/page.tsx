import { PulseConsole } from "@/components/pulse/console"

export default async function CreateDeploymentCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ applicationId?: string }>
}) {
  const { applicationId } = await searchParams
  return <PulseConsole view="deployment-check-create" applicationId={applicationId} />
}
