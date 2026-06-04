package executor

import (
	"testing"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func TestEvaluateSyntheticAssertionsCertExpiry(t *testing.T) {
	assertions := []domain.Assertion{{
		Type:     "certExpiryDays",
		Operator: "greaterThan",
		Expected: "30",
	}}
	failed, _ := evaluateSyntheticAssertions(assertions, map[string]string{"certExpiryDays": "10"}, 0)
	if !failed {
		t.Fatalf("expected cert expiry assertion to fail")
	}
}

func TestExecuteDelayStep(t *testing.T) {
	result := executeDelayStep(domain.MonitorStep{
		Config: map[string]any{"delayMs": 1},
	})
	if result.status != domain.StatusSuccess || result.latencyMS < 1 {
		t.Fatalf("unexpected delay result: %+v", result)
	}
}
