package elfsearch

import (
	"testing"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func TestEvaluatePassCriteriaMaxHits(t *testing.T) {
	response := SearchResponse{}
	response.Hits.Total.Value = 0
	result, reason := EvaluatePassCriteria(domain.ElfPassCriteria{Type: "max_hits", Threshold: 0}, response)
	if result != "pass" || reason != "" {
		t.Fatalf("expected pass, got %s (%s)", result, reason)
	}

	response.Hits.Total.Value = 3
	result, _ = EvaluatePassCriteria(domain.ElfPassCriteria{Type: "max_hits", Threshold: 0}, response)
	if result != "fail" {
		t.Fatalf("expected fail, got %s", result)
	}
}

func TestEvaluatePassCriteriaTotalHitsValue(t *testing.T) {
	response := SearchResponse{}
	response.Hits.Total.Value = 80

	result, reason := EvaluatePassCriteria(domain.ElfPassCriteria{Type: "total_hits", Operator: "eq", Threshold: 80}, response)
	if result != "pass" || reason != "" {
		t.Fatalf("expected pass for hits.total.value eq 80, got %s (%s)", result, reason)
	}

	result, reason = EvaluatePassCriteria(domain.ElfPassCriteria{Type: "hits.total.value", Operator: "lt", Threshold: 50}, response)
	if result != "fail" || reason == "" {
		t.Fatalf("expected fail for hits.total.value lt 50, got %s (%s)", result, reason)
	}
}

func TestGateResultAdvisory(t *testing.T) {
	if GateResult("advisory", "fail") != "warning" {
		t.Fatal("expected warning for advisory gate")
	}
	if GateResult("blocking", "fail") != "fail" {
		t.Fatal("expected fail for blocking gate")
	}
}

func TestResolveIndexPath(t *testing.T) {
	path, err := ResolveIndexPath("app-logs-*", "")
	if err != nil {
		t.Fatal(err)
	}
	if path != "app-logs-*" {
		t.Fatalf("unexpected path: %s", path)
	}

	path, err = ResolveIndexPath("*:elf-{{elfAppId}}-*", "200003773")
	if err != nil {
		t.Fatal(err)
	}
	if path != "*:elf-200003773-*" {
		t.Fatalf("unexpected path: %s", path)
	}
}

func TestBuildSearchURL(t *testing.T) {
	url, err := BuildSearchURL(domain.ElfProxySettings{
		BaseURL: "https://elfproxy-dev.aexp.com",
		Pretty:  true,
	}, "*:elf-200003773-*")
	if err != nil {
		t.Fatal(err)
	}
	if url != "https://elfproxy-dev.aexp.com/*:elf-200003773-*/_search?pretty" {
		t.Fatalf("unexpected url: %s", url)
	}
}
