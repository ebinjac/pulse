"use client"

import { Brain, ClipboardCheck, Gauge, RotateCw, Search, ShieldAlert } from "lucide-react"
import { Alert, Button, Description, Modal } from "@workspace/ui/components/ui"
import type { ElfCopilotResultExplanation, ElfQueryValidateCheckResult } from "@/lib/pulse-types"
import { Metric } from "@/components/pulse/console-shared"
import { displayAIValue } from "./elf-workbench-copilot-panels"

export function ElfCheckTestResultModal({
  isOpen,
  onOpenChange,
  validateResult,
  validating,
  onRetest,
  onExplainResult,
  explainBusy,
  resultExplanation,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  validateResult: ElfQueryValidateCheckResult | null
  validating: boolean
  onRetest: () => void
  onExplainResult: () => void
  explainBusy: boolean
  resultExplanation: ElfCopilotResultExplanation | null
}) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className="sm:max-w-2xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Test check result</Modal.Heading>
              <Description>Validation against the current probe time window.</Description>
            </Modal.Header>
            <Modal.Body className="space-y-4">
              {validating ? (
                <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <RotateCw className="size-4 animate-spin" />
                  Running check against ELF…
                </div>
              ) : validateResult ? (
                <>
                  <Alert
                    status={
                      validateResult.gateResult === "pass"
                        ? "success"
                        : validateResult.gateResult === "warning"
                          ? "warning"
                          : "danger"
                    }
                  >
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>
                        {validateResult.reason || `Check ${validateResult.criteriaResult || "completed"}.`}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Metric
                      label="Criteria"
                      value={validateResult.criteriaResult || "unknown"}
                      detail={validateResult.reason || "No failure reason"}
                      icon={ClipboardCheck}
                    />
                    <Metric label="Gate" value={validateResult.gateResult || "unknown"} detail="Deployment behavior" icon={ShieldAlert} />
                    <Metric label="Matches" value={`${validateResult.probe?.hitCount ?? 0}`} detail="Current window" icon={Search} />
                    <Metric label="Duration" value={`${validateResult.probe?.durationMs ?? 0}ms`} detail="ELF query time" icon={Gauge} />
                  </div>
                  {validateResult.compiledSearchBody ? (
                    <div>
                      <Description className="mb-2 text-xs font-semibold">Compiled OpenSearch body</Description>
                      <pre className="max-h-64 overflow-auto rounded-md border bg-muted/10 p-3 font-mono text-[11px]">
                        {JSON.stringify(validateResult.compiledSearchBody, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                  {resultExplanation ? (
                    <div className="space-y-2 rounded-lg border bg-muted/5 p-3">
                      <Description className="text-sm font-semibold">Copilot explanation</Description>
                      {resultExplanation.summary ? (
                        <Description className="text-sm">{displayAIValue(resultExplanation.summary)}</Description>
                      ) : null}
                      {resultExplanation.recommendation ? (
                        <Description className="text-sm">
                          <span className="font-medium">Recommendation: </span>
                          {displayAIValue(resultExplanation.recommendation)}
                        </Description>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <Description className="text-sm">No result yet. Run the test to validate this check.</Description>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="secondary"
                className="gap-2"
                onPress={onExplainResult}
                isDisabled={!validateResult || explainBusy || validating}
              >
                {explainBusy ? <RotateCw className="size-4 animate-spin" /> : <Brain className="size-4" />}
                Explain result
              </Button>
              <Button className="gap-2" onPress={onRetest} isDisabled={validating}>
                {validating ? <RotateCw className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
                Re-test
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
