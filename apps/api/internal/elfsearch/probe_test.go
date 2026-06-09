package elfsearch

import (
	"encoding/json"
	"testing"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func TestResolveProbeBodyUsesSavedSearchBodyNotGeneratedCheck(t *testing.T) {
	saved := json.RawMessage(`{"query":{"bool":{"filter":[{"match_phrase":{"service":"sample-web-app"}}]}}}`)
	generated := json.RawMessage(`{"aggs":{"by_facet":{"terms":{"field":"exceptionType.keyword"}}},"size":0}`)

	query := domain.ElfQuery{
		SearchBody:          saved,
		GeneratedSearchBody: generated,
		CheckKind:           "new_terms",
	}

	body := resolveProbeBody(query, []byte(`{"query":{"match_all":{}}}`), nil)
	if string(body) != string(saved) {
		t.Fatalf("expected saved search body, got %s", body)
	}
}

func TestResolveProbeBodyPrefersOverride(t *testing.T) {
	saved := json.RawMessage(`{"query":{"match_all":{}}}`)
	override := json.RawMessage(`{"size":0}`)

	query := domain.ElfQuery{SearchBody: saved}
	body := resolveProbeBody(query, saved, override)
	if string(body) != string(override) {
		t.Fatalf("expected override body, got %s", body)
	}
}
