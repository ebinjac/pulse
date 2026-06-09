package certs

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	pkcs12 "software.sslmate.com/src/go-pkcs12"
)

// SecretLookup resolves encrypted secret aliases to raw material.
type SecretLookup func(alias string) (string, bool)

// DecodeBase64FileValue decodes a base64-encoded upload, including data-URL prefixes.
func DecodeBase64FileValue(value string) ([]byte, error) {
	trimmed := strings.TrimSpace(value)
	if comma := strings.Index(trimmed, ","); strings.HasPrefix(trimmed, "data:") && comma >= 0 {
		trimmed = trimmed[comma+1:]
	}
	decoded, err := base64.StdEncoding.DecodeString(trimmed)
	if err != nil {
		return nil, fmt.Errorf("decode PFX/P12 Base64 content: %w", err)
	}
	return decoded, nil
}

// KeyPairFromPEM loads a TLS client certificate from PEM-encoded cert and key material.
func KeyPairFromPEM(certPEM []byte, keyPEM []byte, passphrase string) (tls.Certificate, error) {
	if passphrase == "" {
		certificate, err := tls.X509KeyPair(certPEM, keyPEM)
		if err != nil {
			return tls.Certificate{}, fmt.Errorf("load CRT/KEY files: %w", err)
		}
		return certificate, nil
	}
	block, rest := pem.Decode(keyPEM)
	if block == nil {
		return tls.Certificate{}, fmt.Errorf("KEY file did not contain a PEM block")
	}
	if !x509.IsEncryptedPEMBlock(block) {
		certificate, err := tls.X509KeyPair(certPEM, keyPEM)
		if err != nil {
			return tls.Certificate{}, fmt.Errorf("load CRT/KEY files: %w", err)
		}
		return certificate, nil
	}
	decrypted, err := x509.DecryptPEMBlock(block, []byte(passphrase))
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("decrypt KEY file: %w", err)
	}
	decryptedPEM := pem.EncodeToMemory(&pem.Block{Type: block.Type, Bytes: decrypted})
	decryptedPEM = append(decryptedPEM, rest...)
	certificate, err := tls.X509KeyPair(certPEM, decryptedPEM)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("load decrypted CRT/KEY files: %w", err)
	}
	return certificate, nil
}

// ValidateProfileSecrets checks that stored certificate material parses correctly.
func ValidateProfileSecrets(profile domain.CertificateProfile, lookup SecretLookup) error {
	switch profile.CertType {
	case "pfx":
		pfxValue, ok := lookup(profile.PFXSecretAlias)
		if !ok || strings.TrimSpace(pfxValue) == "" {
			return fmt.Errorf("PFX/P12 secret is not configured")
		}
		passphrase := ""
		if profile.PassphraseSecretAlias != "" {
			passphrase, _ = lookup(profile.PassphraseSecretAlias)
		}
		pfxBytes, err := DecodeBase64FileValue(pfxValue)
		if err != nil {
			return err
		}
		if _, _, _, err := pkcs12.DecodeChain(pfxBytes, passphrase); err != nil {
			return fmt.Errorf("parse PFX/P12 bundle: %w", err)
		}
	default:
		certPEM, ok := lookup(profile.CertSecretAlias)
		if !ok || strings.TrimSpace(certPEM) == "" {
			return fmt.Errorf("CRT file secret is not configured")
		}
		keyPEM, ok := lookup(profile.KeySecretAlias)
		if !ok || strings.TrimSpace(keyPEM) == "" {
			return fmt.Errorf("KEY file secret is not configured")
		}
		passphrase := ""
		if profile.PassphraseSecretAlias != "" {
			passphrase, _ = lookup(profile.PassphraseSecretAlias)
		}
		if _, err := KeyPairFromPEM([]byte(certPEM), []byte(keyPEM), passphrase); err != nil {
			return err
		}
	}
	if profile.CACertSecretAlias != "" {
		caPEM, ok := lookup(profile.CACertSecretAlias)
		if !ok || strings.TrimSpace(caPEM) == "" {
			return fmt.Errorf("CA certificate secret is not configured")
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM([]byte(caPEM)) {
			return fmt.Errorf("CA certificate file did not contain valid PEM certificates")
		}
	}
	return nil
}

// TLSConfigFromProfile builds a client TLS config from a certificate profile and secret lookup.
func TLSConfigFromProfile(profile domain.CertificateProfile, lookup SecretLookup) (*tls.Config, error) {
	tlsConfig := &tls.Config{
		InsecureSkipVerify: profile.InsecureSkipVerify, //nolint:gosec // Explicit user-controlled monitor setting.
	}
	passphrase := ""
	if profile.PassphraseSecretAlias != "" {
		passphrase, _ = lookup(profile.PassphraseSecretAlias)
	}
	switch profile.CertType {
	case "pfx":
		pfxValue, ok := lookup(profile.PFXSecretAlias)
		if !ok || strings.TrimSpace(pfxValue) == "" {
			return nil, fmt.Errorf("PFX/P12 secret alias %q was not found", profile.PFXSecretAlias)
		}
		pfxBytes, err := DecodeBase64FileValue(pfxValue)
		if err != nil {
			return nil, err
		}
		privateKey, certificate, caCerts, err := pkcs12.DecodeChain(pfxBytes, passphrase)
		if err != nil {
			return nil, fmt.Errorf("parse PFX/P12 bundle: %w", err)
		}
		tlsConfig.Certificates = []tls.Certificate{{
			Certificate: [][]byte{certificate.Raw},
			PrivateKey:  privateKey,
			Leaf:        certificate,
		}}
		if len(caCerts) > 0 {
			pool := x509.NewCertPool()
			for _, cert := range caCerts {
				pool.AddCert(cert)
			}
			tlsConfig.RootCAs = pool
		}
	default:
		certPEM, ok := lookup(profile.CertSecretAlias)
		if !ok || strings.TrimSpace(certPEM) == "" {
			return nil, fmt.Errorf("certificate secret alias %q was not found", profile.CertSecretAlias)
		}
		keyPEM, ok := lookup(profile.KeySecretAlias)
		if !ok || strings.TrimSpace(keyPEM) == "" {
			return nil, fmt.Errorf("private key secret alias %q was not found", profile.KeySecretAlias)
		}
		certificate, err := KeyPairFromPEM([]byte(certPEM), []byte(keyPEM), passphrase)
		if err != nil {
			return nil, err
		}
		tlsConfig.Certificates = []tls.Certificate{certificate}
	}
	if profile.CACertSecretAlias != "" {
		caPEM, ok := lookup(profile.CACertSecretAlias)
		if !ok || strings.TrimSpace(caPEM) == "" {
			return nil, fmt.Errorf("CA certificate secret alias %q was not found", profile.CACertSecretAlias)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM([]byte(caPEM)) {
			return nil, fmt.Errorf("CA certificate secret alias %q did not contain valid PEM certificates", profile.CACertSecretAlias)
		}
		tlsConfig.RootCAs = pool
	}
	return tlsConfig, nil
}

// ProfileByID finds a certificate profile by identifier.
func ProfileByID(profiles []domain.CertificateProfile, id string) (domain.CertificateProfile, bool) {
	for _, profile := range profiles {
		if profile.ID == id {
			return profile, true
		}
	}
	return domain.CertificateProfile{}, false
}

// MatchingProfile returns the active profile that matches a request host and port.
func MatchingProfile(profiles []domain.CertificateProfile, requestURL *url.URL) (domain.CertificateProfile, bool) {
	if requestURL == nil {
		return domain.CertificateProfile{}, false
	}
	host := strings.ToLower(requestURL.Hostname())
	port := requestURL.Port()
	if port == "" {
		if requestURL.Scheme == "http" {
			port = "80"
		} else {
			port = "443"
		}
	}
	for _, profile := range profiles {
		if !profile.IsActive {
			continue
		}
		if strings.EqualFold(profile.Host, host) && strconv.Itoa(profile.Port) == port {
			return profile, true
		}
	}
	return domain.CertificateProfile{}, false
}

// NormalizeHost strips schemes and paths from a certificate profile host input.
func NormalizeHost(value string) string {
	trimmed := strings.TrimSpace(value)
	trimmed = strings.TrimPrefix(trimmed, "https://")
	trimmed = strings.TrimPrefix(trimmed, "http://")
	if parsed, err := url.Parse("https://" + trimmed); err == nil && parsed.Hostname() != "" {
		return strings.ToLower(parsed.Hostname())
	}
	if host, _, ok := strings.Cut(trimmed, ":"); ok {
		return strings.ToLower(strings.TrimSpace(host))
	}
	return strings.ToLower(trimmed)
}
