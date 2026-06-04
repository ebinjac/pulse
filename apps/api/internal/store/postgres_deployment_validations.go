package store

import (
	"context"
	"encoding/json"
	"log"
	"time"

	pulsedb "github.com/ensemble-pulse/pulse/apps/api/internal/db"
	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5/pgtype"
)

func (s *PostgresStore) ListDeploymentValidations(applicationID string) []domain.DeploymentValidation {
	rows, err := s.queries.ListDeploymentValidations(context.Background(), pgNullableText(applicationID))
	if err != nil {
		log.Printf("list deployment validations: %v", err)
		return nil
	}

	validations := make([]domain.DeploymentValidation, 0, len(rows))
	for _, row := range rows {
		validations = append(validations, deploymentValidationFromListRow(row))
	}
	return validations
}

func (s *PostgresStore) GetDeploymentValidation(id string) (domain.DeploymentValidation, bool) {
	row, err := s.queries.GetDeploymentValidation(context.Background(), id)
	if err != nil {
		return domain.DeploymentValidation{}, false
	}
	return deploymentValidationFromGetRow(row), true
}

func (s *PostgresStore) CreateDeploymentValidation(validation domain.DeploymentValidation) domain.DeploymentValidation {
	if validation.ID == "" {
		validation.ID = "depval-" + randomID()
	}
	if validation.Status == "" {
		validation.Status = domain.DeploymentValidationDraft
	}
	if validation.CreatedAt.IsZero() {
		validation.CreatedAt = time.Now().UTC()
	}
	validation.UpdatedAt = time.Now().UTC()
	if validation.MonitorIDs == nil {
		validation.MonitorIDs = []string{}
	}
	if validation.SampleCount <= 0 {
		validation.SampleCount = 30
	}
	if validation.IntervalSeconds < 0 {
		validation.IntervalSeconds = 0
	}
	if validation.DeploymentStartedAt == nil {
		deploymentStartedAt := validation.CreatedAt
		validation.DeploymentStartedAt = &deploymentStartedAt
	}
	if validation.BaselineWindowHours <= 0 {
		validation.BaselineWindowHours = 24
	}
	if validation.BaselineRunCount <= 0 {
		validation.BaselineRunCount = 30
	}
	if err := s.upsertDeploymentValidation(validation); err != nil {
		log.Printf("create deployment validation: %v", err)
	}
	return validation
}

func (s *PostgresStore) UpdateDeploymentValidation(validation domain.DeploymentValidation) domain.DeploymentValidation {
	if existing, ok := s.GetDeploymentValidation(validation.ID); ok && validation.CreatedAt.IsZero() {
		validation.CreatedAt = existing.CreatedAt
	}
	if validation.CreatedAt.IsZero() {
		validation.CreatedAt = time.Now().UTC()
	}
	validation.UpdatedAt = time.Now().UTC()
	if validation.MonitorIDs == nil {
		validation.MonitorIDs = []string{}
	}
	if validation.SampleCount <= 0 {
		validation.SampleCount = 30
	}
	if validation.IntervalSeconds < 0 {
		validation.IntervalSeconds = 0
	}
	if validation.DeploymentStartedAt == nil {
		deploymentStartedAt := validation.CreatedAt
		validation.DeploymentStartedAt = &deploymentStartedAt
	}
	if validation.BaselineWindowHours <= 0 {
		validation.BaselineWindowHours = 24
	}
	if validation.BaselineRunCount <= 0 {
		validation.BaselineRunCount = 30
	}
	if err := s.upsertDeploymentValidation(validation); err != nil {
		log.Printf("update deployment validation: %v", err)
	}
	return validation
}

func (s *PostgresStore) LinkDeploymentValidationRun(validationID string, phase domain.DeploymentValidationPhase, monitorID string, runID string) {
	if err := s.queries.LinkDeploymentValidationRun(context.Background(), pulsedb.LinkDeploymentValidationRunParams{
		ValidationID: validationID,
		Phase:        string(phase),
		MonitorID:    monitorID,
		RunID:        runID,
	}); err != nil {
		log.Printf("link deployment validation run: %v", err)
	}
}

func (s *PostgresStore) ListDeploymentValidationRuns(validationID string, phase domain.DeploymentValidationPhase) []domain.MonitorRun {
	rows, err := s.queries.ListDeploymentValidationRuns(context.Background(), pulsedb.ListDeploymentValidationRunsParams{
		ValidationID: validationID,
		Phase:        string(phase),
	})
	if err != nil {
		log.Printf("list deployment validation runs: %v", err)
		return nil
	}

	runs := make([]domain.MonitorRun, 0, len(rows))
	for _, row := range rows {
		run := runFromDeploymentValidationRunRow(row)
		run.Steps = s.listStepRuns(run.ID)
		runs = append(runs, run)
	}
	return runs
}

func (s *PostgresStore) upsertDeploymentValidation(validation domain.DeploymentValidation) error {
	return s.queries.UpsertDeploymentValidation(context.Background(), pulsedb.UpsertDeploymentValidationParams{
		ID:                  validation.ID,
		ApplicationID:       pgNullableText(validation.ApplicationID),
		ApplicationName:     validation.ApplicationName,
		CarID:               validation.CarID,
		Name:                validation.Name,
		Version:             pgNullableText(validation.Version),
		BuildID:             pgNullableText(validation.BuildID),
		Environment:         pgNullableText(validation.Environment),
		Status:              string(validation.Status),
		MonitorIdsJson:      mustJSON(validation.MonitorIDs),
		ReportJson:          mustJSON(validation.Report),
		AiReportJson:        mustJSON(validation.AIReport),
		SampleCount:         int32(validation.SampleCount),
		IntervalSeconds:     int32(validation.IntervalSeconds),
		DeploymentStartedAt: pgTimestampPtr(validation.DeploymentStartedAt),
		BaselineWindowHours: int32(validation.BaselineWindowHours),
		BaselineRunCount:    int32(validation.BaselineRunCount),
		PreStartedAt:        pgTimestampPtr(validation.PreStartedAt),
		PreCompletedAt:      pgTimestampPtr(validation.PreCompletedAt),
		PostStartedAt:       pgTimestampPtr(validation.PostStartedAt),
		PostCompletedAt:     pgTimestampPtr(validation.PostCompletedAt),
		CreatedAt:           pgTimestamp(validation.CreatedAt),
		UpdatedAt:           pgTimestamp(validation.UpdatedAt),
	})
}

func deploymentValidationFromListRow(row pulsedb.ListDeploymentValidationsRow) domain.DeploymentValidation {
	return deploymentValidationFromFields(
		row.ID,
		row.ApplicationID,
		row.ApplicationName,
		row.CarID,
		row.Name,
		row.Version,
		row.BuildID,
		row.Environment,
		row.Status,
		row.MonitorIdsJson,
		row.ReportJson,
		row.AiReportJson,
		int(row.SampleCount),
		int(row.IntervalSeconds),
		row.DeploymentStartedAt,
		int(row.BaselineWindowHours),
		int(row.BaselineRunCount),
		row.PreStartedAt,
		row.PreCompletedAt,
		row.PostStartedAt,
		row.PostCompletedAt,
		row.CreatedAt,
		row.UpdatedAt,
	)
}

func deploymentValidationFromGetRow(row pulsedb.GetDeploymentValidationRow) domain.DeploymentValidation {
	return deploymentValidationFromFields(
		row.ID,
		row.ApplicationID,
		row.ApplicationName,
		row.CarID,
		row.Name,
		row.Version,
		row.BuildID,
		row.Environment,
		row.Status,
		row.MonitorIdsJson,
		row.ReportJson,
		row.AiReportJson,
		int(row.SampleCount),
		int(row.IntervalSeconds),
		row.DeploymentStartedAt,
		int(row.BaselineWindowHours),
		int(row.BaselineRunCount),
		row.PreStartedAt,
		row.PreCompletedAt,
		row.PostStartedAt,
		row.PostCompletedAt,
		row.CreatedAt,
		row.UpdatedAt,
	)
}

func deploymentValidationFromFields(id, applicationID, applicationName, carID, name, version, buildID, environment, status string, monitorIDsJSON, reportJSON, aiReportJSON []byte, sampleCount, intervalSeconds int, deploymentStartedAt pgtype.Timestamp, baselineWindowHours, baselineRunCount int, preStartedAt, preCompletedAt, postStartedAt, postCompletedAt, createdAt, updatedAt pgtype.Timestamp) domain.DeploymentValidation {
	validation := domain.DeploymentValidation{
		ID:                  id,
		ApplicationID:       applicationID,
		ApplicationName:     applicationName,
		CarID:               carID,
		Name:                name,
		Version:             version,
		BuildID:             buildID,
		Environment:         environment,
		Status:              domain.DeploymentValidationStatus(status),
		SampleCount:         sampleCount,
		IntervalSeconds:     intervalSeconds,
		DeploymentStartedAt: pgTimePtr(deploymentStartedAt),
		BaselineWindowHours: baselineWindowHours,
		BaselineRunCount:    baselineRunCount,
		CreatedAt:           pgTime(createdAt),
		UpdatedAt:           pgTime(updatedAt),
		PreStartedAt:        pgTimePtr(preStartedAt),
		PreCompletedAt:      pgTimePtr(preCompletedAt),
		PostStartedAt:       pgTimePtr(postStartedAt),
		PostCompletedAt:     pgTimePtr(postCompletedAt),
	}
	_ = json.Unmarshal(monitorIDsJSON, &validation.MonitorIDs)
	_ = json.Unmarshal(reportJSON, &validation.Report)
	_ = json.Unmarshal(aiReportJSON, &validation.AIReport)
	if validation.MonitorIDs == nil {
		validation.MonitorIDs = []string{}
	}
	if validation.SampleCount <= 0 {
		validation.SampleCount = 30
	}
	if validation.DeploymentStartedAt == nil {
		deploymentStartedAt := validation.CreatedAt
		if deploymentStartedAt.IsZero() {
			deploymentStartedAt = time.Now().UTC()
		}
		validation.DeploymentStartedAt = &deploymentStartedAt
	}
	if validation.BaselineWindowHours <= 0 {
		validation.BaselineWindowHours = 24
	}
	if validation.BaselineRunCount <= 0 {
		validation.BaselineRunCount = 30
	}
	return validation
}

func runFromDeploymentValidationRunRow(row pulsedb.ListDeploymentValidationRunsRow) domain.MonitorRun {
	return domain.MonitorRun{
		ID:              row.ID,
		MonitorID:       pgTextString(row.MonitorID),
		MonitorName:     row.MonitorName,
		Status:          domain.MonitorStatus(row.Status),
		FailureCategory: domain.FailureCategory(row.FailureCategory),
		FailureReason:   row.FailureReason,
		TriggeredBy:     row.TriggeredBy,
		StartedAt:       pgTime(row.StartedAt),
		EndedAt:         pgTime(row.EndedAt),
		DurationMS:      int(row.DurationMs),
	}
}
