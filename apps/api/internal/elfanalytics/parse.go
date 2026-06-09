package elfanalytics

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type ParsedResponse struct {
	HitCount     int
	Aggregations map[string]json.RawMessage
	Hits         []map[string]any
}

func ParseResponse(raw []byte) (ParsedResponse, error) {
	var payload struct {
		Hits struct {
			Total struct {
				Value int `json:"value"`
			} `json:"total"`
			Hits []struct {
				Source map[string]any `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
		Aggregations map[string]json.RawMessage `json:"aggregations"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return ParsedResponse{}, err
	}
	hits := make([]map[string]any, 0, len(payload.Hits.Hits))
	for _, hit := range payload.Hits.Hits {
		hits = append(hits, hit.Source)
	}
	return ParsedResponse{
		HitCount:     payload.Hits.Total.Value,
		Aggregations: payload.Aggregations,
		Hits:         hits,
	}, nil
}

func ParseHitSource(source map[string]any, mapping domain.LogFieldMapping) domain.ElfStructuredSampleHit {
	return domain.ElfStructuredSampleHit{
		Service:       stringField(source, mapping.Service),
		Endpoint:      stringField(source, mapping.Endpoint),
		ExceptionType: stringField(source, mapping.ExceptionType),
		TraceID:       stringField(source, mapping.TraceID),
		Level:         stringField(source, mapping.Level),
		StatusCode:    anyToString(source[mapping.StatusCode]),
		Message:       stringField(source, mapping.Message),
	}
}

func stringField(source map[string]any, field string) string {
	if field == "" {
		return ""
	}
	return anyToString(source[field])
}

func anyToString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case int:
		return strconv.Itoa(typed)
	case json.Number:
		return typed.String()
	default:
		return ""
	}
}

func MetricValue(aggregations map[string]json.RawMessage, name string) (float64, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, fmt.Errorf("metric name is required")
	}
	raw, ok := aggregations[name]
	if !ok {
		return 0, fmt.Errorf("aggregation %q not found", name)
	}
	var valueCount struct {
		Value float64 `json:"value"`
	}
	if err := json.Unmarshal(raw, &valueCount); err == nil && valueCount.Value > 0 {
		return valueCount.Value, nil
	}
	var percentiles struct {
		Values map[string]float64 `json:"values"`
	}
	if err := json.Unmarshal(raw, &percentiles); err == nil {
		if value, ok := percentiles.Values["95.0"]; ok {
			return value, nil
		}
		if value, ok := percentiles.Values["50.0"]; ok {
			return value, nil
		}
	}
	return 0, fmt.Errorf("unsupported aggregation format for %q", name)
}

func TermsBuckets(aggregations map[string]json.RawMessage, name string) []domain.ElfFacetBucket {
	raw, ok := aggregations[name]
	if !ok {
		return nil
	}
	var payload struct {
		Buckets []struct {
			Key      any `json:"key"`
			DocCount int `json:"doc_count"`
		} `json:"buckets"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil
	}
	buckets := make([]domain.ElfFacetBucket, 0, len(payload.Buckets))
	for _, bucket := range payload.Buckets {
		buckets = append(buckets, domain.ElfFacetBucket{
			Key:   anyToString(bucket.Key),
			Count: bucket.DocCount,
		})
	}
	return buckets
}

func ExtractFacets(aggregations map[string]json.RawMessage) domain.ElfSignalFacets {
	return domain.ElfSignalFacets{
		TopServices:    TermsBuckets(aggregations, "by_service"),
		TopExceptions:  TermsBuckets(aggregations, "by_exception"),
		TopEndpoints:   TermsBuckets(aggregations, "by_endpoint"),
		TopDownstreams: TermsBuckets(aggregations, "by_downstream"),
	}
}

func NewTermBuckets(baseline, post map[string]json.RawMessage, aggName string, minHits int) []domain.ElfFacetBucket {
	if minHits <= 0 {
		minHits = 1
	}
	baselineKeys := map[string]bool{}
	for _, bucket := range TermsBuckets(baseline, aggName) {
		baselineKeys[bucket.Key] = true
	}
	newTerms := make([]domain.ElfFacetBucket, 0)
	for _, bucket := range TermsBuckets(post, aggName) {
		if baselineKeys[bucket.Key] {
			continue
		}
		if bucket.Count >= minHits {
			newTerms = append(newTerms, bucket)
		}
	}
	return newTerms
}
