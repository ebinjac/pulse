import { NextResponse } from "next/server"
import { monitorsFromExportBundle, parseExportBundle } from "@/lib/pulse-import-export"
import type { ExportFormat } from "@/lib/pulse-import-export/types"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      document: string
      format?: ExportFormat
      applicationId?: string
    }

    if (!body.document?.trim()) {
      return NextResponse.json({ error: "document is required" }, { status: 400 })
    }

    const bundle = parseExportBundle(body.document, body.format ?? "json")
    const monitors = monitorsFromExportBundle(bundle, body.applicationId)

    return NextResponse.json({
      monitors,
      stats: { monitorCount: monitors.length },
      exportedAt: bundle.exportedAt,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bundle import failed" },
      { status: 400 }
    )
  }
}
