package elfsearch

import (
	"encoding/json"
	"testing"
)

func TestInjectTimeRangeReplacesExisting(t *testing.T) {
	body := []byte(`{
		"query": {
			"bool": {
				"filter": [{
					"range": {
						"timestamp": { "gte": "now-15m", "lte": "now" }
					}
				}]
			}
		}
	}`)
	out, injected, err := InjectTimeRange(body, "timestamp", "2026-06-06T07:49:30.000Z", "2026-06-06T07:50:00.000Z")
	if err != nil {
		t.Fatalf("inject: %v", err)
	}
	if injected.Gte != "2026-06-06T07:49:30.000Z" {
		t.Fatalf("unexpected injected gte: %s", injected.Gte)
	}
	var parsed map[string]any
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	query := parsed["query"].(map[string]any)
	boolNode := query["bool"].(map[string]any)
	filter := boolNode["filter"].([]any)
	rangeNode := filter[0].(map[string]any)["range"].(map[string]any)
	ts := rangeNode["timestamp"].(map[string]any)
	if ts["gte"] != "2026-06-06T07:49:30.000Z" || ts["lte"] != "2026-06-06T07:50:00.000Z" {
		t.Fatalf("range not replaced: %#v", ts)
	}
}

func TestInjectTimeRangeAppendsWhenMissing(t *testing.T) {
	body := []byte(`{"query":{"match_all":{}}}`)
	out, _, err := InjectTimeRange(body, "@timestamp", "2026-06-06T07:49:30.000Z", "2026-06-06T07:50:00.000Z")
	if err != nil {
		t.Fatalf("inject: %v", err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	query := parsed["query"].(map[string]any)
	boolNode := query["bool"].(map[string]any)
	filter := boolNode["filter"].([]any)
	if len(filter) != 1 {
		t.Fatalf("expected appended filter, got %#v", filter)
	}
}

func TestInjectTimeRangeRequiresBounds(t *testing.T) {
	_, _, err := InjectTimeRange([]byte(`{}`), "@timestamp", "", "2026-06-06T07:50:00.000Z")
	if err == nil {
		t.Fatal("expected error for missing gte")
	}
}
