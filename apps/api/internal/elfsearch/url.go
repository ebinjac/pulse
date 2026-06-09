package elfsearch

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

// ResolveIndexTemplate picks the first non-empty index pattern from query, service, application, then global settings.
func ResolveIndexTemplate(query domain.ElfQuery, application domain.Application, settings domain.ElfProxySettings, service *domain.ApplicationService) string {
	if template := strings.TrimSpace(query.IndexPathTemplate); template != "" {
		return template
	}
	if service != nil {
		if template := strings.TrimSpace(service.IndexPathTemplate); template != "" {
			return template
		}
	}
	if template := strings.TrimSpace(application.IndexPathTemplate); template != "" {
		return template
	}
	return strings.TrimSpace(settings.IndexPathTemplate)
}

// ResolveIndexPath resolves optional {{elfAppId}} placeholders. Literal patterns such as app-logs-* are returned as-is.
func ResolveIndexPath(template string, elfAppID string) (string, error) {
	template = strings.TrimSpace(template)
	if template == "" {
		return "", fmt.Errorf("index pattern is required")
	}
	if !strings.Contains(template, "{{elfAppId}}") {
		return template, nil
	}
	elfAppID = strings.TrimSpace(elfAppID)
	if elfAppID == "" {
		return "", fmt.Errorf("elfAppId is required to resolve index pattern %q", template)
	}
	resolved := strings.ReplaceAll(template, "{{elfAppId}}", elfAppID)
	if strings.Contains(resolved, "{{") {
		return "", fmt.Errorf("unresolved template placeholders in index pattern")
	}
	return resolved, nil
}

func BuildSearchURL(settings domain.ElfProxySettings, indexPath string) (string, error) {
	baseURL, err := NormalizeBaseURL(settings.BaseURL)
	if err != nil {
		return "", err
	}
	indexPath = strings.Trim(strings.TrimSpace(indexPath), "/")
	if indexPath == "" {
		return "", fmt.Errorf("index path is required")
	}

	escapedPath := url.PathEscape(indexPath)
	escapedPath = strings.ReplaceAll(escapedPath, "%2A", "*")
	searchURL := baseURL + "/" + escapedPath + "/_search"
	if settings.Pretty {
		searchURL += "?pretty"
	}
	return searchURL, nil
}

// ResolveElfAppID returns an optional ELF app ID used only when index patterns or search bodies reference {{elfAppId}}.
func ResolveElfAppID(query domain.ElfQuery, application domain.Application) string {
	if strings.TrimSpace(query.ElfAppID) != "" {
		return strings.TrimSpace(query.ElfAppID)
	}
	if strings.TrimSpace(application.ElfAppID) != "" {
		return strings.TrimSpace(application.ElfAppID)
	}
	return ""
}

func ResolveElfAppIDForService(query domain.ElfQuery, application domain.Application, service *domain.ApplicationService) string {
	if service != nil && strings.TrimSpace(service.ElfAppID) != "" {
		return strings.TrimSpace(service.ElfAppID)
	}
	return ResolveElfAppID(query, application)
}
