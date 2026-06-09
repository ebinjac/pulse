package store

import (
	"testing"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func TestNormalizeMonitorAppliesDefaults(t *testing.T) {
	monitor := NormalizeMonitor(domain.Monitor{
		Cron: "*/5 * * * *",
	})

	if monitor.ScheduleCron != "*/5 * * * *" {
		t.Fatalf("schedule cron = %q", monitor.ScheduleCron)
	}
	if monitor.Timezone != "UTC" {
		t.Fatalf("timezone = %q", monitor.Timezone)
	}
	if monitor.TimeoutMS != 30000 {
		t.Fatalf("timeout = %d", monitor.TimeoutMS)
	}
	if monitor.FailureThreshold != 3 {
		t.Fatalf("failure threshold = %d", monitor.FailureThreshold)
	}
	if monitor.ResponseBodyLimitKB != 32 {
		t.Fatalf("response body limit = %d", monitor.ResponseBodyLimitKB)
	}
	if monitor.Variables == nil {
		t.Fatal("expected variables map")
	}
	if monitor.Steps == nil {
		t.Fatal("expected steps slice")
	}
	if monitor.AlertPolicy.Threshold != 3 {
		t.Fatalf("alert threshold = %d", monitor.AlertPolicy.Threshold)
	}
}
