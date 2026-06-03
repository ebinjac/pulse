package executor

import (
	"net/http"
	"net/http/httptest"
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
