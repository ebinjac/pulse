export function pulseMonitorApiPath(monitorId: string, ...segments: string[]): string {
  const encoded = encodeURIComponent(monitorId)
  if (segments.length === 0) {
    return `/api/monitors/${encoded}`
  }
  const tail = segments.map((segment) => encodeURIComponent(segment)).join("/")
  return `/api/monitors/${encoded}/${tail}`
}
