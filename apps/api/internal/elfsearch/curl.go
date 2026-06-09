package elfsearch

import (
	"fmt"
	"strings"
)

func BuildEquivalentCurl(searchURL, bearerToken string, body []byte) string {
	token := strings.TrimSpace(bearerToken)
	if token == "" {
		token = "<bearer-token>"
	} else {
		token = "***"
	}
	bodyText := strings.TrimSpace(string(body))
	if bodyText == "" {
		bodyText = "{}"
	}
	return fmt.Sprintf(
		"curl -X POST '%s' \\\n  -H 'Authorization: Bearer %s' \\\n  -H 'Content-Type: application/json' \\\n  -d '%s'",
		searchURL,
		token,
		escapeSingleQuotes(bodyText),
	)
}

func escapeSingleQuotes(value string) string {
	return strings.ReplaceAll(value, "'", `'\''`)
}
