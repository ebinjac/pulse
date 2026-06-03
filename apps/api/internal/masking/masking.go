package masking

import "strings"

const Mask = "********"

var sensitiveFragments = []string{
	"password",
	"secret",
	"client_secret",
	"api_key",
	"apikey",
	"token",
	"access_token",
	"refresh_token",
	"authorization",
	"private_key",
	"jwt",
	"signature",
	"assertion",
}

func IsSensitiveKey(key string) bool {
	normalized := strings.ToLower(strings.ReplaceAll(key, "-", "_"))
	for _, fragment := range sensitiveFragments {
		if strings.Contains(normalized, fragment) {
			return true
		}
	}

	return false
}

func ValueForKey(key string, value string) string {
	if IsSensitiveKey(key) {
		return Mask
	}

	return value
}

func Map(values map[string]string) map[string]string {
	masked := make(map[string]string, len(values))
	for key, value := range values {
		masked[key] = ValueForKey(key, value)
	}

	return masked
}

func ContainsRawSecret(value string, secrets map[string]string) bool {
	for _, secret := range secrets {
		if secret == "" || secret == Mask {
			continue
		}
		if strings.Contains(value, secret) {
			return true
		}
	}

	return false
}
