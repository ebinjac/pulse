package elfanalytics

import (
	"encoding/json"
	"testing"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func TestEvaluateComparativeDeltaPctFail(t *testing.T) {
	post := ParsedResponse{
		Aggregations: map[string]json.RawMessage{
			"error_count": json.RawMessage(`{"value":30}`),
		},
	}
	baseline := ParsedResponse{
		Aggregations: map[string]json.RawMessage{
			"error_count": json.RawMessage(`{"value":10}`),
		},
	}
	query := domain.ElfQuery{
		SignalType: SignalErrorSpike,
		PassCriteria: domain.ElfPassCriteria{
			Type:      "delta_pct",
			Threshold: 50,
			Name:      "error_count",
		},
	}
	result, reason, metrics := EvaluateComparative(query, post, baseline)
	if result != "fail" {
		t.Fatalf("expected fail, got %s (%s)", result, reason)
	}
	if metrics.DeltaPct != 200 {
		t.Fatalf("expected 200%% delta, got %v", metrics.DeltaPct)
	}
}

func TestEvaluateComparativeNewTerms(t *testing.T) {
	post := ParsedResponse{
		Aggregations: map[string]json.RawMessage{
			"by_exception": json.RawMessage(`{"buckets":[{"key":"NullPointerException","doc_count":2}]}`),
		},
	}
	baseline := ParsedResponse{Aggregations: map[string]json.RawMessage{
		"by_exception": json.RawMessage(`{"buckets":[{"key":"SocketTimeoutException","doc_count":1}]}`),
	}}
	query := domain.ElfQuery{
		SignalType: SignalNewExceptions,
		PassCriteria: domain.ElfPassCriteria{
			Type: "new_terms",
			Name: "by_exception",
		},
	}
	result, _, metrics := EvaluateComparative(query, post, baseline)
	if result != "fail" {
		t.Fatalf("expected fail for new exception term, got %s", result)
	}
	if len(metrics.NewTerms) != 1 {
		t.Fatalf("expected 1 new term, got %d", len(metrics.NewTerms))
	}
}
