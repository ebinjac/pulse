package elfsearch

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type PreparedSearch struct {
	SearchURL string
	Body      []byte
	Curl      string
	ElfAppID  string
	IndexPath string
}

func PrepareSearch(
	settings domain.ElfProxySettings,
	secrets SecretReader,
	query domain.ElfQuery,
	application domain.Application,
	searchCtx SearchContext,
	service *domain.ApplicationService,
) (PreparedSearch, error) {
	elfAppID := strings.TrimSpace(searchCtx.ElfAppID)
	if elfAppID == "" {
		elfAppID = ResolveElfAppIDForService(query, application, service)
	}

	template := ResolveIndexTemplate(query, application, settings, service)
	indexPath, err := ResolveIndexPath(template, elfAppID)
	if err != nil {
		return PreparedSearch{}, err
	}

	searchURL, err := BuildSearchURL(settings, indexPath)
	if err != nil {
		return PreparedSearch{}, err
	}

	body := query.SearchBody
	if len(body) == 0 {
		body = []byte(`{"query":{"match_all":{}},"size":0}`)
	}

	curl := ""
	if auth, err := ResolveProxyAuth(secrets, settings); err == nil {
		curl = BuildEquivalentCurlWithAuth(searchURL, auth, body)
	} else {
		curl = BuildEquivalentCurlWithAuth(searchURL, ProxyAuth{Kind: "bearer"}, body)
	}

	return PreparedSearch{
		SearchURL: searchURL,
		Body:      body,
		Curl:      curl,
		ElfAppID:  elfAppID,
		IndexPath: indexPath,
	}, nil
}

func MergeProxySettings(base domain.ElfProxySettings, baseURL string, pretty *bool) (domain.ElfProxySettings, error) {
	merged := base
	if strings.TrimSpace(baseURL) != "" {
		merged.BaseURL = strings.TrimSpace(baseURL)
	}
	if pretty != nil {
		merged.Pretty = *pretty
	}
	if strings.TrimSpace(merged.BaseURL) == "" {
		return merged, fmt.Errorf("elf proxy base URL is not configured")
	}
	normalized, err := NormalizeBaseURL(merged.BaseURL)
	if err != nil {
		return merged, err
	}
	merged.BaseURL = normalized
	return merged, nil
}

// NormalizeBaseURL rejects bind-only hosts like 0.0.0.0 that cannot be used as outbound HTTP targets.
func NormalizeBaseURL(baseURL string) (string, error) {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		return "", fmt.Errorf("elf proxy base URL is not configured")
	}
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("invalid elf proxy base URL: %w", err)
	}
	host := strings.TrimSpace(parsed.Hostname())
	switch host {
	case "0.0.0.0", "[::]":
		return "", fmt.Errorf(
			"base URL host %q is a bind address, not a reachable host; use http://host.docker.internal:9200 when the API runs in Docker and OpenSearch is on your machine, or http://127.0.0.1:9200 when the API runs locally",
			host,
		)
	}
	return strings.TrimRight(baseURL, "/"), nil
}
