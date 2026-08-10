package elfsearch

import (
	"net/http"
	"testing"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type stubSecrets map[string]string

func (s stubSecrets) GetRawSecretValue(alias string) (string, bool) {
	value, ok := s[alias]
	return value, ok
}

func TestResolveProxyAuthPrefersBearer(t *testing.T) {
	auth, err := ResolveProxyAuth(stubSecrets{
		elfProxyBearerSecret:        "token-123",
		elfProxyBasicPasswordSecret: "secret",
	}, domain.ElfProxySettings{BasicAuthUsername: "user"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if auth.Kind != "bearer" || auth.Bearer != "token-123" {
		t.Fatalf("auth = %+v", auth)
	}
}

func TestResolveProxyAuthBasic(t *testing.T) {
	auth, err := ResolveProxyAuth(stubSecrets{
		elfProxyBasicPasswordSecret: "secret",
	}, domain.ElfProxySettings{BasicAuthUsername: "user"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if auth.Kind != "basic" || auth.Username != "user" || auth.Password != "secret" {
		t.Fatalf("auth = %+v", auth)
	}
}

func TestApplyProxyAuthBasic(t *testing.T) {
	req, _ := http.NewRequest(http.MethodPost, "http://example.com", nil)
	ApplyProxyAuth(req, ProxyAuth{Kind: "basic", Username: "user", Password: "pass"})
	if got := req.Header.Get("Authorization"); got != "Basic dXNlcjpwYXNz" {
		t.Fatalf("authorization = %q", got)
	}
}
