import { NextResponse } from "next/server"
import { importPostmanCollection } from "@/lib/pulse-import-export"
import type { PostmanImportOptions } from "@/lib/pulse-import-export/types"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      document: string | Record<string, unknown>
    } & PostmanImportOptions

    if (!body.document) {
      return NextResponse.json({ error: "document is required" }, { status: 400 })
    }

    const result = importPostmanCollection(body.document, {
      applicationId: body.applicationId,
      mode: body.mode,
      scheduleMode: body.scheduleMode,
      cron: body.cron,
      baseUrlVariable: body.baseUrlVariable,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Postman import failed" },
      { status: 400 }
    )
  }
}
