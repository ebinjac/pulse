import { NextResponse } from "next/server"
import { buildExportBundle, serializeExportBundle } from "@/lib/pulse-import-export"
import type { ExportFormat } from "@/lib/pulse-import-export/types"
import type { Monitor } from "@/lib/pulse-types"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      monitors?: Monitor[]
      monitor?: Monitor
      format?: ExportFormat
      download?: boolean
    }

    const monitors = body.monitors ?? (body.monitor ? [body.monitor] : [])
    if (!monitors.length) {
      return NextResponse.json({ error: "monitor or monitors is required" }, { status: 400 })
    }

    const format = body.format ?? "json"
    const bundle = buildExportBundle(monitors)
    const content = serializeExportBundle(bundle, format)
    const filename = `pulse-monitors-${new Date().toISOString().slice(0, 10)}.${format === "yaml" ? "yaml" : "json"}`
    const contentType = format === "yaml" ? "text/yaml; charset=utf-8" : "application/json; charset=utf-8"

    if (body.download) {
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    }

    return NextResponse.json({
      bundle,
      content,
      format,
      filename,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 400 }
    )
  }
}
