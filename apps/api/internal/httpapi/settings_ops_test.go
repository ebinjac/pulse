package httpapi

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/executor"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

func TestRetentionSettingsAndPurge(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	handler := NewServer(memoryStore, executor.NewMockExecutor(memoryStore)).Routes()

	getRequest := httptest.NewRequest(http.MethodGet, "/api/settings/retention", nil)
	getResponse := httptest.NewRecorder()
	handler.ServeHTTP(getResponse, getRequest)
	if getResponse.Code != http.StatusOK {
		t.Fatalf("get retention status = %d: %s", getResponse.Code, getResponse.Body.String())
	}
	if !strings.Contains(getResponse.Body.String(), `"runsRetentionDays":90`) {
		t.Fatalf("expected default retention: %s", getResponse.Body.String())
	}

	putBody := bytes.NewBufferString(`{"runsRetentionDays":30,"enabled":true}`)
	putRequest := httptest.NewRequest(http.MethodPut, "/api/settings/retention", putBody)
	putResponse := httptest.NewRecorder()
	handler.ServeHTTP(putResponse, putRequest)
	if putResponse.Code != http.StatusOK {
		t.Fatalf("put retention status = %d: %s", putResponse.Code, putResponse.Body.String())
	}

	oldRun := domain.MonitorRun{
		ID:          "run-old",
		MonitorID:   "mon-protected-api",
		Status:      domain.StatusSuccess,
		TriggeredBy: "manual",
		StartedAt:   time.Now().UTC().Add(-40 * 24 * time.Hour),
		EndedAt:     time.Now().UTC().Add(-40 * 24 * time.Hour),
		DurationMS:  10,
	}
	memoryStore.SaveRun(oldRun)

	purgeRequest := httptest.NewRequest(http.MethodPost, "/api/settings/retention/purge", nil)
	purgeResponse := httptest.NewRecorder()
	handler.ServeHTTP(purgeResponse, purgeRequest)
	if purgeResponse.Code != http.StatusOK {
		t.Fatalf("purge status = %d: %s", purgeResponse.Code, purgeResponse.Body.String())
	}
	if !strings.Contains(purgeResponse.Body.String(), `"deleted":1`) {
		t.Fatalf("expected one deleted run: %s", purgeResponse.Body.String())
	}
	if _, ok := memoryStore.GetRun(oldRun.ID); ok {
		t.Fatalf("expected old run to be purged")
	}
}

func TestNotificationSettingsTestEndpoint(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	handler := NewServer(memoryStore, executor.NewMockExecutor(memoryStore)).Routes()

	saveBody := bytes.NewBufferString(`{
		"smtpHost":"smtp.freesmtpservers.com",
		"smtpPort":"25",
		"smtpFrom":"pulse-alerts@example.com",
		"smtpTo":"oncall@example.com",
		"slackWebhookUrl":"https://hooks.slack.com/services/T000/B000/secret"
	}`)
	saveRequest := httptest.NewRequest(http.MethodPut, "/api/settings/notifications", saveBody)
	saveResponse := httptest.NewRecorder()
	handler.ServeHTTP(saveResponse, saveRequest)
	if saveResponse.Code != http.StatusOK {
		t.Fatalf("save notifications status = %d: %s", saveResponse.Code, saveResponse.Body.String())
	}

	testRequest := httptest.NewRequest(http.MethodPost, "/api/settings/notifications/test", bytes.NewBufferString(`{}`))
	testResponse := httptest.NewRecorder()
	handler.ServeHTTP(testResponse, testRequest)
	if testResponse.Code != http.StatusOK {
		t.Fatalf("test notifications status = %d: %s", testResponse.Code, testResponse.Body.String())
	}
	if !strings.Contains(testResponse.Body.String(), `"deliveries"`) {
		t.Fatalf("expected deliveries in response: %s", testResponse.Body.String())
	}
}
