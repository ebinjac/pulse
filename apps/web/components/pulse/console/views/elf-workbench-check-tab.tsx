"use client"

import { useState } from "react"
import { ClipboardCheck, RotateCw, Save } from "lucide-react"
import { Button, Card, Description, EmptyState } from "@heroui/react"
import type { ElfCopilotResultExplanation, ElfFieldDescriptor, ElfQueryProbeResult, ElfQueryValidateCheckResult, ElfSuggestedCheck } from "@/lib/pulse-types"
import { ElfCheckDraftBuilder, type DraftCheck, hasCheckCondition, naturalLanguagePreview } from "./elf-check-draft-builder"
import { ElfCheckTestResultModal } from "./elf-check-test-result-modal"
import { ElfSuggestedChecksDrawer } from "./elf-suggested-checks-panel"
import { NaturalLanguageCheckInput } from "./elf-workbench-copilot-panels"

export function ElfWorkbenchCheckTab({
  probe,
  fields,
  draft,
  onDraftChange,
  onAddRule,
  previewBody,
  suggestions,
  onUseSuggestion,
  onGenerateAISuggestions,
  aiSuggestionsBusy,
  naturalLanguagePrompt,
  onNaturalLanguageChange,
  onNaturalLanguageGenerate,
  naturalLanguageBusy,
  validateResult,
  validating,
  onValidate,
  savingCheck,
  onSaveCheck,
  resultExplanation,
  onExplainResult,
  explainResultBusy,
}: {
  probe: ElfQueryProbeResult | null
  fields: ElfFieldDescriptor[]
  draft: DraftCheck
  onDraftChange: (draft: DraftCheck) => void
  onAddRule: () => void
  previewBody: Record<string, unknown> | null
  suggestions: ElfSuggestedCheck[]
  onUseSuggestion: (suggestion: ElfSuggestedCheck) => void
  onGenerateAISuggestions: () => void
  aiSuggestionsBusy: boolean
  naturalLanguagePrompt: string
  onNaturalLanguageChange: (value: string) => void
  onNaturalLanguageGenerate: () => void
  naturalLanguageBusy: boolean
  validateResult: ElfQueryValidateCheckResult | null
  validating: boolean
  onValidate: () => void
  savingCheck: boolean
  onSaveCheck: () => void
  resultExplanation: ElfCopilotResultExplanation | null
  onExplainResult: () => void
  explainResultBusy: boolean
}) {
  const [testModalOpen, setTestModalOpen] = useState(false)
  const hasProbe = !!probe && !probe.errorMessage

  function handleTestCheck() {
    setTestModalOpen(true)
    onValidate()
  }

  if (!hasProbe) {
    return (
      <EmptyState className="flex min-h-64 flex-col items-center justify-center gap-2 border border-dashed bg-muted/5 p-8 text-center">
        <p className="text-sm font-semibold">Probe logs first</p>
        <Description className="max-w-md text-sm">
          Open the Explore logs tab, run a probe, then return here to build a deployment check from discovered fields.
        </Description>
      </EmptyState>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Description className="text-sm">Build a deployment gate from discovered fields or suggested templates.</Description>
        <ElfSuggestedChecksDrawer
          suggestions={suggestions}
          onUse={onUseSuggestion}
          onGenerateAI={onGenerateAISuggestions}
          aiBusy={aiSuggestionsBusy}
        />
      </div>

      <NaturalLanguageCheckInput
        value={naturalLanguagePrompt}
        onChange={onNaturalLanguageChange}
        onGenerate={onNaturalLanguageGenerate}
        busy={naturalLanguageBusy}
      />

      <Card>
        <Card.Header>
          <Card.Title className="text-base font-semibold">Deployment check</Card.Title>
          <Description>{naturalLanguagePreview(draft)}</Description>
        </Card.Header>
        <Card.Content className="space-y-4 pt-0">
          <ElfCheckDraftBuilder fields={fields} draft={draft} onChange={onDraftChange} onAddRule={onAddRule} />

          {previewBody ? (
            <div className="space-y-2">
              <Description className="text-xs font-semibold">Compiled query preview</Description>
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted/10 p-3 font-mono text-[11px]">
                {JSON.stringify(previewBody, null, 2)}
              </pre>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="gap-2" onPress={handleTestCheck} isDisabled={validating || !hasCheckCondition(draft)}>
              {validating ? <RotateCw className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
              Test check
            </Button>
            <Button className="gap-2" onPress={onSaveCheck} isDisabled={savingCheck || !hasCheckCondition(draft)}>
              {savingCheck ? <RotateCw className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save check
            </Button>
            {validateResult ? (
              <Button variant="secondary" className="gap-2" onPress={() => setTestModalOpen(true)}>
                View last test
              </Button>
            ) : null}
          </div>
        </Card.Content>
      </Card>

      <ElfCheckTestResultModal
        isOpen={testModalOpen}
        onOpenChange={setTestModalOpen}
        validateResult={validateResult}
        validating={validating}
        onRetest={handleTestCheck}
        onExplainResult={onExplainResult}
        explainBusy={explainResultBusy}
        resultExplanation={resultExplanation}
      />
    </div>
  )
}
