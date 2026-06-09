package elfsearch

import (
	"sort"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func BuildFieldSchema(
	hits []map[string]any,
	aggregations map[string]any,
	mapping domain.LogFieldMapping,
	existing domain.ElfFieldSchema,
) domain.ElfFieldSchema {
	discovered := InferFieldsFromHits(hits, mapping)
	aggPaths := inferAggregationPaths(aggregations)
	for _, path := range aggPaths {
		found := false
		for _, field := range discovered {
			if field.Path == path {
				found = true
				break
			}
		}
		if !found {
			discovered = append(discovered, InferredField{
				Path:       path,
				ValueType:  "string",
				Source:     "discovered",
			})
		}
	}

	merged := mergeFieldSchemas(existing, descriptorsFromInferred(discovered), inheritedFromMapping(mapping))
	if merged.TimeField == "" {
		merged.TimeField = firstNonEmptyField(mapping.Timestamp, "@timestamp")
		for _, field := range merged.Fields {
			if field.IsTimeField {
				merged.TimeField = field.Path
				break
			}
		}
	}
	merged.DiscoveredAt = time.Now().UTC()
	sortFieldDescriptors(merged.Fields)
	if len(merged.Fields) > 100 {
		merged.Fields = merged.Fields[:100]
	}
	return merged
}

func MergeEffectiveFieldSchema(
	application domain.Application,
	service *domain.ApplicationService,
	query domain.ElfQuery,
	discovered domain.ElfFieldSchema,
) domain.ElfFieldSchema {
	mapping := resolveProbeMapping(application, service, query)
	inherited := inheritedFromMapping(mapping)
	base := query.FieldSchema
	if len(base.Fields) == 0 {
		base = discovered
	} else {
		base = mergeFieldSchemas(base, descriptorsFromInferred(InferFieldsFromHits(nil, mapping)), inherited)
		base = mergeFieldSchemas(base, discovered.Fields, nil)
	}
	if base.TimeField == "" {
		base.TimeField = firstNonEmptyField(query.ProbeConfig.TimeField, query.FieldSchema.TimeField, mapping.Timestamp, "@timestamp")
	}
	return base
}

func descriptorsFromInferred(fields []InferredField) []domain.ElfFieldDescriptor {
	out := make([]domain.ElfFieldDescriptor, 0, len(fields))
	for _, field := range fields {
		out = append(out, field.Descriptor())
	}
	return out
}

func inheritedFromMapping(mapping domain.LogFieldMapping) []domain.ElfFieldDescriptor {
	roles := map[string]string{
		"timestamp": mapping.Timestamp, "level": mapping.Level, "message": mapping.Message,
		"service": mapping.Service, "endpoint": mapping.Endpoint, "statusCode": mapping.StatusCode,
		"responseTimeMs": mapping.ResponseTimeMs, "exceptionType": mapping.ExceptionType,
		"traceId": mapping.TraceID, "environment": mapping.Environment,
		"downstreamService": mapping.DownstreamService, "tags": mapping.Tags,
	}
	out := make([]domain.ElfFieldDescriptor, 0, len(roles))
	for role, path := range roles {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		valueType := "string"
		isTime := false
		if role == "timestamp" {
			valueType = "date"
			isTime = true
		} else if role == "responseTimeMs" || role == "statusCode" {
			valueType = "number"
		}
		out = append(out, domain.ElfFieldDescriptor{
			Path:          path,
			Label:         role,
			ValueType:     valueType,
			SuggestedRole: role,
			IsTimeField:   isTime,
			Source:        "inherited",
		})
	}
	return out
}

func mergeFieldSchemas(base domain.ElfFieldSchema, additions ...[]domain.ElfFieldDescriptor) domain.ElfFieldSchema {
	byPath := map[string]domain.ElfFieldDescriptor{}
	for _, field := range base.Fields {
		byPath[field.Path] = field
	}
	for _, group := range additions {
		for _, field := range group {
			path := strings.TrimSpace(field.Path)
			if path == "" {
				continue
			}
			field.Path = path
			existing, ok := byPath[path]
			if !ok {
				if field.Source == "" {
					field.Source = "discovered"
				}
				byPath[path] = field
				continue
			}
			if field.Label != "" {
				existing.Label = field.Label
			}
			if field.ValueType != "" && field.ValueType != "unknown" {
				existing.ValueType = field.ValueType
			}
			if len(field.SampleValues) > 0 {
				existing.SampleValues = field.SampleValues
			}
			if field.SuggestedRole != "" {
				existing.SuggestedRole = field.SuggestedRole
			}
			if field.IsTimeField {
				existing.IsTimeField = true
			}
			if existing.Source == "" {
				existing.Source = field.Source
			}
			byPath[path] = existing
		}
	}
	merged := domain.ElfFieldSchema{TimeField: base.TimeField, DiscoveredAt: base.DiscoveredAt}
	merged.Fields = make([]domain.ElfFieldDescriptor, 0, len(byPath))
	for _, field := range byPath {
		merged.Fields = append(merged.Fields, field)
	}
	sortFieldDescriptors(merged.Fields)
	return merged
}

func sortFieldDescriptors(fields []domain.ElfFieldDescriptor) {
	sort.Slice(fields, func(i, j int) bool {
		if len(fields[i].Path) != len(fields[j].Path) {
			return len(fields[i].Path) > len(fields[j].Path)
		}
		return fields[i].Path < fields[j].Path
	})
}

func inferAggregationPaths(aggregations map[string]any) []string {
	if len(aggregations) == 0 {
		return nil
	}
	paths := make([]string, 0)
	var walk func(prefix string, node any)
	walk = func(prefix string, node any) {
		switch typed := node.(type) {
		case map[string]any:
			if field, ok := typed["field"].(string); ok && strings.TrimSpace(field) != "" {
				paths = append(paths, field)
			}
			for key, child := range typed {
				next := key
				if prefix != "" {
					next = prefix + "." + key
				}
				walk(next, child)
			}
		}
	}
	for key, value := range aggregations {
		walk(key, value)
	}
	return paths
}

func DescriptorByPath(schema domain.ElfFieldSchema, path string) (domain.ElfFieldDescriptor, bool) {
	for _, field := range schema.Fields {
		if field.Path == path {
			return field, true
		}
	}
	return domain.ElfFieldDescriptor{}, false
}
