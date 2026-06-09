package executor

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/certs"
	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/variables"
)

func applyAuthConfig(req *http.Request, config map[string]any, resolver variables.Resolver) error {
	if config == nil {
		return nil
	}
	authMap, ok := config["auth"].(map[string]any)
	if !ok {
		return nil
	}
	authType := strings.TrimSpace(stringFromAny(authMap["type"]))
	if authType == "" || authType == "noAuth" {
		return nil
	}

	switch authType {
	case "apiKey":
		key, err := resolveConfigString(authMap["key"], resolver)
		if err != nil {
			return err
		}
		value, err := resolveConfigString(authMap["value"], resolver)
		if err != nil {
			return err
		}
		if key == "" {
			return fmt.Errorf("api key name is required")
		}
		if authMap["addTo"] == "query" {
			query := req.URL.Query()
			query.Set(key, value)
			req.URL.RawQuery = query.Encode()
		} else {
			req.Header.Set(key, value)
		}
	case "bearer":
		token, err := resolveConfigString(authMap["token"], resolver)
		if err != nil {
			return err
		}
		if token == "" {
			return fmt.Errorf("bearer token is required")
		}
		req.Header.Set("Authorization", "Bearer "+token)
	case "basic":
		username, err := resolveConfigString(authMap["username"], resolver)
		if err != nil {
			return err
		}
		password, err := resolveConfigString(authMap["password"], resolver)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(username+":"+password)))
	case "jwtBearer":
		token, err := jwtBearerToken(authMap, resolver)
		if err != nil {
			return err
		}
		addTo := stringFromAny(authMap["addTo"])
		prefix := stringFromAny(authMap["headerPrefix"])
		if prefix == "" {
			prefix = "Bearer"
		}
		if addTo == "query" {
			key := stringFromAny(authMap["queryKey"])
			if key == "" {
				key = "jwt"
			}
			query := req.URL.Query()
			query.Set(key, token)
			req.URL.RawQuery = query.Encode()
		} else {
			headerName := stringFromAny(authMap["headerName"])
			if headerName == "" {
				headerName = "Authorization"
			}
			if prefix != "" {
				token = prefix + " " + token
			}
			req.Header.Set(headerName, token)
		}
	default:
		return fmt.Errorf("unsupported auth type %q", authType)
	}

	return nil
}

func applyCookieConfig(req *http.Request, config map[string]any, resolver variables.Resolver) error {
	cookieMap := configMap(config, "cookies")
	if cookieMap == nil || !cookieConfigEnabled(cookieMap) {
		return nil
	}
	manual, ok := cookieMap["manual"].([]any)
	if !ok {
		return nil
	}

	for _, item := range manual {
		row, ok := item.(map[string]any)
		if !ok {
			continue
		}
		name, err := resolveConfigString(row["name"], resolver)
		if err != nil {
			return err
		}
		value, err := resolveConfigString(row["value"], resolver)
		if err != nil {
			return err
		}
		if strings.TrimSpace(name) == "" {
			continue
		}
		cookie := &http.Cookie{Name: strings.TrimSpace(name), Value: value}
		if path, err := resolveConfigString(row["path"], resolver); err != nil {
			return err
		} else if strings.TrimSpace(path) != "" {
			cookie.Path = strings.TrimSpace(path)
		}
		if domain, err := resolveConfigString(row["domain"], resolver); err != nil {
			return err
		} else if strings.TrimSpace(domain) != "" {
			cookie.Domain = strings.TrimSpace(domain)
		}
		req.AddCookie(cookie)
	}

	return nil
}

func jarForStep(config map[string]any, jar http.CookieJar) http.CookieJar {
	cookieMap := configMap(config, "cookies")
	if cookieMap == nil {
		return jar
	}
	if !cookieConfigEnabled(cookieMap) {
		return nil
	}
	return jar
}

func cookieConfigEnabled(cookieMap map[string]any) bool {
	if value, ok := cookieMap["enabled"]; ok {
		return boolFromAny(value)
	}
	return true
}

func transportForStep(config map[string]any, resolver variables.Resolver, secrets map[string]string, requestURL *url.URL, profiles []domain.CertificateProfile, lookup certs.SecretLookup) (*http.Transport, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	tlsConfig, err := tlsConfigForStep(config, resolver, secrets, requestURL, profiles, lookup)
	if err != nil {
		return nil, err
	}
	if tlsConfig != nil {
		transport.TLSClientConfig = tlsConfig
	}
	proxy, err := proxyForStep(config, resolver)
	if err != nil {
		return nil, err
	}
	if proxy != nil {
		transport.Proxy = http.ProxyURL(proxy)
	}
	return transport, nil
}

func tlsConfigForStep(config map[string]any, resolver variables.Resolver, secrets map[string]string, requestURL *url.URL, profiles []domain.CertificateProfile, lookup certs.SecretLookup) (*tls.Config, error) {
	mtlsMap := configMap(config, "mtls")
	mode := "global"
	if mtlsMap != nil {
		if configuredMode := strings.TrimSpace(stringFromAny(mtlsMap["mode"])); configuredMode != "" {
			mode = configuredMode
		} else if boolFromAny(mtlsMap["enabled"]) {
			mode = "custom"
		}
	}
	if mode == "none" {
		return nil, nil
	}
	if mode == "profile" {
		profileID, err := resolveConfigString(mtlsMap["profileId"], resolver)
		if err != nil {
			return nil, err
		}
		profile, ok := certs.ProfileByID(profiles, profileID)
		if !ok || !profile.IsActive {
			return nil, fmt.Errorf("certificate profile %q was not found or is inactive", profileID)
		}
		return certs.TLSConfigFromProfile(profile, lookup)
	}
	if mode == "global" {
		profile, ok := certs.MatchingProfile(profiles, requestURL)
		if !ok {
			return nil, nil
		}
		return certs.TLSConfigFromProfile(profile, lookup)
	}
	if mtlsMap == nil {
		return nil, nil
	}

	tlsConfig := &tls.Config{
		InsecureSkipVerify: boolFromAny(mtlsMap["insecureSkipVerify"]), //nolint:gosec // Explicit user-controlled monitor setting, default false.
	}

	certAlias, err := resolveConfigString(mtlsMap["certSecretAlias"], resolver)
	if err != nil {
		return nil, err
	}
	keyAlias, err := resolveConfigString(mtlsMap["keySecretAlias"], resolver)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(certAlias) != "" || strings.TrimSpace(keyAlias) != "" {
		if strings.TrimSpace(certAlias) == "" || strings.TrimSpace(keyAlias) == "" {
			return nil, fmt.Errorf("both certificate and key secret aliases are required for mTLS")
		}
		certPEM, ok := secrets[strings.TrimSpace(certAlias)]
		if !ok || certPEM == "" {
			return nil, fmt.Errorf("certificate secret alias %q was not found", strings.TrimSpace(certAlias))
		}
		keyPEM, ok := secrets[strings.TrimSpace(keyAlias)]
		if !ok || keyPEM == "" {
			return nil, fmt.Errorf("private key secret alias %q was not found", strings.TrimSpace(keyAlias))
		}
		certificate, err := tls.X509KeyPair([]byte(certPEM), []byte(keyPEM))
		if err != nil {
			return nil, fmt.Errorf("load client certificate: %w", err)
		}
		tlsConfig.Certificates = []tls.Certificate{certificate}
	}

	caAlias, err := resolveConfigString(mtlsMap["caCertSecretAlias"], resolver)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(caAlias) != "" {
		caPEM, ok := secrets[strings.TrimSpace(caAlias)]
		if !ok || caPEM == "" {
			return nil, fmt.Errorf("CA certificate secret alias %q was not found", strings.TrimSpace(caAlias))
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM([]byte(caPEM)) {
			return nil, fmt.Errorf("CA certificate secret alias %q did not contain valid PEM certificates", strings.TrimSpace(caAlias))
		}
		tlsConfig.RootCAs = pool
	}

	return tlsConfig, nil
}

func proxyForStep(config map[string]any, resolver variables.Resolver) (*url.URL, error) {
	proxyMap := configMap(config, "proxy")
	if proxyMap == nil || !boolFromAny(proxyMap["enabled"]) {
		return nil, nil
	}
	rawProxyURL, err := resolveConfigString(proxyMap["url"], resolver)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(rawProxyURL) == "" {
		return nil, fmt.Errorf("proxy URL is required")
	}
	proxyURL, err := url.Parse(strings.TrimSpace(rawProxyURL))
	if err != nil {
		return nil, fmt.Errorf("parse proxy URL: %w", err)
	}
	if proxyURL.Scheme == "" || proxyURL.Host == "" {
		return nil, fmt.Errorf("proxy URL must include scheme and host")
	}

	username, err := resolveConfigString(proxyMap["username"], resolver)
	if err != nil {
		return nil, err
	}
	password, err := resolveConfigString(proxyMap["password"], resolver)
	if err != nil {
		return nil, err
	}
	if username != "" || password != "" {
		if password != "" {
			proxyURL.User = url.UserPassword(username, password)
		} else {
			proxyURL.User = url.User(username)
		}
	}

	return proxyURL, nil
}
