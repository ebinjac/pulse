package executor

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

func TestRealExecutorCapturesHTTPTiming(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(20 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer target.Close()

	executor := NewRealExecutor(store.NewMemoryStore(), nil)
	run := executor.Test(domain.Monitor{
		ID:                  "mon-timing",
		Name:                "Timing Monitor",
		ResponseBodyLimitKB: 32,
		Steps: []domain.MonitorStep{
			{
				ID:         "step-http",
				Name:       "GET timing",
				Type:       "http",
				Method:     http.MethodGet,
				URL:        target.URL,
				TimeoutMS:  5000,
				Assertions: []domain.Assertion{{ID: "assert-status", Type: "statusCode", Target: "status", Operator: "equals", Expected: "200"}},
				Extractors: []domain.Extractor{},
			},
		},
	})

	if len(run.Steps) != 1 {
		t.Fatalf("steps = %d, want 1", len(run.Steps))
	}
	timing := run.Steps[0].Timing
	if timing.TotalMS <= 0 {
		t.Fatalf("timing total = %d, want > 0; timing = %+v", timing.TotalMS, timing)
	}
	if timing.TimeToFirstByteMS <= 0 {
		t.Fatalf("time to first byte = %d, want > 0; timing = %+v", timing.TimeToFirstByteMS, timing)
	}
}

func TestRealExecutorLeavesTimingEmptyForPreRequestStep(t *testing.T) {
	executor := NewRealExecutor(store.NewMemoryStore(), nil)
	run := executor.Test(domain.Monitor{
		ID:   "mon-pre-request",
		Name: "Pre-request Monitor",
		Steps: []domain.MonitorStep{
			{
				ID:      "step-pre",
				Name:    "Set variable",
				Type:    "preRequest",
				Actions: []domain.Action{{ID: "action", Type: "setVariable", Output: "token", ConfigPreview: "demo"}},
			},
		},
	})

	if len(run.Steps) != 1 {
		t.Fatalf("steps = %d, want 1", len(run.Steps))
	}
	if run.Steps[0].Timing != (domain.HTTPTiming{}) {
		t.Fatalf("pre-request timing = %+v, want empty", run.Steps[0].Timing)
	}
}

func TestRealExecutorTracksSendRequestAsDiagnosticStep(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"authorization_token":"nested-token"}`))
	}))
	defer target.Close()

	executor := NewRealExecutor(store.NewMemoryStore(), nil)
	run := executor.Test(domain.Monitor{
		ID:                  "mon-send-request",
		Name:                "Send Request Monitor",
		ResponseBodyLimitKB: 32,
		Steps: []domain.MonitorStep{
			{
				ID:   "step-pre",
				Name: "Get auth token",
				Type: "preRequest",
				PreRequestScript: `
					pm.sendRequest({
						url: "` + target.URL + `",
						method: "POST",
						header: { "Content-Type": "application/json" },
						body: { mode: "raw", raw: JSON.stringify({ scope: ["demo"] }) }
					}, function (err, response) {
						if (err) {
							pm.environment.set("auth_token", "");
							return;
						}
						pm.environment.set("auth_token", response.json().authorization_token);
					});
				`,
			},
		},
	})

	if len(run.Steps) != 2 {
		t.Fatalf("steps = %d, want parent pre-request plus sendRequest diagnostic", len(run.Steps))
	}
	if run.Steps[0].Type != "preRequest" {
		t.Fatalf("first step type = %q, want preRequest", run.Steps[0].Type)
	}
	nested := run.Steps[1]
	if nested.Type != "http" {
		t.Fatalf("nested step type = %q, want http", nested.Type)
	}
	if nested.StatusCode != http.StatusOK {
		t.Fatalf("nested status code = %d, want 200", nested.StatusCode)
	}
	if nested.LatencyMS <= 0 {
		t.Fatalf("nested latency = %d, want > 0", nested.LatencyMS)
	}
	if nested.Timing.TotalMS <= 0 {
		t.Fatalf("nested timing total = %d, want > 0", nested.Timing.TotalMS)
	}
}

func TestRealExecutorAppliesHTTPRequestScriptOverrides(t *testing.T) {
	var method string
	var tokenHeader string
	var body string
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method = r.Method
		tokenHeader = r.Header.Get("X-Test-Token")
		bytes, _ := io.ReadAll(r.Body)
		body = string(bytes)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"mode":"script"}`))
	}))
	defer target.Close()

	executor := NewRealExecutor(store.NewMemoryStore(), nil)
	run := executor.Test(domain.Monitor{
		ID:                  "mon-script-override",
		Name:                "Script Override Monitor",
		ResponseBodyLimitKB: 32,
		Variables:           map[string]string{"baseUrl": target.URL, "token": "token-123"},
		Steps: []domain.MonitorStep{
			{
				ID:        "step-script",
				Name:      "Scripted request",
				Type:      "http",
				Method:    http.MethodGet,
				URL:       "{{variables.baseUrl}}/missing",
				Config:    map[string]any{"headers": map[string]any{}, "body": ""},
				TimeoutMS: 5000,
				PreRequestScript: `
					pm.request.url = pm.variables.get("baseUrl") + "/echo";
					pm.request.method = "POST";
					pm.request.body = JSON.stringify({from:"script"});
					pm.request.headers.add("Content-Type", "application/json");
					pm.request.headers.add("X-Test-Token", pm.variables.get("token"));
				`,
				Assertions: []domain.Assertion{{ID: "assert-mode", Type: "jsonPath", Target: "$.mode", Operator: "equals", Expected: "script"}},
				Extractors: []domain.Extractor{{ID: "extract-ok", Name: "okFlag", Type: "jsonPath", Source: "$.ok"}},
			},
		},
	})

	if run.Status != domain.StatusSuccess {
		t.Fatalf("run status = %s, want success: %+v", run.Status, run)
	}
	if method != http.MethodPost {
		t.Fatalf("method = %q, want POST", method)
	}
	if tokenHeader != "token-123" {
		t.Fatalf("X-Test-Token = %q", tokenHeader)
	}
	if !strings.Contains(body, `"from":"script"`) {
		t.Fatalf("body = %q", body)
	}
	if got := run.Steps[0].ExtractedVars["okFlag"]; got != "true" {
		t.Fatalf("okFlag = %q, want true", got)
	}
}

func TestRealExecutorAppliesAuthorizationConfig(t *testing.T) {
	var bearerHeader string
	var apiKeyHeader string
	var basicHeader string
	var jwtHeader string

	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/bearer":
			bearerHeader = r.Header.Get("Authorization")
		case "/api-key":
			apiKeyHeader = r.Header.Get("X-API-Key")
		case "/basic":
			basicHeader = r.Header.Get("Authorization")
		case "/jwt":
			jwtHeader = r.Header.Get("Authorization")
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer target.Close()

	executor := NewRealExecutor(store.NewMemoryStore(), nil)
	run := executor.Test(domain.Monitor{
		ID:                  "mon-auth",
		Name:                "Auth Monitor",
		ResponseBodyLimitKB: 32,
		Variables: map[string]string{
			"bearerToken": "token-123",
			"apiKey":      "key-456",
			"username":    "user",
			"password":    "pass",
			"subject":     "client-1",
		},
		Steps: []domain.MonitorStep{
			authTestStep("step-bearer", "Bearer", target.URL+"/bearer", map[string]any{"type": "bearer", "token": "{{variables.bearerToken}}"}),
			authTestStep("step-api-key", "API key", target.URL+"/api-key", map[string]any{"type": "apiKey", "key": "X-API-Key", "value": "{{variables.apiKey}}", "addTo": "header"}),
			authTestStep("step-basic", "Basic", target.URL+"/basic", map[string]any{"type": "basic", "username": "{{variables.username}}", "password": "{{variables.password}}"}),
			authTestStep("step-jwt", "JWT", target.URL+"/jwt", map[string]any{
				"type":         "jwtBearer",
				"algorithm":    "HS256",
				"secret":       "secret",
				"payload":      `{"sub":"{{variables.subject}}"}`,
				"headerPrefix": "Bearer",
			}),
		},
	})

	if run.Status != domain.StatusSuccess {
		t.Fatalf("run status = %s, want success: %+v", run.Status, run)
	}
	if bearerHeader != "Bearer token-123" {
		t.Fatalf("bearer header = %q", bearerHeader)
	}
	if apiKeyHeader != "key-456" {
		t.Fatalf("api key header = %q", apiKeyHeader)
	}
	if basicHeader != "Basic "+base64.StdEncoding.EncodeToString([]byte("user:pass")) {
		t.Fatalf("basic header = %q", basicHeader)
	}
	if !strings.HasPrefix(jwtHeader, "Bearer ") {
		t.Fatalf("jwt header = %q", jwtHeader)
	}
	token := strings.TrimPrefix(jwtHeader, "Bearer ")
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("jwt parts = %d, want 3", len(parts))
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("decode jwt payload: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		t.Fatalf("unmarshal jwt payload: %v", err)
	}
	if payload["sub"] != "client-1" {
		t.Fatalf("jwt sub = %v", payload["sub"])
	}
}

func TestRealExecutorUsesPerRunCookieJar(t *testing.T) {
	var seenCookie string
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/login":
			http.SetCookie(w, &http.Cookie{Name: "session", Value: "abc123", Path: "/"})
		case "/profile":
			seenCookie = r.Header.Get("Cookie")
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer target.Close()

	executor := NewRealExecutor(store.NewMemoryStore(), nil)
	run := executor.Test(domain.Monitor{
		ID:                  "mon-cookie-jar",
		Name:                "Cookie Jar Monitor",
		ResponseBodyLimitKB: 32,
		Steps: []domain.MonitorStep{
			httpTestStep("step-login", "Login", target.URL+"/login", map[string]any{"cookies": map[string]any{"enabled": true, "mode": "jar"}}),
			httpTestStep("step-profile", "Profile", target.URL+"/profile", map[string]any{"cookies": map[string]any{"enabled": true, "mode": "jar"}}),
		},
	})

	if run.Status != domain.StatusSuccess {
		t.Fatalf("run status = %s, want success: %+v", run.Status, run)
	}
	if !strings.Contains(seenCookie, "session=abc123") {
		t.Fatalf("profile cookie = %q, want session cookie from previous step", seenCookie)
	}
	if got := run.Steps[1].RequestHeaders["Cookie"]; got != "********" {
		t.Fatalf("diagnostic cookie header = %q, want masked", got)
	}
}

func TestRealExecutorSendsManualCookie(t *testing.T) {
	var seenCookie string
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenCookie = r.Header.Get("Cookie")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer target.Close()

	executor := NewRealExecutor(store.NewMemoryStore(), nil)
	run := executor.Test(domain.Monitor{
		ID:                  "mon-manual-cookie",
		Name:                "Manual Cookie Monitor",
		ResponseBodyLimitKB: 32,
		Variables:           map[string]string{"sid": "manual-123"},
		Steps: []domain.MonitorStep{
			httpTestStep("step-cookie", "Cookie", target.URL, map[string]any{
				"cookies": map[string]any{
					"enabled": true,
					"mode":    "jar",
					"manual": []any{
						map[string]any{"name": "sid", "value": "{{variables.sid}}", "path": "/"},
					},
				},
			}),
		},
	})

	if run.Status != domain.StatusSuccess {
		t.Fatalf("run status = %s, want success: %+v", run.Status, run)
	}
	if !strings.Contains(seenCookie, "sid=manual-123") {
		t.Fatalf("cookie = %q, want manual cookie", seenCookie)
	}
}

func TestRealExecutorUsesMTLSAndCustomCASecrets(t *testing.T) {
	certs := newTestCertificates(t)
	target := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(r.TLS.PeerCertificates) == 0 {
			t.Errorf("missing client certificate")
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	target.TLS = &tls.Config{
		Certificates: []tls.Certificate{certs.serverTLS},
		ClientAuth:   tls.RequireAndVerifyClientCert,
		ClientCAs:    certs.caPool,
	}
	target.StartTLS()
	defer target.Close()

	memory := store.NewMemoryStore()
	upsertTestSecret(t, memory, "clientCert", certs.clientCertPEM)
	upsertTestSecret(t, memory, "clientKey", certs.clientKeyPEM)
	upsertTestSecret(t, memory, "rootCA", certs.caCertPEM)

	executor := NewRealExecutor(memory, nil)
	run := executor.Test(domain.Monitor{
		ID:                  "mon-mtls",
		Name:                "mTLS Monitor",
		ResponseBodyLimitKB: 32,
		SecretAliases:       []string{"clientCert", "clientKey", "rootCA"},
		Steps: []domain.MonitorStep{
			httpTestStep("step-mtls", "mTLS", target.URL, map[string]any{
				"mtls": map[string]any{
					"enabled":           true,
					"certSecretAlias":   "clientCert",
					"keySecretAlias":    "clientKey",
					"caCertSecretAlias": "rootCA",
				},
			}),
		},
	})

	if run.Status != domain.StatusSuccess {
		t.Fatalf("run status = %s, want success: %+v", run.Status, run)
	}
}

func TestRealExecutorUsesGlobalCertificateProfileForMatchingHost(t *testing.T) {
	certs := newTestCertificates(t)
	target := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(r.TLS.PeerCertificates) == 0 {
			t.Errorf("missing client certificate")
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	target.TLS = &tls.Config{
		Certificates: []tls.Certificate{certs.serverTLS},
		ClientAuth:   tls.RequireAndVerifyClientCert,
		ClientCAs:    certs.caPool,
	}
	target.StartTLS()
	defer target.Close()

	targetURL, err := url.Parse(target.URL)
	if err != nil {
		t.Fatalf("parse target URL: %v", err)
	}
	port, err := strconv.Atoi(targetURL.Port())
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}

	memory := store.NewMemoryStore()
	upsertTestSecret(t, memory, "globalClientCert", certs.clientCertPEM)
	upsertTestSecret(t, memory, "globalClientKey", certs.clientKeyPEM)
	upsertTestSecret(t, memory, "globalRootCA", certs.caCertPEM)
	if _, err := memory.UpsertCertificateProfile(domain.CertificateProfile{
		ID:                "cert-global",
		Name:              "Global test cert",
		Host:              targetURL.Hostname(),
		Port:              port,
		CertType:          "pem",
		CertSecretAlias:   "globalClientCert",
		KeySecretAlias:    "globalClientKey",
		CACertSecretAlias: "globalRootCA",
		IsActive:          true,
	}); err != nil {
		t.Fatalf("upsert certificate profile: %v", err)
	}

	executor := NewRealExecutor(memory, nil)
	run := executor.Test(domain.Monitor{
		ID:                  "mon-global-mtls",
		Name:                "Global mTLS Monitor",
		ResponseBodyLimitKB: 32,
		Steps: []domain.MonitorStep{
			httpTestStep("step-global-mtls", "Global mTLS", target.URL, map[string]any{}),
		},
	})

	if run.Status != domain.StatusSuccess {
		t.Fatalf("run status = %s, want success: %+v", run.Status, run)
	}
}

func TestRealExecutorUsesProxyConfigAndCredentials(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer target.Close()

	targetURL, err := url.Parse(target.URL)
	if err != nil {
		t.Fatalf("parse target URL: %v", err)
	}
	proxyHits := 0
	var seenProxyAuth string
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxyHits++
		seenProxyAuth = r.Header.Get("Proxy-Authorization")
		proxyReq := r.Clone(r.Context())
		proxyReq.RequestURI = ""
		proxyReq.URL.Scheme = targetURL.Scheme
		proxyReq.URL.Host = targetURL.Host
		httputil.NewSingleHostReverseProxy(targetURL).ServeHTTP(w, proxyReq)
	}))
	defer proxy.Close()

	executor := NewRealExecutor(store.NewMemoryStore(), nil)
	run := executor.Test(domain.Monitor{
		ID:                  "mon-proxy",
		Name:                "Proxy Monitor",
		ResponseBodyLimitKB: 32,
		Variables:           map[string]string{"proxyUser": "pulse", "proxyPass": "secret"},
		Steps: []domain.MonitorStep{
			httpTestStep("step-proxy", "Proxy", target.URL, map[string]any{
				"proxy": map[string]any{
					"enabled":  true,
					"url":      proxy.URL,
					"username": "{{variables.proxyUser}}",
					"password": "{{variables.proxyPass}}",
				},
			}),
		},
	})

	if run.Status != domain.StatusSuccess {
		t.Fatalf("run status = %s, want success: %+v", run.Status, run)
	}
	if proxyHits == 0 {
		t.Fatalf("proxy was not used")
	}
	wantAuth := "Basic " + base64.StdEncoding.EncodeToString([]byte("pulse:secret"))
	if seenProxyAuth != wantAuth {
		t.Fatalf("proxy auth = %q, want %q", seenProxyAuth, wantAuth)
	}
}

func authTestStep(id string, name string, url string, auth map[string]any) domain.MonitorStep {
	return domain.MonitorStep{
		ID:         id,
		Name:       name,
		Type:       "http",
		Method:     http.MethodGet,
		URL:        url,
		TimeoutMS:  5000,
		Assertions: []domain.Assertion{{ID: "assert-" + id, Type: "statusCode", Target: "status", Operator: "equals", Expected: "200"}},
		Extractors: []domain.Extractor{},
		Config:     map[string]any{"auth": auth},
	}
}

func httpTestStep(id string, name string, url string, config map[string]any) domain.MonitorStep {
	return domain.MonitorStep{
		ID:         id,
		Name:       name,
		Type:       "http",
		Method:     http.MethodGet,
		URL:        url,
		TimeoutMS:  5000,
		Assertions: []domain.Assertion{{ID: "assert-" + id, Type: "statusCode", Target: "status", Operator: "equals", Expected: "200"}},
		Extractors: []domain.Extractor{},
		Config:     config,
	}
}

func upsertTestSecret(t *testing.T, memory store.Store, alias string, value string) {
	t.Helper()
	_, err := memory.UpsertSecret(domain.SecretReference{
		Name:     alias,
		Alias:    alias,
		Provider: "encrypted-db",
		IsActive: true,
		RawValue: value,
	})
	if err != nil {
		t.Fatalf("upsert secret %s: %v", alias, err)
	}
}

type testCertificates struct {
	caCertPEM     string
	clientCertPEM string
	clientKeyPEM  string
	serverTLS     tls.Certificate
	caPool        *x509.CertPool
}

func newTestCertificates(t *testing.T) testCertificates {
	t.Helper()
	caKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate CA key: %v", err)
	}
	caTemplate := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "Pulse Test CA"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	caDER, err := x509.CreateCertificate(rand.Reader, caTemplate, caTemplate, &caKey.PublicKey, caKey)
	if err != nil {
		t.Fatalf("create CA cert: %v", err)
	}
	caCert, err := x509.ParseCertificate(caDER)
	if err != nil {
		t.Fatalf("parse CA cert: %v", err)
	}

	serverCertPEM, serverKeyPEM := signedCertPEM(t, caCert, caKey, "127.0.0.1", []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, true)
	serverTLS, err := tls.X509KeyPair([]byte(serverCertPEM), []byte(serverKeyPEM))
	if err != nil {
		t.Fatalf("load server cert: %v", err)
	}
	clientCertPEM, clientKeyPEM := signedCertPEM(t, caCert, caKey, "pulse-client", []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}, false)
	caCertPEM := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER}))
	caPool := x509.NewCertPool()
	if !caPool.AppendCertsFromPEM([]byte(caCertPEM)) {
		t.Fatalf("append CA cert")
	}

	return testCertificates{
		caCertPEM:     caCertPEM,
		clientCertPEM: clientCertPEM,
		clientKeyPEM:  clientKeyPEM,
		serverTLS:     serverTLS,
		caPool:        caPool,
	}
}

func signedCertPEM(t *testing.T, caCert *x509.Certificate, caKey *rsa.PrivateKey, commonName string, usages []x509.ExtKeyUsage, server bool) (string, string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate cert key: %v", err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: commonName},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  usages,
	}
	if server {
		template.DNSNames = []string{"localhost"}
		template.IPAddresses = []net.IP{net.ParseIP("127.0.0.1")}
	}
	der, err := x509.CreateCertificate(rand.Reader, template, caCert, &key.PublicKey, caKey)
	if err != nil {
		t.Fatalf("create signed cert: %v", err)
	}
	certPEM := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	keyPEM := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
	return certPEM, keyPEM
}
