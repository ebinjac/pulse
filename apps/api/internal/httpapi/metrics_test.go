package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/executor"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

func TestSLOSummaryEndpoint(t *testing.T) {
	memoryStore := store.NewMemoryStore()
	handler := NewServer(memoryStore, executor.NewMockExecutor(memoryStore)).Routes()

	now := time.Now().UTC()
	memoryStore.SaveRun(domain.MonitorRun{
		ID:          "run-slo-1",
		MonitorID:   "mon-protected-api",
		Status:      domain.StatusSuccess,
		TriggeredBy: "schedule",
		StartedAt:   now,
		EndedAt:     now,
		DurationMS:  120,
	})

	request := httptest.NewRequest(http.MethodGet, "/api/metrics/slo", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"targetUptimePct":99.9`) {
		t.Fatalf("expected SLO summary payload: %s", response.Body.String())
	}
}
