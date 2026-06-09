package executor

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/variables"
)

func configMap(config map[string]any, key string) map[string]any {
	if config == nil {
		return nil
	}
	switch typed := config[key].(type) {
	case map[string]any:
		return typed
	case map[string]string:
		out := make(map[string]any, len(typed))
		for k, v := range typed {
			out[k] = v
		}
		return out
	default:
		return nil
	}
}

func jwtBearerToken(authMap map[string]any, resolver variables.Resolver) (string, error) {
	algorithm := strings.ToUpper(stringFromAny(authMap["algorithm"]))
	if algorithm == "" {
		algorithm = "HS256"
	}
	if algorithm != "HS256" && algorithm != "HS384" && algorithm != "HS512" {
		return "", fmt.Errorf("JWT bearer currently supports HS256, HS384, and HS512")
	}

	payloadRaw, err := resolveConfigString(authMap["payload"], resolver)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(payloadRaw) == "" {
		payloadRaw = "{}"
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(payloadRaw), &payload); err != nil {
		return "", fmt.Errorf("invalid JWT payload JSON: %w", err)
	}
	now := time.Now().Unix()
	if _, ok := payload["iat"]; !ok {
		payload["iat"] = now
	}
	if _, ok := payload["exp"]; !ok {
		payload["exp"] = now + 300
	}

	headers := map[string]any{"typ": "JWT", "alg": algorithm}
	if headersRaw, err := resolveConfigString(authMap["headers"], resolver); err != nil {
		return "", err
	} else if strings.TrimSpace(headersRaw) != "" {
		var custom map[string]any
		if err := json.Unmarshal([]byte(headersRaw), &custom); err != nil {
			return "", fmt.Errorf("invalid JWT headers JSON: %w", err)
		}
		for key, value := range custom {
			headers[key] = value
		}
		headers["alg"] = algorithm
	}

	secret, err := resolveConfigString(authMap["secret"], resolver)
	if err != nil {
		return "", err
	}
	if secret == "" {
		return "", fmt.Errorf("JWT secret is required")
	}
	secretBytes := []byte(secret)
	if boolFromAny(authMap["secretBase64Encoded"]) {
		decoded, err := base64.StdEncoding.DecodeString(secret)
		if err != nil {
			return "", fmt.Errorf("decode base64 JWT secret: %w", err)
		}
		secretBytes = decoded
	}

	headerBytes, _ := json.Marshal(headers)
	payloadBytes, _ := json.Marshal(payload)
	signingInput := base64.RawURLEncoding.EncodeToString(headerBytes) + "." + base64.RawURLEncoding.EncodeToString(payloadBytes)

	var signature []byte
	switch algorithm {
	case "HS384":
		mac := hmac.New(sha512.New384, secretBytes)
		_, _ = mac.Write([]byte(signingInput))
		signature = mac.Sum(nil)
	case "HS512":
		mac := hmac.New(sha512.New, secretBytes)
		_, _ = mac.Write([]byte(signingInput))
		signature = mac.Sum(nil)
	default:
		mac := hmac.New(sha256.New, secretBytes)
		_, _ = mac.Write([]byte(signingInput))
		signature = mac.Sum(nil)
	}

	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func resolveConfigString(value any, resolver variables.Resolver) (string, error) {
	resolved, err := resolver.Resolve(stringFromAny(value))
	if err != nil {
		return "", err
	}
	return resolved, nil
}

func stringFromAny(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	case nil:
		return ""
	default:
		return fmt.Sprint(typed)
	}
}

func boolFromAny(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		return typed == "true"
	default:
		return false
	}
}
