package executor

import (
	"strings"
	"testing"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/masking"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

func TestRunFailsOnAssertionMismatchAndMasksSensitiveAssertion(t *testing.T) {
	store := store.NewMemoryStore()
	executor := NewMockExecutor(store)
	monitor, ok := store.GetMonitor("mon-protected-api")
	if !ok {
		t.Fatal("seed monitor missing")
	}

	run := executor.Run(monitor)
	if run.Status != domain.StatusFailed {
		t.Fatalf("run status = %s, want %s", run.Status, domain.StatusFailed)
	}
	if run.FailureCategory != domain.FailureAssertion {
		t.Fatalf("failure category = %s, want %s", run.FailureCategory, domain.FailureAssertion)
	}
	if len(run.Steps) != 3 {
		t.Fatalf("steps = %d, want 3", len(run.Steps))
	}

	tokenStep := run.Steps[1]
	if tokenStep.Assertions[1].Actual != masking.Mask {
		t.Fatalf("sensitive assertion actual = %q, want mask", tokenStep.Assertions[1].Actual)
	}
	if !strings.Contains(tokenStep.RequestSummary, "https://auth.example.com/oauth/token") {
		t.Fatalf("request summary did not resolve variable: %s", tokenStep.RequestSummary)
	}
}

func TestRunStopsAfterFailedRequiredStep(t *testing.T) {
	store := store.NewMemoryStore()
	executor := NewMockExecutor(store)
	monitor, _ := store.GetMonitor("mon-protected-api")
	monitor.Steps[1].Assertions[0].Actual = "500"
	monitor.Steps[1].ContinueOnFailure = false

	run := executor.Run(monitor)
	if len(run.Steps) != 2 {
		t.Fatalf("steps = %d, want stop after failed required step", len(run.Steps))
	}
}

func TestRunStepIDsAreUniqueAcrossRuns(t *testing.T) {
	store := store.NewMemoryStore()
	executor := NewMockExecutor(store)
	monitor, _ := store.GetMonitor("mon-protected-api")

	first := executor.Run(monitor)
	second := executor.Run(monitor)
	if first.ID == second.ID {
		t.Fatalf("run IDs should be unique, got %q", first.ID)
	}
	if first.Steps[0].ID == second.Steps[0].ID {
		t.Fatalf("step run IDs should be unique across runs, got %q", first.Steps[0].ID)
	}
	if !strings.Contains(first.Steps[0].ID, first.ID) {
		t.Fatalf("step run ID %q should include parent run ID %q", first.Steps[0].ID, first.ID)
	}
}
