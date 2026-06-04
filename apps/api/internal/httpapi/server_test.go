package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/executor"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

func testServer() http.Handler {
	store := store.NewMemoryStore()
	return NewServer(store, executor.NewMockExecutor(store)).Routes()
}

func TestRunMonitorDraftEndpoint(t *testing.T) {
	handler := testServer()
	body := bytes.NewBufferString(`{"name":"Synthetic monitor","steps":[]}`)
	request := httptest.NewRequest(http.MethodPost, "/api/monitors/mon-protected-api/run/draft", body)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusCreated, response.Body.String())
	}
}

func TestListMonitorVersionsEndpoint(t *testing.T) {
	handler := testServer()
	request := httptest.NewRequest(http.MethodGet, "/api/monitors/mon-protected-api/versions", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	var payload struct {
		Versions []domain.MonitorVersionSummary `json:"versions"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.Versions) == 0 {
		t.Fatal("expected at least one version for seeded monitor")
	}
}

func TestRunMonitorEndpoint(t *testing.T) {
	handler := testServer()
	request := httptest.NewRequest(http.MethodPost, "/api/monitors/mon-protected-api/run", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusCreated, response.Body.String())
	}

	var payload struct {
		Run domain.MonitorRun `json:"run"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Run.Status != domain.StatusFailed {
		t.Fatalf("run status = %s, want failed", payload.Run.Status)
	}
	if len(payload.Run.Steps) < 2 || payload.Run.Steps[1].Timing.TotalMS <= 0 {
		t.Fatalf("http step timing was not returned: %+v", payload.Run.Steps)
	}
}

func TestSecretsEndpointDoesNotExposeRawValues(t *testing.T) {
	handler := testServer()
	request := httptest.NewRequest(http.MethodGet, "/api/secrets", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	body := response.Body.String()
	if !strings.Contains(body, "********") {
		t.Fatalf("secret response did not include masked value: %s", body)
	}
	if strings.Contains(body, "actual") || strings.Contains(body, "secret-token") {
		t.Fatalf("secret response appears to expose raw secret material: %s", body)
	}
}

func TestCreateSecretStoresRawValueWithoutExposingIt(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	handler := NewServer(memoryStore, executor.NewMockExecutor(memoryStore)).Routes()
	body := bytes.NewBufferString(`{
		"name":"Partner API Token",
		"alias":"partnerToken",
		"description":"Used for partner API checks",
		"provider":"encrypted-db",
		"value":"raw-partner-secret",
		"isActive":true
	}`)
	request := httptest.NewRequest(http.MethodPost, "/api/secrets", body)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusCreated, response.Body.String())
	}
	responseBody := response.Body.String()
	if strings.Contains(responseBody, "raw-partner-secret") {
		t.Fatalf("create response exposed raw secret: %s", responseBody)
	}
	if !strings.Contains(responseBody, "********") {
		t.Fatalf("create response did not mask secret: %s", responseBody)
	}
	raw, ok := memoryStore.GetRawSecretValue("partnerToken")
	if !ok || raw != "raw-partner-secret" {
		t.Fatalf("raw secret = %q, ok = %v", raw, ok)
	}
}

func TestMonitorStatusJSONBoundaryUsesLowercaseValues(t *testing.T) {
	handler := testServer()
	request := httptest.NewRequest(http.MethodPost, "/api/monitors/mon-protected-api/run", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusCreated, response.Body.String())
	}

	responseBody := response.Body.String()
	if !strings.Contains(responseBody, `"status":"failed"`) {
		t.Fatalf("run response should expose lowercase status: %s", responseBody)
	}
	if strings.Contains(responseBody, `"status":"FAILED"`) {
		t.Fatalf("run response exposed uppercase internal status: %s", responseBody)
	}

	var payload struct {
		Run domain.MonitorRun `json:"run"`
	}
	if err := json.NewDecoder(strings.NewReader(responseBody)).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Run.Status != domain.StatusFailed {
		t.Fatalf("decoded run status = %s, want %s", payload.Run.Status, domain.StatusFailed)
	}
}

func TestSecretTestRequiresDecryptableSecret(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	handler := NewServer(memoryStore, executor.NewMockExecutor(memoryStore)).Routes()
	body := bytes.NewBufferString(`{
		"name":"Partner API Token",
		"alias":"partnerToken",
		"provider":"encrypted-db",
		"value":"raw-partner-secret",
		"isActive":true
	}`)
	createRequest := httptest.NewRequest(http.MethodPost, "/api/secrets", body)
	createResponse := httptest.NewRecorder()
	handler.ServeHTTP(createResponse, createRequest)
	if createResponse.Code != http.StatusCreated {
		t.Fatalf("create status = %d: %s", createResponse.Code, createResponse.Body.String())
	}
	var createPayload struct {
		Secret domain.SecretReference `json:"secret"`
	}
	if err := json.NewDecoder(createResponse.Body).Decode(&createPayload); err != nil {
		t.Fatalf("decode create response: %v", err)
	}

	testRequest := httptest.NewRequest(http.MethodPost, "/api/secrets/"+createPayload.Secret.ID+"/test", nil)
	testResponse := httptest.NewRecorder()
	handler.ServeHTTP(testResponse, testRequest)

	if testResponse.Code != http.StatusOK {
		t.Fatalf("test status = %d: %s", testResponse.Code, testResponse.Body.String())
	}
	if !strings.Contains(testResponse.Body.String(), `"ok":true`) {
		t.Fatalf("expected secret test ok response: %s", testResponse.Body.String())
	}
	if strings.Contains(testResponse.Body.String(), "raw-partner-secret") {
		t.Fatalf("test response exposed raw secret: %s", testResponse.Body.String())
	}
}

func TestNotificationSettingsStoreEncryptedValuesWithoutExposingThem(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	handler := NewServer(memoryStore, executor.NewMockExecutor(memoryStore)).Routes()
	body := bytes.NewBufferString(`{
		"smtpHost":"smtp.freesmtpservers.com",
		"smtpPort":"25",
		"smtpFrom":"pulse-alerts@example.com",
		"smtpTo":"oncall@example.com",
		"slackWebhookUrl":"https://hooks.slack.com/services/T000/B000/secret"
	}`)
	request := httptest.NewRequest(http.MethodPut, "/api/settings/notifications", body)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	responseBody := response.Body.String()
	for _, sensitive := range []string{"smtp.freesmtpservers.com", "oncall@example.com", "hooks.slack.com"} {
		if strings.Contains(responseBody, sensitive) {
			t.Fatalf("settings response exposed configured value %q: %s", sensitive, responseBody)
		}
	}
	if raw, ok := memoryStore.GetRawSecretValue("alertSmtpAddr"); !ok || raw != "smtp.freesmtpservers.com:25" {
		t.Fatalf("smtp addr = %q, ok = %v", raw, ok)
	}
	if raw, ok := memoryStore.GetRawSecretValue("slackWebhook"); !ok || raw != "https://hooks.slack.com/services/T000/B000/secret" {
		t.Fatalf("slack webhook = %q, ok = %v", raw, ok)
	}
}
