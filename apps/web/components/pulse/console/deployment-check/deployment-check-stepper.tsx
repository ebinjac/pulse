"use client"

import { AlertCircle, Check, Minus } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { WIZARD_STEPS, type WizardStep } from "./types"
import { stepperSubtitle } from "./deployment-check-wizard-models"

export type StepperStepState = "complete" | "active" | "pending" | "skipped" | "error"

function stepState(
  wizardStep: WizardStep,
  activeStep: WizardStep,
  logsSkipped: boolean,
  hasError: boolean,
): StepperStepState {
  if (hasError && wizardStep === activeStep) return "error"
  if (wizardStep === 3 && logsSkipped && activeStep >= 4) return "skipped"
  if (wizardStep < activeStep) return "complete"
  if (wizardStep === activeStep) return "active"
  return "pending"
}

const ICON_SIZE = 28

export function DeploymentCheckStepper({
  activeStep,
  onStepChange,
  monitorCount,
  elfQueryCount,
  logsSkipped,
  hasError = false,
}: {
  activeStep: WizardStep
  onStepChange: (step: WizardStep) => void
  monitorCount: number
  elfQueryCount: number
  logsSkipped: boolean
  hasError?: boolean
}) {
  const ctx = { monitorCount, elfQueryCount, logsSkipped, activeStep }

  return (
    <>
      <nav
        aria-label="Wizard steps"
        className="hidden lg:block lg:sticky lg:top-6 lg:self-start"
      >
        <ol>
          {WIZARD_STEPS.map((wizardStep, index) => {
            const state = stepState(wizardStep.step, activeStep, logsSkipped, hasError)
            const isClickable = state === "complete"
            const isLast = index === WIZARD_STEPS.length - 1
            const subtitle = stepperSubtitle(wizardStep.step, ctx)
            const connectorComplete = wizardStep.step < activeStep

            return (
              <li
                key={wizardStep.step}
                className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3"
              >
                {/* Icon track — connector is centered on the icon column */}
                <div className="relative flex justify-center">
                  <StepIcon state={state} step={wizardStep.step} />
                  {!isLast ? (
                    <span
                      className={cn(
                        "absolute left-1/2 w-px -translate-x-1/2",
                        connectorComplete ? "bg-success/50" : "bg-border",
                      )}
                      style={{ top: ICON_SIZE, bottom: 0 }}
                      aria-hidden
                    />
                  ) : null}
                </div>

                {/* Step label */}
                <div className={cn("min-w-0", isLast ? "pb-0" : "pb-5")}>
                  <button
                    type="button"
                    disabled={!isClickable}
                    onClick={() => {
                      if (isClickable) onStepChange(wizardStep.step)
                    }}
                    className={cn(
                      "w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                      state === "active" &&
                        "border border-primary/30 bg-primary/5 shadow-sm",
                      state === "complete" && "hover:bg-muted/40",
                      state === "pending" && "cursor-default opacity-60",
                      state === "skipped" && "cursor-default",
                      state === "error" && "border border-danger/30 bg-danger/5",
                      isClickable && "cursor-pointer",
                    )}
                  >
                    <span
                      className={cn(
                        "block text-sm font-semibold leading-snug",
                        state === "active"
                          ? "text-primary"
                          : state === "pending"
                            ? "text-muted-foreground"
                            : "text-foreground",
                      )}
                    >
                      {wizardStep.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                      {subtitle}
                    </span>
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="space-y-2 lg:hidden">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-foreground">
            Step {activeStep} of {WIZARD_STEPS.length} —{" "}
            {WIZARD_STEPS.find((s) => s.step === activeStep)?.title}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${(activeStep / WIZARD_STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </>
  )
}

function StepIcon({ state, step }: { state: StepperStepState; step: WizardStep }) {
  const base =
    "relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"

  if (state === "complete") {
    return (
      <span className={cn(base, "bg-success text-success-foreground shadow-sm")}>
        <Check className="size-3.5" strokeWidth={2.5} />
      </span>
    )
  }
  if (state === "skipped") {
    return (
      <span className={cn(base, "border border-border bg-muted text-muted-foreground")}>
        <Minus className="size-3.5" />
      </span>
    )
  }
  if (state === "error") {
    return (
      <span className={cn(base, "bg-danger text-danger-foreground")}>
        <AlertCircle className="size-3.5" />
      </span>
    )
  }
  if (state === "active") {
    return (
      <span
        className={cn(
          base,
          "border-2 border-primary bg-background text-primary shadow-sm ring-4 ring-primary/10",
        )}
      >
        {step}
      </span>
    )
  }
  return (
    <span className={cn(base, "border border-border bg-muted/50 text-muted-foreground")}>
      {step}
    </span>
  )
}

export function WizardCardProgress({ activeStep }: { activeStep: WizardStep }) {
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Step {activeStep} of {WIZARD_STEPS.length} —{" "}
          {WIZARD_STEPS.find((s) => s.step === activeStep)?.title}
        </span>
        <span>{Math.round((activeStep / WIZARD_STEPS.length) * 100)}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${(activeStep / WIZARD_STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  )
}
