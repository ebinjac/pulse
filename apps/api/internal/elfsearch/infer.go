package elfsearch

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type InferredField struct {
	Path          string   `json:"path"`
	Label         string   `json:"label,omitempty"`
	ValueType     string   `json:"valueType,omitempty"`
	SampleValues  []string `json:"sampleValues"`
	SuggestedRole string   `json:"suggestedRole,omitempty"`
	IsTimeField   bool     `json:"isTimeField,omitempty"`
	Source        string   `json:"source,omitempty"`
}

func (f InferredField) Descriptor() domain.ElfFieldDescriptor {
	return domain.ElfFieldDescriptor{
		Path:          f.Path,
		Label:         f.Label,
		ValueType:     f.ValueType,
		SampleValues:  f.SampleValues,
		SuggestedRole: f.SuggestedRole,
		IsTimeField:   f.IsTimeField,
		Source:        f.Source,
	}
}

var roleMatchers = []struct {
	role  string
	match func(path string) bool
	score int
}{
	{"timestamp", matchTimestampField, 10},
	{"level", matchLevelField, 8},
	{"message", matchMessageField, 8},
	{"exceptionType", matchExceptionField, 7},
	{"responseTimeMs", matchLatencyField, 7},
	{"statusCode", matchStatusCodeField, 6},
	{"service", matchServiceField, 6},
	{"endpoint", matchEndpointField, 5},
	{"traceId", matchTraceField, 5},
}

func InferFieldsFromHits(hits []map[string]any, mapping domain.LogFieldMapping) []InferredField {
	flat := map[string][]string{}
	for _, hit := range hits {
		walkSource("", hit, flat)
	}

	fields := make([]InferredField, 0, len(flat))
	for path, values := range flat {
		samples := values
		if len(samples) > 3 {
			samples = samples[:3]
		}
		valueType := inferValueType(path, samples)
		role := suggestRole(path, samples, mapping)
		fields = append(fields, InferredField{
			Path:          path,
			ValueType:     valueType,
			SampleValues:  samples,
			SuggestedRole: role,
			IsTimeField:   valueType == "date" || role == "timestamp" || matchTimestampField(path),
			Source:        "discovered",
		})
	}
	sort.Slice(fields, func(i, j int) bool {
		if len(fields[i].Path) != len(fields[j].Path) {
			return len(fields[i].Path) > len(fields[j].Path)
		}
		return fields[i].Path < fields[j].Path
	})
	if len(fields) > 100 {
		fields = fields[:100]
	}
	return fields
}

func inferValueType(path string, values []string) string {
	if matchTimestampField(path) {
		return "date"
	}
	if len(values) == 0 {
		return "unknown"
	}
	dateCount, numberCount, boolCount := 0, 0, 0
	for _, value := range values {
		switch classifyValue(value) {
		case "date":
			dateCount++
		case "number":
			numberCount++
		case "boolean":
			boolCount++
		}
	}
	total := len(values)
	if dateCount == total {
		return "date"
	}
	if numberCount == total {
		return "number"
	}
	if boolCount == total {
		return "boolean"
	}
	return "string"
}

func classifyValue(value string) string {
	value = strings.TrimSpace(value)
	switch strings.ToLower(value) {
	case "true", "false":
		return "boolean"
	}
	if _, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return "date"
	}
	if _, err := time.Parse(time.RFC3339, value); err == nil {
		return "date"
	}
	if _, err := strconv.ParseFloat(value, 64); err == nil {
		return "number"
	}
	return "string"
}

func walkSource(prefix string, value any, out map[string][]string) {
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			path := key
			if prefix != "" {
				path = prefix + "." + key
			}
			walkSource(path, child, out)
		}
	case []any:
		if len(typed) > 0 {
			walkSource(prefix, typed[0], out)
		}
	default:
		if prefix == "" {
			return
		}
		text := fmt.Sprint(typed)
		if strings.TrimSpace(text) == "" {
			return
		}
		values := out[prefix]
		if len(values) < 5 {
			out[prefix] = append(values, truncate(text, 120))
		}
	}
}

func suggestRole(path string, values []string, mapping domain.LogFieldMapping) string {
	if mapped := roleFromMapping(path, mapping); mapped != "" {
		return mapped
	}
	bestRole := ""
	bestScore := 0
	for _, matcher := range roleMatchers {
		if !matcher.match(path) {
			continue
		}
		score := matcher.score
		if roleLooksLike(path, values, matcher.role) {
			score += 3
		}
		if score > bestScore {
			bestScore = score
			bestRole = matcher.role
		}
	}
	return bestRole
}

func roleFromMapping(path string, mapping domain.LogFieldMapping) string {
	checks := map[string]string{
		mapping.Timestamp: "timestamp", mapping.Level: "level", mapping.Message: "message",
		mapping.ExceptionType: "exceptionType", mapping.ResponseTimeMs: "responseTimeMs",
		mapping.StatusCode: "statusCode", mapping.Service: "service", mapping.Endpoint: "endpoint",
		mapping.TraceID: "traceId", mapping.DownstreamService: "downstreamService",
		mapping.Environment: "environment", mapping.Tags: "tags",
	}
	for mappedPath, role := range checks {
		if mappedPath != "" && strings.EqualFold(mappedPath, path) {
			return role
		}
	}
	return ""
}

func roleLooksLike(path string, values []string, role string) bool {
	switch role {
	case "timestamp":
		for _, value := range values {
			if classifyValue(value) == "date" {
				return true
			}
		}
	case "level":
		for _, value := range values {
			switch strings.ToUpper(strings.TrimSpace(value)) {
			case "ERROR", "WARN", "WARNING", "INFO", "DEBUG", "TRACE", "FATAL":
				return true
			}
		}
	case "responseTimeMs", "statusCode":
		for _, value := range values {
			if classifyValue(value) == "number" {
				return true
			}
		}
	}
	_ = path
	return false
}

func matchTimestampField(path string) bool {
	lower := strings.ToLower(path)
	return strings.Contains(lower, "timestamp") || lower == "@timestamp" || strings.HasSuffix(lower, ".time")
}

func matchLevelField(path string) bool {
	lower := strings.ToLower(path)
	return lower == "level" || strings.HasSuffix(lower, ".level") || strings.HasSuffix(lower, "log.level")
}

func matchMessageField(path string) bool {
	lower := strings.ToLower(path)
	return lower == "message" || strings.HasSuffix(lower, ".message") || strings.Contains(lower, "log.message")
}

func matchExceptionField(path string) bool {
	lower := strings.ToLower(path)
	return strings.Contains(lower, "exception") || strings.Contains(lower, "error.type")
}

func matchLatencyField(path string) bool {
	lower := strings.ToLower(path)
	return strings.Contains(lower, "latency") || strings.Contains(lower, "responsetime") || strings.Contains(lower, "duration_ms")
}

func matchStatusCodeField(path string) bool {
	lower := strings.ToLower(path)
	return strings.Contains(lower, "statuscode") || strings.Contains(lower, "status_code") || lower == "status"
}

func matchServiceField(path string) bool {
	lower := strings.ToLower(path)
	return lower == "service" || strings.HasSuffix(lower, ".service") || strings.Contains(lower, "service.name")
}

func matchEndpointField(path string) bool {
	lower := strings.ToLower(path)
	return strings.Contains(lower, "endpoint") || strings.Contains(lower, "path") || strings.Contains(lower, "uri")
}

func matchTraceField(path string) bool {
	lower := strings.ToLower(path)
	return strings.Contains(lower, "trace")
}
