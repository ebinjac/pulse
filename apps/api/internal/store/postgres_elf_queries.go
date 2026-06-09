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

func (s *PostgresStore) ListElfQueries(applicationID string) []domain.ElfQuery {
	rows, err := s.queries.ListElfQueries(context.Background(), pgNullableText(applicationID))
	if err != nil {
		log.Printf("list elf queries: %v", err)
		return nil
	}
	queries := make([]domain.ElfQuery, 0, len(rows))
	for _, row := range rows {
		queries = append(queries, elfQueryFromListRow(row))
	}
	return queries
}

func (s *PostgresStore) GetElfQuery(id string) (domain.ElfQuery, bool) {
	row, err := s.queries.GetElfQuery(context.Background(), id)
	if err != nil {
		return domain.ElfQuery{}, false
	}
	return elfQueryFromGetRow(row), true
}

func (s *PostgresStore) UpsertElfQuery(query domain.ElfQuery) domain.ElfQuery {
	now := time.Now().UTC()
	if query.ID == "" {
		query.ID = "elfq-" + randomID()
	}
	if query.CreatedAt.IsZero() {
		query.CreatedAt = now
	}
	query.UpdatedAt = now
	if query.GateMode == "" {
		query.GateMode = "advisory"
	}
	if query.Tags == nil {
		query.Tags = []string{}
	}
	if len(query.SearchBody) == 0 {
		query.SearchBody = json.RawMessage(`{}`)
	}
	if query.SignalType == "" {
		query.SignalType = "custom"
	}
	if query.CheckKind == "" {
		query.CheckKind = "raw"
	}

	if err := s.queries.UpsertElfQuery(context.Background(), pulsedb.UpsertElfQueryParams{
		ID:                      query.ID,
		Name:                    query.Name,
		Description:             pgText(query.Description),
		ElfAppID:                pgNullableText(query.ElfAppID),
		IndexPathTemplate:       pgNullableText(query.IndexPathTemplate),
		SearchBodyJson:          query.SearchBody,
		GateMode:                query.GateMode,
		PassCriteriaJson:        mustJSON(query.PassCriteria),
		ApplicationID:           pgNullableText(query.ApplicationID),
		SignalType:              query.SignalType,
		ComparisonConfigJson:    mustJSON(query.ComparisonConfig),
		ServiceID:               pgNullableText(query.ServiceID),
		ProbeConfigJson:         mustJSON(query.ProbeConfig),
		FieldMappingJson:        mustJSON(query.FieldMapping),
		FieldSchemaJson:         mustJSON(query.FieldSchema),
		CheckKind:               query.CheckKind,
		CheckConfigJson:         mustJSON(query.CheckConfig),
		GeneratedSearchBodyJson: nullableJSON(query.GeneratedSearchBody),
		LastProbeAt:             pgNullableTimestamp(query.LastProbeAt),
		LastProbeSummaryJson:    mustJSON(query.LastProbeSummary),
		TagsJson:                mustJSON(query.Tags),
		IsActive:                query.IsActive,
		CreatedAt:               pgTimestamp(query.CreatedAt),
		UpdatedAt:               pgTimestamp(query.UpdatedAt),
	}); err != nil {
		log.Printf("upsert elf query: %v", err)
	}
	return query
}

func (s *PostgresStore) DeleteElfQuery(id string) bool {
	count, err := s.queries.DeleteElfQuery(context.Background(), id)
	if err != nil {
		log.Printf("delete elf query: %v", err)
		return false
	}
	return count > 0
}

func elfQueryFromListRow(row pulsedb.ListElfQueriesRow) domain.ElfQuery {
	return elfQueryFromFields(
		row.ID, row.Name, row.Description, row.ElfAppID, row.IndexPathTemplate,
		row.SearchBodyJson, row.GateMode, row.PassCriteriaJson, row.SignalType,
		row.ComparisonConfigJson, row.ServiceID, row.ProbeConfigJson, row.FieldMappingJson,
		row.FieldSchemaJson, row.CheckKind, row.CheckConfigJson, row.GeneratedSearchBodyJson,
		row.LastProbeAt, row.LastProbeSummaryJson, row.TagsJson, row.ApplicationID,
		row.IsActive, row.CreatedAt, row.UpdatedAt,
	)
}

func elfQueryFromGetRow(row pulsedb.GetElfQueryRow) domain.ElfQuery {
	return elfQueryFromFields(
		row.ID, row.Name, row.Description, row.ElfAppID, row.IndexPathTemplate,
		row.SearchBodyJson, row.GateMode, row.PassCriteriaJson, row.SignalType,
		row.ComparisonConfigJson, row.ServiceID, row.ProbeConfigJson, row.FieldMappingJson,
		row.FieldSchemaJson, row.CheckKind, row.CheckConfigJson, row.GeneratedSearchBodyJson,
		row.LastProbeAt, row.LastProbeSummaryJson, row.TagsJson, row.ApplicationID,
		row.IsActive, row.CreatedAt, row.UpdatedAt,
	)
}

func elfQueryFromFields(
	id, name, description, elfAppID, indexPathTemplate string,
	searchBody []byte,
	gateMode string,
	passCriteriaJSON []byte,
	signalType string,
	comparisonConfigJSON []byte,
	serviceID string,
	probeConfigJSON []byte,
	fieldMappingJSON []byte,
	fieldSchemaJSON []byte,
	checkKind string,
	checkConfigJSON []byte,
	generatedSearchBodyJSON []byte,
	lastProbeAt pgtype.Timestamp,
	lastProbeSummaryJSON []byte,
	tagsJSON []byte,
	applicationID string,
	isActive bool,
	createdAt, updatedAt pgtype.Timestamp,
) domain.ElfQuery {
	query := domain.ElfQuery{
		ID:                id,
		Name:              name,
		Description:       description,
		ElfAppID:          elfAppID,
		IndexPathTemplate: indexPathTemplate,
		SearchBody:        json.RawMessage(searchBody),
		GateMode:          gateMode,
		SignalType:        signalType,
		ServiceID:         serviceID,
		CheckKind:         checkKind,
		ApplicationID:     applicationID,
		IsActive:          isActive,
		CreatedAt:         pgTime(createdAt),
		UpdatedAt:         pgTime(updatedAt),
	}
	if len(generatedSearchBodyJSON) > 0 {
		query.GeneratedSearchBody = json.RawMessage(generatedSearchBodyJSON)
	}
	if lastProbeAt.Valid {
		t := pgTime(lastProbeAt)
		query.LastProbeAt = &t
	}
	_ = json.Unmarshal(passCriteriaJSON, &query.PassCriteria)
	_ = json.Unmarshal(comparisonConfigJSON, &query.ComparisonConfig)
	_ = json.Unmarshal(probeConfigJSON, &query.ProbeConfig)
	_ = json.Unmarshal(fieldMappingJSON, &query.FieldMapping)
	_ = json.Unmarshal(fieldSchemaJSON, &query.FieldSchema)
	_ = json.Unmarshal(checkConfigJSON, &query.CheckConfig)
	_ = json.Unmarshal(lastProbeSummaryJSON, &query.LastProbeSummary)
	_ = json.Unmarshal(tagsJSON, &query.Tags)
	if query.Tags == nil {
		query.Tags = []string{}
	}
	if query.GateMode == "" {
		query.GateMode = "advisory"
	}
	if query.SignalType == "" {
		query.SignalType = "custom"
	}
	if query.CheckKind == "" {
		query.CheckKind = "raw"
	}
	return query
}

func nullableJSON(raw json.RawMessage) []byte {
	if len(raw) == 0 {
		return nil
	}
	return raw
}

func pgNullableTimestamp(value *time.Time) pgtype.Timestamp {
	if value == nil || value.IsZero() {
		return pgtype.Timestamp{}
	}
	return pgTimestamp(*value)
}
