import { PulseConsole } from "@/components/pulse/console"

export default async function ElfQueryDetailPage({
  params,
}: {
  params: Promise<{ queryId: string }>
}) {
  const { queryId } = await params
  return <PulseConsole view="elf-query-detail" queryId={queryId} />
}
