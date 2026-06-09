import { PulseConsole } from "@/components/pulse/console"

export default async function EditDeploymentCheckPage({
  params,
}: {
  params: Promise<{ validationId: string }>
}) {
  const { validationId } = await params
  return <PulseConsole view="deployment-check-edit" validationId={validationId} />
}
