import { PulseConsole } from "@/components/pulse/console"

export default async function DeploymentValidationPage({
  params,
}: {
  params: Promise<{ validationId: string }>
}) {
  const { validationId } = await params
  return <PulseConsole view="deployment-validation" validationId={validationId} />
}
