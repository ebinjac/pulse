package store

import (
	"testing"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func TestMergeElfResultsBlockingFail(t *testing.T) {
	report := domain.DeploymentValidationReport{Status: "pass", Regressions: []string{}}
	results := []domain.ElfQueryRunResult{{
		QueryID: "q1",
		Result:  "fail",
		GateMode: "blocking",
		Reason:  "hit count exceeded",
	}}
	queries := map[string]domain.ElfQuery{"q1": {ID: "q1", Name: "Error spike", GateMode: "blocking"}}
	merged := MergeElfResultsIntoReport(report, results, queries)
	if merged.Status != "fail" {
		t.Fatalf("expected fail, got %s", merged.Status)
	}
	if merged.ElfSummary.BlockingFails != 1 {
		t.Fatalf("expected 1 blocking fail")
	}
}

func TestMergeElfResultsAdvisoryWarning(t *testing.T) {
	report := domain.DeploymentValidationReport{Status: "pass", Regressions: []string{}}
	results := []domain.ElfQueryRunResult{{
		QueryID: "q1",
		Result:  "warning",
		GateMode: "advisory",
	}}
	queries := map[string]domain.ElfQuery{"q1": {ID: "q1", Name: "Smoke", GateMode: "advisory"}}
	merged := MergeElfResultsIntoReport(report, results, queries)
	if merged.Status != "warning" {
		t.Fatalf("expected warning, got %s", merged.Status)
	}
}
