package certs

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"testing"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func TestKeyPairFromPEM_unencrypted(t *testing.T) {
	certPEM, keyPEM := generateTestPEMPair(t, "")
	_, err := KeyPairFromPEM(certPEM, keyPEM, "")
	if err != nil {
		t.Fatalf("KeyPairFromPEM: %v", err)
	}
}

func TestValidateProfileSecrets_pem(t *testing.T) {
	certPEM, keyPEM := generateTestPEMPair(t, "")
	profile := domain.CertificateProfile{
		CertType:        "pem",
		CertSecretAlias: "cert",
		KeySecretAlias:  "key",
	}
	lookup := func(alias string) (string, bool) {
		switch alias {
		case "cert":
			return string(certPEM), true
		case "key":
			return string(keyPEM), true
		default:
			return "", false
		}
	}
	if err := ValidateProfileSecrets(profile, lookup); err != nil {
		t.Fatalf("ValidateProfileSecrets: %v", err)
	}
}

func generateTestPEMPair(t *testing.T, _ string) ([]byte, []byte) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "test.local"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
	}
	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	return certPEM, keyPEM
}
