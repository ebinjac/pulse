"use client"

import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import type { Monitor, MonitorRun } from "@/lib/pulse-types"
import { isFailedStatus } from "@/components/pulse/console-shared"
import { Button, Card, Description } from "@heroui/react"

export function HistoryPatternAnalysis({ monitor, runs }: { monitor: Monitor; runs: MonitorRun[] }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    patternDetected: boolean
    summary: string
    conclusions: string[]
  } | null>(null)

  const monitorRuns = runs.filter((run) => run.monitorId === monitor.id)
  const hasFailures = monitorRuns.some((r) => isFailedStatus(r.status))

  async function analyze() {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch("/api/copilot/root-cause-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runs: monitorRuns.slice(0, 15), monitorName: monitor.name }),
      })
      if (res.ok) {
        const data = await res.json()
        setResult(data.result)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (!hasFailures) return null

  return (
    <Card className="border border-primary/20 bg-primary/[0.01] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary animate-pulse" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-primary">Pulse Copilot: Run History Analytics</h3>
        </div>
        {!result && !loading && (
          <Button size="sm" onPress={analyze} className="h-7 text-[10px] bg-primary text-primary-foreground cursor-pointer px-2.5">
            Analyze Pattern
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-4 text-muted-foreground text-xs gap-2">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>Aggregating logs and analyzing status trends across runs...</span>
        </div>
      )}

      {result && (
        <div className="space-y-3 text-xs animate-in fade-in duration-200 font-sans">
          <div className="space-y-1">
            <span className="font-semibold text-foreground/80 block">AI Pattern Summary</span>
            <Description className="leading-relaxed font-normal">{result.summary}</Description>
          </div>
          {result.conclusions && result.conclusions.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="font-bold text-[9px] uppercase tracking-wider text-muted-foreground block">Key Findings:</span>
              <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                {result.conclusions.map((conclusion, idx) => (
                  <li key={idx}>{conclusion}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
