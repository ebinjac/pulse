import { NextResponse } from "next/server"
import { importOpenApiDocument } from "@/lib/pulse-import-export"
import type { OpenApiImportOptions } from "@/lib/pulse-import-export/types"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      document: string | Record<string, unknown>
    } & OpenApiImportOptions

    if (!body.document) {
      return NextResponse.json({ error: "document is required" }, { status: 400 })
    }

    const result = importOpenApiDocument(body.document, {
      applicationId: body.applicationId,
      baseUrl: body.baseUrl,
      scheduleMode: body.scheduleMode,
      cron: body.cron,
      operations: body.operations,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OpenAPI import failed" },
      { status: 400 }
    )
  }
}
