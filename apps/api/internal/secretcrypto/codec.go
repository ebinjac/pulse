package secretcrypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
)

const ciphertextPrefix = "v1:"

type Codec struct {
	aead cipher.AEAD
}

func NewCodec(keyMaterial string) (*Codec, error) {
	key, err := parseKey(keyMaterial)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	return &Codec{aead: aead}, nil
}

func NewDevCodec() *Codec {
	sum := sha256.Sum256([]byte("ensemble-pulse-local-dev-secret-key"))
	codec, err := NewCodec(base64.StdEncoding.EncodeToString(sum[:]))
	if err != nil {
		panic(err)
	}

	return codec
}

func (c *Codec) Encrypt(plaintext string, associatedData string) (string, error) {
	if plaintext == "" {
		return "", errors.New("secret value cannot be empty")
	}

	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	sealed := c.aead.Seal(nonce, nonce, []byte(plaintext), []byte(associatedData))
	return ciphertextPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

func (c *Codec) Decrypt(ciphertext string, associatedData string) (string, error) {
	if !strings.HasPrefix(ciphertext, ciphertextPrefix) {
		return "", errors.New("unsupported secret ciphertext format")
	}

	payload, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(ciphertext, ciphertextPrefix))
	if err != nil {
		return "", err
	}
	if len(payload) < c.aead.NonceSize() {
		return "", errors.New("secret ciphertext is too short")
	}

	nonce := payload[:c.aead.NonceSize()]
	encrypted := payload[c.aead.NonceSize():]
	plaintext, err := c.aead.Open(nil, nonce, encrypted, []byte(associatedData))
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}

func parseKey(keyMaterial string) ([]byte, error) {
	trimmed := strings.TrimSpace(keyMaterial)
	if trimmed == "" {
		return nil, errors.New("missing secret encryption key")
	}

	if decoded, err := base64.StdEncoding.DecodeString(trimmed); err == nil && len(decoded) == 32 {
		return decoded, nil
	}
	if decoded, err := hex.DecodeString(trimmed); err == nil && len(decoded) == 32 {
		return decoded, nil
	}
	if len(trimmed) == 32 {
		return []byte(trimmed), nil
	}

	return nil, fmt.Errorf("secret encryption key must be 32 bytes as base64, hex, or raw text")
}
