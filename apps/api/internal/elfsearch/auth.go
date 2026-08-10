package elfsearch

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

const (
	elfProxyBearerSecret       = "elfProxyBearerToken"
	elfProxyBasicPasswordSecret = "elfProxyBasicAuthPassword"
)

type ProxyAuth struct {
	Kind     string
	Bearer   string
	Username string
	Password string
}

func ResolveProxyAuth(secrets SecretReader, settings domain.ElfProxySettings) (ProxyAuth, error) {
	if secrets != nil {
		if token, ok := secrets.GetRawSecretValue(elfProxyBearerSecret); ok && strings.TrimSpace(token) != "" {
			return ProxyAuth{Kind: "bearer", Bearer: strings.TrimSpace(token)}, nil
		}
	}

	username := strings.TrimSpace(settings.BasicAuthUsername)
	password := ""
	if secrets != nil {
		if value, ok := secrets.GetRawSecretValue(elfProxyBasicPasswordSecret); ok {
			password = strings.TrimSpace(value)
		}
	}
	if username != "" && password != "" {
		return ProxyAuth{Kind: "basic", Username: username, Password: password}, nil
	}
	if username != "" && password == "" {
		return ProxyAuth{}, fmt.Errorf("elf proxy basic auth password is not configured")
	}

	return ProxyAuth{}, fmt.Errorf("elf proxy authentication is not configured (set a bearer token or basic auth credentials)")
}

func ApplyProxyAuth(req *http.Request, auth ProxyAuth) {
	switch auth.Kind {
	case "bearer":
		req.Header.Set("Authorization", "Bearer "+auth.Bearer)
	case "basic":
		req.Header.Set(
			"Authorization",
			"Basic "+base64.StdEncoding.EncodeToString([]byte(auth.Username+":"+auth.Password)),
		)
	}
}

func BuildEquivalentCurlWithAuth(searchURL string, auth ProxyAuth, body []byte) string {
	bodyText := strings.TrimSpace(string(body))
	if bodyText == "" {
		bodyText = "{}"
	}

	switch auth.Kind {
	case "basic":
		return fmt.Sprintf(
			"curl -X POST '%s' \\\n  -u '%s:***' \\\n  -H 'Content-Type: application/json' \\\n  -d '%s'",
			searchURL,
			escapeSingleQuotes(auth.Username),
			escapeSingleQuotes(bodyText),
		)
	default:
		token := strings.TrimSpace(auth.Bearer)
		if token == "" {
			token = "<bearer-token>"
		} else {
			token = "***"
		}
		return fmt.Sprintf(
			"curl -X POST '%s' \\\n  -H 'Authorization: Bearer %s' \\\n  -H 'Content-Type: application/json' \\\n  -d '%s'",
			searchURL,
			token,
			escapeSingleQuotes(bodyText),
		)
	}
}

func RedactProxyAuth(message string, auth ProxyAuth) string {
	message = strings.ReplaceAll(message, auth.Bearer, "***")
	message = strings.ReplaceAll(message, auth.Password, "***")
	return message
}
