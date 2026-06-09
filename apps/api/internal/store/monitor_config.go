package store

import (
	"encoding/json"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type monitorConfigSnapshot struct {
	ApplicationID       string                   `json:"applicationId,omitempty"`
	Name                string                   `json:"name"`
	Description         string                   `json:"description"`
	ScheduleMode        string                   `json:"scheduleMode,omitempty"`
	ScheduleLabel       string                   `json:"scheduleLabel,omitempty"`
	Cron                string                   `json:"cron,omitempty"`
	ScheduleCron        string                   `json:"scheduleCron,omitempty"`
	Timezone            string                   `json:"timezone"`
	TimeoutMS           int                      `json:"timeoutMs"`
	RetryCount          int                      `json:"retryCount"`
	FailureThreshold    int                      `json:"failureThreshold"`
	ResponseBodyLimitKB int                      `json:"responseBodyLimitKb"`
	IsActive            bool                     `json:"isActive"`
	AlertEnabled        bool                     `json:"alertEnabled"`
	Variables           map[string]string        `json:"variables"`
	SecretAliases       []string                 `json:"secretAliases"`
	Steps               []domain.MonitorStep     `json:"steps"`
	AlertPolicy         domain.AlertPolicy       `json:"alertPolicy,omitempty"`
}

func marshalMonitorConfig(monitor domain.Monitor) ([]byte, error) {
	monitor = NormalizeMonitor(monitor)
	snapshot := monitorConfigSnapshot{
		ApplicationID:       monitor.ApplicationID,
		Name:                monitor.Name,
		Description:         monitor.Description,
		ScheduleMode:        monitor.ScheduleMode,
		ScheduleLabel:       monitor.ScheduleLabel,
		Cron:                monitor.Cron,
		ScheduleCron:        monitor.ScheduleCron,
		Timezone:            monitor.Timezone,
		TimeoutMS:           monitor.TimeoutMS,
		RetryCount:          monitor.RetryCount,
		FailureThreshold:    monitor.FailureThreshold,
		ResponseBodyLimitKB: monitor.ResponseBodyLimitKB,
		IsActive:            monitor.IsActive,
		AlertEnabled:        monitor.AlertEnabled,
		Variables:           monitor.Variables,
		SecretAliases:       monitor.SecretAliases,
		Steps:               monitor.Steps,
		AlertPolicy:         monitor.AlertPolicy,
	}
	return json.Marshal(snapshot)
}

func unmarshalMonitorConfig(monitorID string, payload []byte, published domain.Monitor) (domain.Monitor, error) {
	var snapshot monitorConfigSnapshot
	if err := json.Unmarshal(payload, &snapshot); err != nil {
		return domain.Monitor{}, err
	}

	monitor := domain.Monitor{
		ID:                  monitorID,
		ApplicationID:       snapshot.ApplicationID,
		Name:                snapshot.Name,
		Description:         snapshot.Description,
		ScheduleMode:        snapshot.ScheduleMode,
		ScheduleLabel:       snapshot.ScheduleLabel,
		Cron:                snapshot.Cron,
		ScheduleCron:        snapshot.ScheduleCron,
		Timezone:            snapshot.Timezone,
		TimeoutMS:           snapshot.TimeoutMS,
		RetryCount:          snapshot.RetryCount,
		FailureThreshold:    snapshot.FailureThreshold,
		ResponseBodyLimitKB: snapshot.ResponseBodyLimitKB,
		IsActive:            snapshot.IsActive,
		AlertEnabled:        snapshot.AlertEnabled,
		Variables:           snapshot.Variables,
		SecretAliases:       snapshot.SecretAliases,
		Steps:               snapshot.Steps,
		AlertPolicy:         snapshot.AlertPolicy,
		Status:              published.Status,
		LastRunAt:           published.LastRunAt,
		LastDurationMS:      published.LastDurationMS,
		SuccessRate24H:      published.SuccessRate24H,
		PublishedVersion:    published.PublishedVersion,
		HasUnpublishedDraft: published.HasUnpublishedDraft,
		CreatedAt:           published.CreatedAt,
		UpdatedAt:           published.UpdatedAt,
	}

	return storeDefaults(NormalizeMonitor(monitor)), nil
}

// NormalizeMonitor applies shared defaults used by both MemoryStore and PostgresStore.
func NormalizeMonitor(monitor domain.Monitor) domain.Monitor {
	if monitor.ScheduleCron == "" {
		monitor.ScheduleCron = monitor.Cron
	}
	if monitor.Cron == "" {
		monitor.Cron = monitor.ScheduleCron
	}
	if monitor.ScheduleLabel == "" && monitor.Cron != "" {
		monitor.ScheduleLabel = "Custom cron"
	}
	if monitor.ScheduleMode == "" && monitor.Cron != "" {
		monitor.ScheduleMode = "custom-cron"
	}
	if monitor.Timezone == "" {
		monitor.Timezone = "UTC"
	}
	if monitor.TimeoutMS == 0 {
		monitor.TimeoutMS = 30000
	}
	if monitor.FailureThreshold == 0 {
		monitor.FailureThreshold = 3
	}
	if monitor.ResponseBodyLimitKB == 0 {
		monitor.ResponseBodyLimitKB = 32
	}
	if monitor.Status == "" {
		monitor.Status = domain.StatusSkipped
	}
	if monitor.Variables == nil {
		monitor.Variables = map[string]string{}
	}
	if monitor.Steps == nil {
		monitor.Steps = []domain.MonitorStep{}
	}
	if monitor.AlertPolicy.Threshold == 0 {
		monitor.AlertPolicy.Threshold = monitor.FailureThreshold
	}

	return monitor
}
