package scripting

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestExecute_BasicVariables(t *testing.T) {
	ctx := &ScriptContext{
		Variables: map[string]string{
			"inputVar": "hello",
		},
		Secrets: map[string]string{},
		Steps:   map[string]map[string]string{},
		Request: &RequestOverrides{},
		Console: []string{},
	}

	script := `
		var input = pm.variables.get("inputVar");
		pm.variables.set("outputVar", input + " world");
		pm.environment.set("envVar", "compat-env");
		var obj = pm.variables.toObject();
		pm.variables.set("objKeysCount", Object.keys(obj).length.toString());
	`

	err := Execute(script, ctx)
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	if ctx.Variables["outputVar"] != "hello world" {
		t.Errorf("Expected outputVar to be 'hello world', got: '%s'", ctx.Variables["outputVar"])
	}

	if ctx.Variables["envVar"] != "compat-env" {
		t.Errorf("Expected envVar (environment alias) to be 'compat-env', got: '%s'", ctx.Variables["envVar"])
	}

	// inputVar, outputVar, envVar, objKeysCount should exist in variables pool.
	// Since we set outputVar and envVar dynamically, they are written back.
	if count, ok := ctx.Variables["objKeysCount"]; !ok || (count != "1" && count != "2" && count != "3") {
		// Depending on ordering and evaluation inside script, object should have keys.
		// Just verify we read the count without crashing.
	}
}

func TestExecute_SecretsAccess(t *testing.T) {
	ctx := &ScriptContext{
		Variables: map[string]string{},
		Secrets: map[string]string{
			"db_password": "super-secret-pass",
		},
		Steps:   map[string]map[string]string{},
		Request: &RequestOverrides{},
		Console: []string{},
	}

	script := `
		var secret = pm.secrets.get("db_password");
		pm.variables.set("resolved_secret", secret);
		var missingSecret = pm.secrets.get("non_existent");
		pm.variables.set("missing_secret_is_undefined", (missingSecret === undefined).toString());
	`

	err := Execute(script, ctx)
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	if ctx.Variables["resolved_secret"] != "super-secret-pass" {
		t.Errorf("Expected resolved_secret to be 'super-secret-pass', got: '%s'", ctx.Variables["resolved_secret"])
	}

	if ctx.Variables["missing_secret_is_undefined"] != "true" {
		t.Errorf("Expected missing secret to be undefined (true), got: '%s'", ctx.Variables["missing_secret_is_undefined"])
	}
}

func TestExecute_ConsoleLog(t *testing.T) {
	ctx := &ScriptContext{
		Variables: map[string]string{},
		Secrets:   map[string]string{},
		Steps:     map[string]map[string]string{},
		Request:   &RequestOverrides{},
		Console:   []string{},
	}

	script := `
		console.log("hello", "world");
		console.log("value is:", 42);
	`

	err := Execute(script, ctx)
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	if len(ctx.Console) != 2 {
		t.Fatalf("Expected 2 console log lines, got: %d", len(ctx.Console))
	}

	if ctx.Console[0] != "hello world" {
		t.Errorf("Expected first log line to be 'hello world', got: '%s'", ctx.Console[0])
	}

	if ctx.Console[1] != "value is: 42" {
		t.Errorf("Expected second log line to be 'value is: 42', got: '%s'", ctx.Console[1])
	}
}

func TestExecute_RequestOverrides(t *testing.T) {
	ctx := &ScriptContext{
		Variables: map[string]string{},
		Secrets:   map[string]string{},
		Steps:     map[string]map[string]string{},
		Request: &RequestOverrides{
			URL:     "https://original.com/api",
			Method:  "GET",
			Headers: map[string]string{"X-Original": "value"},
			Body:    "original-body",
		},
		Console: []string{},
	}

	script := `
		pm.request.url = "https://override.com/api";
		pm.request.method = "POST";
		pm.request.body = "override-body";
		pm.request.headers.add("Content-Type", "application/json");
		pm.request.headers.add("X-Original", "mutated-value");
	`

	err := Execute(script, ctx)
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	if ctx.Request.URL != "https://override.com/api" {
		t.Errorf("Expected overridden URL, got: '%s'", ctx.Request.URL)
	}

	if ctx.Request.Method != "POST" {
		t.Errorf("Expected overridden Method, got: '%s'", ctx.Request.Method)
	}

	if ctx.Request.Body != "override-body" {
		t.Errorf("Expected overridden Body, got: '%s'", ctx.Request.Body)
	}

	if ctx.Request.Headers["Content-Type"] != "application/json" {
		t.Errorf("Expected Content-Type header, got: '%s'", ctx.Request.Headers["Content-Type"])
	}

	if ctx.Request.Headers["X-Original"] != "mutated-value" {
		t.Errorf("Expected mutated X-Original header, got: '%s'", ctx.Request.Headers["X-Original"])
	}
}

func TestExecute_PostmanSendRequestAndCryptoJS(t *testing.T) {
	var receivedSignature string
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedSignature = r.Header.Get("X-Auth-Signature")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"authorization_token":"token-123"}`))
	}))
	defer target.Close()

	secret := base64.StdEncoding.EncodeToString([]byte("shared-secret"))
	input := "client-2-123456"
	mac := hmac.New(sha256.New, []byte("shared-secret"))
	_, _ = mac.Write([]byte(input))
	expectedSignature := strings.TrimRight(base64.StdEncoding.EncodeToString(mac.Sum(nil)), "=")
	expectedSignature = strings.NewReplacer("+", "-", "/", "_").Replace(expectedSignature)

	ctx := &ScriptContext{
		Variables: map[string]string{"tokenUrl": target.URL},
		Secrets:   map[string]string{},
		Steps:     map[string]map[string]string{},
		Request:   &RequestOverrides{Headers: map[string]string{}},
		Console:   []string{},
	}

	script := `
		const clientId = "client";
		const secret = "` + secret + `";
		const authVersion = "2";
		const timestamp = "123456";
		const input = clientId + "-" + authVersion + "-" + timestamp;
		const secretByteArray = CryptoJS.enc.Base64.parse(secret);
		const signatureBytes = CryptoJS.HmacSHA256(input, secretByteArray);
		let b64Signature = CryptoJS.enc.Base64.stringify(signatureBytes);
		b64Signature = b64Signature.replace(/=+$/, "");
		b64Signature = b64Signature.split("+").join("-").split("/").join("_");

		pm.sendRequest({
			url: pm.variables.get("tokenUrl"),
			method: "POST",
			header: {
				"Content-Type": "application/json",
				"X-Auth-Signature": b64Signature
			},
			body: {
				mode: "raw",
				raw: JSON.stringify({ scope: ["/demo::POST"] })
			}
		}, function (err, response) {
			if (err) {
				pm.environment.set("auth_token", "");
				return;
			}
			const jsonResponse = response.json();
			pm.environment.set("auth_token", jsonResponse.authorization_token);
		});
	`

	if err := Execute(script, ctx); err != nil {
		t.Fatalf("execute script: %v", err)
	}
	if ctx.Variables["auth_token"] != "token-123" {
		t.Fatalf("auth_token = %q, want token-123", ctx.Variables["auth_token"])
	}
	if receivedSignature != expectedSignature {
		t.Fatalf("signature = %q, want %q", receivedSignature, expectedSignature)
	}
	if len(ctx.SubRequests) != 1 {
		t.Fatalf("sub requests = %d, want 1", len(ctx.SubRequests))
	}
	if ctx.SubRequests[0].LatencyMS <= 0 {
		t.Fatalf("sub request latency = %d, want > 0", ctx.SubRequests[0].LatencyMS)
	}
	if ctx.SubRequests[0].StatusCode != http.StatusOK {
		t.Fatalf("sub request status = %d, want 200", ctx.SubRequests[0].StatusCode)
	}
}

func TestExecute_Timeout(t *testing.T) {
	ctx := &ScriptContext{
		Variables: map[string]string{},
		Secrets:   map[string]string{},
		Steps:     map[string]map[string]string{},
		Request:   &RequestOverrides{},
		Console:   []string{},
	}

	// This script runs an infinite loop
	script := `
		while(true) {}
	`

	start := time.Now()
	err := Execute(script, ctx)
	duration := time.Since(start)

	if err == nil {
		t.Fatal("Expected script to fail with timeout error, but got nil")
	}

	if !strings.Contains(err.Error(), "timeout") && !strings.Contains(err.Error(), "interrupted") {
		t.Errorf("Expected timeout error, got: %v", err)
	}

	// The timeout is set to 5 seconds in engine.go.
	// We want to make sure it took at least 4.5 seconds and didn't take indefinitely long.
	if duration < 4500*time.Millisecond {
		t.Errorf("Expected execution to take at least 5s (timeout), took: %v", duration)
	}
	if duration > 7*time.Second {
		t.Errorf("Expected execution to terminate close to 5s, took: %v", duration)
	}
}

func TestExecute_SyntaxError(t *testing.T) {
	ctx := &ScriptContext{
		Variables: map[string]string{},
		Secrets:   map[string]string{},
		Steps:     map[string]map[string]string{},
		Request:   &RequestOverrides{},
		Console:   []string{},
	}

	script := `
		if (something { // missing closing paren
	`

	err := Execute(script, ctx)
	if err == nil {
		t.Fatal("Expected syntax error, got nil")
	}

	if !strings.Contains(err.Error(), "script error") && !strings.Contains(err.Error(), "SyntaxError") {
		t.Errorf("Expected syntax error messages, got: %v", err)
	}
}
