"use client"

import { useState } from "react"
import { Brain, Lightbulb, RotateCw } from "lucide-react"
import { Button, Chip, Description, Drawer, EmptyState } from "@workspace/ui/components/ui"
import type { ElfSuggestedCheck } from "@/lib/pulse-types"
import { displayAIValue } from "./elf-workbench-copilot-panels"

export function ElfSuggestedChecksDrawer({
  suggestions,
  onUse,
  onGenerateAI,
  aiBusy,
}: {
  suggestions: ElfSuggestedCheck[]
  onUse: (suggestion: ElfSuggestedCheck) => void
  onGenerateAI: () => void
  aiBusy: boolean
}) {
  const [open, setOpen] = useState(false)

  function handleUse(suggestion: ElfSuggestedCheck) {
    onUse(suggestion)
    setOpen(false)
  }

  return (
    <>
      <Button variant="secondary" className="gap-2" onPress={() => setOpen(true)}>
        <Lightbulb className="size-4" />
        Suggested checks{suggestions.length ? ` (${suggestions.length})` : ""}
      </Button>

      <Drawer isOpen={open} onOpenChange={setOpen}>
        <Drawer.Backdrop>
          <Drawer.Content placement="right" className="w-[min(24rem,92vw)] max-w-md">
            <Drawer.Dialog>
              <Drawer.CloseTrigger />
              <Drawer.Header>
                <Drawer.Heading>Suggested checks</Drawer.Heading>
                <Description>Generated from the current probe response. Select one to load it into the builder.</Description>
              </Drawer.Header>
              <Drawer.Body className="space-y-3">
                {suggestions.length === 0 ? (
                  <EmptyState className="flex min-h-40 flex-col items-center justify-center gap-2 border border-dashed bg-muted/5 p-6 text-center">
                    <p className="text-sm font-semibold">No suggestions yet</p>
                    <Description className="text-xs">Run a probe on the Explore tab to generate SRE-ready checks.</Description>
                  </EmptyState>
                ) : (
                  suggestions.map((suggestion) => (
                    <Button
                      key={suggestion.id}
                      variant="secondary"
                      className="h-auto w-full flex-col items-start gap-2 rounded-lg border p-3 text-left"
                      onPress={() => handleUse(suggestion)}
                    >
                      <div className="flex w-full items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-semibold">
                            {displayAIValue(suggestion.label)}
                            {suggestion.source === "ai" ? (
                              <Chip size="sm" variant="secondary">
                                <Chip.Label>AI</Chip.Label>
                              </Chip>
                            ) : null}
                          </div>
                          <Description className="mt-1 text-xs">{displayAIValue(suggestion.description)}</Description>
                          {suggestion.explanation ? (
                            <Description className="mt-2 text-xs">{displayAIValue(suggestion.explanation)}</Description>
                          ) : null}
                        </div>
                        <Chip size="sm" variant="secondary">
                          <Chip.Label>{displayAIValue(suggestion.matchCount)} hits</Chip.Label>
                        </Chip>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Chip size="sm" variant="secondary">
                          <Chip.Label>{displayAIValue(suggestion.gateMode)}</Chip.Label>
                        </Chip>
                        <Chip size="sm" variant="secondary">
                          <Chip.Label>{displayAIValue(suggestion.severity || "signal")}</Chip.Label>
                        </Chip>
                      </div>
                    </Button>
                  ))
                )}
              </Drawer.Body>
              <Drawer.Footer>
                <Button variant="secondary" className="w-full gap-2" onPress={onGenerateAI} isDisabled={aiBusy}>
                  {aiBusy ? <RotateCw className="size-4 animate-spin" /> : <Brain className="size-4" />}
                  Generate with AI
                </Button>
              </Drawer.Footer>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </>
  )
}
