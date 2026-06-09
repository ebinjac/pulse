package elfsearch

import (
	"encoding/json"
	"testing"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func TestCompileRulesToQueryContainsAndGte(t *testing.T) {
	body, err := CompileRulesToQuery(domain.ElfCheckConfig{
		Logic: "all",
		Rules: []domain.ElfCheckRule{
			{Field: "message", Operator: "contains", Value: "BatchSummary"},
			{Field: "responseTimeMs", Operator: "gte", Value: "500"},
		},
	}, "@timestamp", "2026-06-06T07:49:30.000Z", "2026-06-06T07:50:00.000Z")
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	query := parsed["query"].(map[string]any)
	boolNode := query["bool"].(map[string]any)
	must := boolNode["must"].([]any)
	if len(must) < 2 {
		t.Fatalf("expected must clauses, got %#v", must)
	}
}

func TestCompileRulesToQueryAllowsTotalHitsOnlyCheck(t *testing.T) {
	body, err := CompileRulesToQuery(domain.ElfCheckConfig{
		Mode:          "expression",
		PassWhen:      "hit_count_lte",
		PassThreshold: 100,
		Rules:         nil,
	}, "@timestamp", "2026-06-06T07:49:30.000Z", "2026-06-06T07:50:00.000Z")
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if parsed["size"] != float64(0) {
		t.Fatalf("expected size 0, got %#v", parsed["size"])
	}
	if parsed["track_total_hits"] != true {
		t.Fatalf("expected track_total_hits true, got %#v", parsed["track_total_hits"])
	}
	query := parsed["query"].(map[string]any)
	boolNode := query["bool"].(map[string]any)
	filter := boolNode["filter"].([]any)
	if len(filter) == 0 {
		t.Fatalf("expected time range filter, got %#v", boolNode)
	}
}

func TestIsTotalHitsExpression(t *testing.T) {
	if !IsTotalHitsExpression(domain.ElfCheckConfig{PassWhen: "hit_count_lte", Rules: nil}) {
		t.Fatal("expected total hits expression")
	}
	if IsTotalHitsExpression(domain.ElfCheckConfig{PassWhen: "no_matching_hits", Rules: nil}) {
		t.Fatal("expected field-rule expression")
	}
}

func TestEvaluateExpressionPassModes(t *testing.T) {
	result, _ := EvaluateExpressionPass(domain.ElfCheckConfig{PassWhen: "no_matching_hits"}, 0)
	if result != "pass" {
		t.Fatalf("expected pass for zero hits, got %s", result)
	}
	result, _ = EvaluateExpressionPass(domain.ElfCheckConfig{PassWhen: "has_matching_hits"}, 1)
	if result != "pass" {
		t.Fatalf("expected pass for matching hit, got %s", result)
	}
	result, _ = EvaluateExpressionPass(domain.ElfCheckConfig{PassWhen: "hit_count_eq", PassThreshold: 80}, 80)
	if result != "pass" {
		t.Fatalf("expected pass for exact total hits, got %s", result)
	}
	result, _ = EvaluateExpressionPass(domain.ElfCheckConfig{PassWhen: "hit_count_gt", PassThreshold: 0}, 1)
	if result != "pass" {
		t.Fatalf("expected pass for total hits greater than threshold, got %s", result)
	}
	result, _ = EvaluateExpressionPass(domain.ElfCheckConfig{PassWhen: "hit_count_lt", PassThreshold: 10}, 9)
	if result != "pass" {
		t.Fatalf("expected pass for total hits less than threshold, got %s", result)
	}
}

func TestOperatorsForType(t *testing.T) {
	if len(OperatorsForType("number")) == 0 {
		t.Fatal("expected number operators")
	}
}
