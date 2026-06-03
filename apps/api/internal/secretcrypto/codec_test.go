package secretcrypto

import (
	"strings"
	"testing"
)

func TestCodecEncryptsAndDecrypts(t *testing.T) {
	codec := NewDevCodec()

	ciphertext, err := codec.Encrypt("super-secret", "alias:test")
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if !strings.HasPrefix(ciphertext, ciphertextPrefix) {
		t.Fatalf("ciphertext prefix = %q", ciphertext)
	}
	if strings.Contains(ciphertext, "super-secret") {
		t.Fatalf("ciphertext leaked plaintext: %s", ciphertext)
	}

	plaintext, err := codec.Decrypt(ciphertext, "alias:test")
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if plaintext != "super-secret" {
		t.Fatalf("plaintext = %q", plaintext)
	}
}

func TestCodecRejectsWrongAssociatedData(t *testing.T) {
	codec := NewDevCodec()
	ciphertext, err := codec.Encrypt("super-secret", "alias:test")
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}

	if _, err := codec.Decrypt(ciphertext, "alias:other"); err == nil {
		t.Fatal("expected decrypt to fail for wrong associated data")
	}
}
