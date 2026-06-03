package variables

import (
	"testing"
	"time"
)

func TestResolveTemplate(t *testing.T) {
	resolver := Resolver{
		Variables: map[string]string{"baseUrl": "https://api.example.com"},
		Secrets:   map[string]string{"token": "secret-token"},
		Steps:     map[string]map[string]string{"Get Token": {"accessToken": "step-token"}},
		Now:       time.Unix(1000, 0).UTC(),
		UUID:      "fixed-uuid",
	}

	got, err := resolver.Resolve("{{variables.baseUrl}}/{{steps.Get Token.output.accessToken}}/{{random.uuid}}/{{timestamp.epochSeconds}}/{{secrets.token}}")
	if err != nil {
		t.Fatalf("Resolve returned error: %v", err)
	}

	want := "https://api.example.com/step-token/fixed-uuid/1000/secret-token"
	if got != want {
		t.Fatalf("Resolve = %q, want %q", got, want)
	}
}

func TestResolveTemplateMissingValue(t *testing.T) {
	_, err := (Resolver{}).Resolve("{{variables.missing}}")
	if err == nil {
		t.Fatal("expected missing variable error")
	}
}
