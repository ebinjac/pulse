package events

import (
	"context"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func PublishValidationStatusChanged(pub Publisher, validationID string, status domain.DeploymentValidationStatus) {
	if pub == nil {
		return
	}
	_ = pub.Publish(context.Background(), TopicValidation(validationID), TypeValidationStatusChanged, map[string]any{
		"validationId": validationID,
		"status":       string(status),
	})
}

func PublishValidationRunLinked(
	pub Publisher,
	validationID string,
	phase domain.DeploymentValidationPhase,
	monitorID, runID string,
	runStatus domain.MonitorStatus,
) {
	if pub == nil {
		return
	}
	_ = pub.Publish(context.Background(), TopicValidation(validationID), TypeValidationRunLinked, map[string]any{
		"validationId": validationID,
		"phase":        string(phase),
		"monitorId":    monitorID,
		"runId":        runID,
		"runStatus":    string(runStatus),
	})
}

func PublishValidationReportUpdated(pub Publisher, validationID string, status domain.DeploymentValidationStatus) {
	if pub == nil {
		return
	}
	_ = pub.Publish(context.Background(), TopicValidation(validationID), TypeValidationReportUpdated, map[string]any{
		"validationId": validationID,
		"status":       string(status),
	})
}

func PublishRunQueued(pub Publisher, applicationID, batchID, monitorID string) {
	if pub == nil || batchID == "" {
		return
	}
	_ = pub.Publish(context.Background(), TopicApplicationRunBatch(applicationID, batchID), TypeRunQueued, map[string]any{
		"applicationId": applicationID,
		"batchId":       batchID,
		"monitorId":     monitorID,
	})
}

func PublishRunCompleted(
	pub Publisher,
	applicationID, batchID, monitorID, runID string,
	status domain.MonitorStatus,
	durationMS int,
	failureReason string,
) {
	if pub == nil || batchID == "" {
		return
	}
	_ = pub.Publish(context.Background(), TopicApplicationRunBatch(applicationID, batchID), TypeRunCompleted, map[string]any{
		"applicationId": applicationID,
		"batchId":       batchID,
		"monitorId":     monitorID,
		"runId":         runID,
		"status":        string(status),
		"durationMs":    durationMS,
		"failureReason": failureReason,
	})
}

func PublishAlertCreated(pub Publisher, alert domain.AlertEvent) {
	if pub == nil {
		return
	}
	_ = pub.Publish(context.Background(), TopicAlerts(), TypeAlertCreated, map[string]any{"alert": alert})
}

func PublishAlertAcknowledged(pub Publisher, alert domain.AlertEvent) {
	if pub == nil {
		return
	}
	_ = pub.Publish(context.Background(), TopicAlerts(), TypeAlertAcknowledged, map[string]any{"alert": alert})
}

func PublishAlertResolved(pub Publisher, monitorID string, resolvedAt any) {
	if pub == nil {
		return
	}
	_ = pub.Publish(context.Background(), TopicAlerts(), TypeAlertResolved, map[string]any{
		"monitorId":  monitorID,
		"resolvedAt": resolvedAt,
	})
}
