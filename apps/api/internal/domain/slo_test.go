package domain

import "testing"

func TestErrorBudgetFromUptime(t *testing.T) {
	budget := ErrorBudgetFromUptime(99.9, 99.95)
	if budget.ErrorBudgetRemainingPct <= 0 {
		t.Fatalf("expected remaining budget when above target: %+v", budget)
	}
	if budget.ConsumedDowntimeMinutes >= budget.AllowedDowntimeMinutes {
		t.Fatalf("expected consumed < allowed when above target: %+v", budget)
	}
}
