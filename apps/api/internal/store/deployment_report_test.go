package store

import (
	"testing"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func TestBuildDeploymentValidationReportSummaryLatencyAndFailures(t *testing.T) {
	now := time.Now().UTC()
	preRuns := []domain.MonitorRun{
		{MonitorID: "m1", MonitorName: "API", Status: domain.StatusSuccess, DurationMS: 10, StartedAt: now},
		{MonitorID: "m1", MonitorName: "API", Status: domain.StatusSuccess, DurationMS: 20, StartedAt: now},
		{MonitorID: "m1", MonitorName: "API", Status: domain.StatusFailed, DurationMS: 100, StartedAt: now},
	}
	postRuns := []domain.MonitorRun{
		{MonitorID: "m1", MonitorName: "API", Status: domain.StatusSuccess, DurationMS: 15, StartedAt: now},
		{MonitorID: "m1", MonitorName: "API", Status: domain.StatusSuccess, DurationMS: 25, StartedAt: now},
		{MonitorID: "m1", MonitorName: "API", Status: domain.StatusSuccess, DurationMS: 50, StartedAt: now},
	}

	report := BuildDeploymentValidationReport(domain.DeploymentValidation{
		MonitorIDs: []string{"m1"},
	}, preRuns, postRuns)

	if report.Summary.PreFailureCount != 1 {
		t.Fatalf("pre failures = %d, want 1", report.Summary.PreFailureCount)
	}
	if report.Summary.PostFailureCount != 0 {
		t.Fatalf("post failures = %d, want 0", report.Summary.PostFailureCount)
	}
	if report.Summary.PreMeanLatencyMS != 43 {
		t.Fatalf("pre mean = %d, want 43", report.Summary.PreMeanLatencyMS)
	}
	if report.Summary.PostMeanLatencyMS != 30 {
		t.Fatalf("post mean = %d, want 30", report.Summary.PostMeanLatencyMS)
	}
	if report.Summary.PreMaxLatencyMS != 100 {
		t.Fatalf("pre max = %d, want 100", report.Summary.PreMaxLatencyMS)
	}
	if report.Summary.PostMaxLatencyMS != 50 {
		t.Fatalf("post max = %d, want 50", report.Summary.PostMaxLatencyMS)
	}
	if report.Summary.PreP99LatencyMS != 100 {
		t.Fatalf("pre p99 = %d, want 100", report.Summary.PreP99LatencyMS)
	}
	if report.Summary.PostP99LatencyMS != 50 {
		t.Fatalf("post p99 = %d, want 50", report.Summary.PostP99LatencyMS)
	}
}
