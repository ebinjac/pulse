package elfanalytics

import (
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func DefaultLogFieldMapping() domain.LogFieldMapping {
	return domain.LogFieldMapping{
		Timestamp:         "@timestamp",
		Level:             "level",
		Service:           "service",
		Endpoint:          "endpoint",
		StatusCode:        "statusCode",
		ResponseTimeMs:    "responseTimeMs",
		ExceptionType:     "exceptionType",
		DownstreamService: "downstreamService",
		TraceID:           "traceId",
		Environment:       "environment",
		Message:           "message",
		Tags:              "tags",
	}
}

func ResolveMapping(application domain.Application, service *domain.ApplicationService) domain.LogFieldMapping {
	mapping := DefaultLogFieldMapping()
	mergeMapping(&mapping, application.LogFieldMapping)
	if service != nil {
		mergeMapping(&mapping, service.LogFieldMapping)
	}
	return mapping
}

func mergeMapping(base *domain.LogFieldMapping, override domain.LogFieldMapping) {
	if strings.TrimSpace(override.Timestamp) != "" {
		base.Timestamp = override.Timestamp
	}
	if strings.TrimSpace(override.Level) != "" {
		base.Level = override.Level
	}
	if strings.TrimSpace(override.Service) != "" {
		base.Service = override.Service
	}
	if strings.TrimSpace(override.Endpoint) != "" {
		base.Endpoint = override.Endpoint
	}
	if strings.TrimSpace(override.StatusCode) != "" {
		base.StatusCode = override.StatusCode
	}
	if strings.TrimSpace(override.ResponseTimeMs) != "" {
		base.ResponseTimeMs = override.ResponseTimeMs
	}
	if strings.TrimSpace(override.ExceptionType) != "" {
		base.ExceptionType = override.ExceptionType
	}
	if strings.TrimSpace(override.DownstreamService) != "" {
		base.DownstreamService = override.DownstreamService
	}
	if strings.TrimSpace(override.TraceID) != "" {
		base.TraceID = override.TraceID
	}
	if strings.TrimSpace(override.Environment) != "" {
		base.Environment = override.Environment
	}
	if strings.TrimSpace(override.Message) != "" {
		base.Message = override.Message
	}
	if strings.TrimSpace(override.Tags) != "" {
		base.Tags = override.Tags
	}
}

func aggField(field string) string {
	field = strings.TrimSpace(field)
	if field == "" {
		return ""
	}
	if strings.Contains(field, ".") {
		return field
	}
	return field + ".keyword"
}
