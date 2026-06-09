package elfsearch

import (
	"testing"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func TestPrepareSearchWithoutElfAppID(t *testing.T) {
	settings := domain.ElfProxySettings{
		BaseURL:           "http://localhost:9200",
		IndexPathTemplate: "app-logs-*",
	}
	query := domain.ElfQuery{
		IndexPathTemplate: "app-logs-*",
		SearchBody:        []byte(`{"query":{"match_all":{}},"size":0}`),
	}
	prepared, err := PrepareSearch(settings, nil, query, domain.Application{}, SearchContext{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if prepared.IndexPath != "app-logs-*" {
		t.Fatalf("unexpected index path: %s", prepared.IndexPath)
	}
	if prepared.SearchURL != "http://localhost:9200/app-logs-*/_search" {
		t.Fatalf("unexpected url: %s", prepared.SearchURL)
	}
	if prepared.Curl == "" {
		t.Fatal("expected curl output")
	}
}
