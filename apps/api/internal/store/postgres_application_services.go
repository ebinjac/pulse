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

func (s *PostgresStore) ListApplicationServices(applicationID string) []domain.ApplicationService {
	rows, err := s.queries.ListApplicationServices(context.Background(), applicationID)
	if err != nil {
		log.Printf("list application services: %v", err)
		return nil
	}
	services := make([]domain.ApplicationService, 0, len(rows))
	for _, row := range rows {
		services = append(services, applicationServiceFromListRow(row))
	}
	return services
}

func (s *PostgresStore) GetApplicationService(id string) (domain.ApplicationService, bool) {
	row, err := s.queries.GetApplicationService(context.Background(), id)
	if err != nil {
		return domain.ApplicationService{}, false
	}
	return applicationServiceFromGetRow(row), true
}

func (s *PostgresStore) UpsertApplicationService(service domain.ApplicationService) domain.ApplicationService {
	now := time.Now().UTC()
	if service.ID == "" {
		service.ID = "svc-" + randomID()
	}
	if service.CreatedAt.IsZero() {
		service.CreatedAt = now
	}
	service.UpdatedAt = now

	if err := s.queries.UpsertApplicationService(context.Background(), pulsedb.UpsertApplicationServiceParams{
		ID:                  service.ID,
		ApplicationID:       service.ApplicationID,
		Name:                service.Name,
		LogServiceName:      service.LogServiceName,
		Squad:               pgNullableText(service.Squad),
		Owner:               pgNullableText(service.Owner),
		Environment:         pgNullableText(service.Environment),
		ElfAppID:            pgNullableText(service.ElfAppID),
		IndexPathTemplate:   pgNullableText(service.IndexPathTemplate),
		LogFieldMappingJson: mustJSON(service.LogFieldMapping),
		IsActive:            service.IsActive,
		CreatedAt:           pgTimestamp(service.CreatedAt),
		UpdatedAt:           pgTimestamp(service.UpdatedAt),
	}); err != nil {
		log.Printf("upsert application service: %v", err)
	}
	return service
}

func (s *PostgresStore) DeleteApplicationService(id string) bool {
	count, err := s.queries.DeleteApplicationService(context.Background(), id)
	if err != nil {
		log.Printf("delete application service: %v", err)
		return false
	}
	return count > 0
}

func applicationServiceFromListRow(row pulsedb.ListApplicationServicesRow) domain.ApplicationService {
	return applicationServiceFromFields(
		row.ID,
		row.ApplicationID,
		row.Name,
		row.LogServiceName,
		row.Squad,
		row.Owner,
		row.Environment,
		row.ElfAppID,
		row.IndexPathTemplate,
		row.LogFieldMappingJson,
		row.IsActive,
		row.CreatedAt,
		row.UpdatedAt,
	)
}

func applicationServiceFromGetRow(row pulsedb.GetApplicationServiceRow) domain.ApplicationService {
	return applicationServiceFromFields(
		row.ID,
		row.ApplicationID,
		row.Name,
		row.LogServiceName,
		row.Squad,
		row.Owner,
		row.Environment,
		row.ElfAppID,
		row.IndexPathTemplate,
		row.LogFieldMappingJson,
		row.IsActive,
		row.CreatedAt,
		row.UpdatedAt,
	)
}

func applicationServiceFromFields(id, applicationID, name, logServiceName, squad, owner, environment, elfAppID, indexPathTemplate string, mappingJSON []byte, isActive bool, createdAt, updatedAt pgtype.Timestamp) domain.ApplicationService {
	service := domain.ApplicationService{
		ID:                id,
		ApplicationID:     applicationID,
		Name:              name,
		LogServiceName:    logServiceName,
		Squad:             squad,
		Owner:             owner,
		Environment:       environment,
		ElfAppID:          elfAppID,
		IndexPathTemplate: indexPathTemplate,
		IsActive:       isActive,
		CreatedAt:      pgTime(createdAt),
		UpdatedAt:      pgTime(updatedAt),
	}
	_ = json.Unmarshal(mappingJSON, &service.LogFieldMapping)
	return service
}
