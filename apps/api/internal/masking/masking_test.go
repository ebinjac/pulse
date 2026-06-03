package masking

import "testing"

func TestValueForKeyMasksSensitiveKeys(t *testing.T) {
	tests := map[string]string{
		"Authorization": "Bearer secret",
		"client_secret": "value",
		"private-key":   "value",
		"accessToken":   "value",
	}

	for key, value := range tests {
		if got := ValueForKey(key, value); got != Mask {
			t.Fatalf("ValueForKey(%q) = %q, want mask", key, got)
		}
	}
}

func TestContainsRawSecret(t *testing.T) {
	if !ContainsRawSecret("Bearer abc123", map[string]string{"token": "abc123"}) {
		t.Fatal("expected raw secret to be detected")
	}
	if ContainsRawSecret("Bearer ********", map[string]string{"token": "abc123"}) {
		t.Fatal("masked value should not count as raw secret")
	}
}
