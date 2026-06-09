package elfsearch

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type SearchResponse struct {
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

func SearchResponseFromParsed(hitCount int, aggregations map[string]json.RawMessage) SearchResponse {
	response := SearchResponse{Aggregations: aggregations}
	response.Hits.Total.Value = hitCount
	return response
}

func EvaluatePassCriteria(criteria domain.ElfPassCriteria, response SearchResponse) (result string, reason string) {
	criteriaType := strings.TrimSpace(criteria.Type)
	if criteriaType == "" {
		criteriaType = "max_hits"
	}

	hitCount := response.Hits.Total.Value
	switch criteriaType {
	case "max_hits":
		if hitCount > int(criteria.Threshold) {
			return "fail", fmt.Sprintf("hit count %d exceeds threshold %.0f", hitCount, criteria.Threshold)
		}
		return "pass", ""
	case "min_hits":
		if hitCount < int(criteria.Threshold) {
			return "fail", fmt.Sprintf("hit count %d below threshold %.0f", hitCount, criteria.Threshold)
		}
		return "pass", ""
	case "total_hits", "hits_total", "hits.total.value":
		if !compareValue(float64(hitCount), criteria.Operator, criteria.Threshold) {
			return "fail", fmt.Sprintf("hits.total.value %d failed %s %.0f", hitCount, criteria.Operator, criteria.Threshold)
		}
		return "pass", ""
	case "aggregation":
		value, err := aggregationValue(response.Aggregations, criteria.Name)
		if err != nil {
			return "fail", err.Error()
		}
		if !compareValue(value, criteria.Operator, criteria.Threshold) {
			return "fail", fmt.Sprintf("aggregation %s value %.2f failed %s %.0f", criteria.Name, value, criteria.Operator, criteria.Threshold)
		}
		return "pass", ""
	default:
		return "fail", fmt.Sprintf("unsupported pass criteria type %q", criteriaType)
	}
}

func GateResult(gateMode string, criteriaResult string) string {
	if criteriaResult == "pass" {
		return "pass"
	}
	gateMode = strings.TrimSpace(strings.ToLower(gateMode))
	if gateMode == "advisory" {
		return "warning"
	}
	return "fail"
}

func aggregationValue(aggregations map[string]json.RawMessage, name string) (float64, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, fmt.Errorf("aggregation name is required")
	}
	raw, ok := aggregations[name]
	if !ok {
		return 0, fmt.Errorf("aggregation %q not found in response", name)
	}
	var payload struct {
		Value float64 `json:"value"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return 0, fmt.Errorf("decode aggregation %q: %w", name, err)
	}
	return payload.Value, nil
}

func compareValue(value float64, operator string, threshold float64) bool {
	switch strings.TrimSpace(strings.ToLower(operator)) {
	case "gt", ">":
		return value > threshold
	case "gte", ">=":
		return value >= threshold
	case "lt", "<":
		return value < threshold
	case "lte", "<=":
		return value <= threshold
	case "equals", "eq", "==":
		return value == threshold
	default:
		return value <= threshold
	}
}

func ExtractSampleHits(response SearchResponse, limit int, maxBytes int) []string {
	if limit <= 0 {
		limit = 3
	}
	if maxBytes <= 0 {
		maxBytes = 2048
	}
	samples := make([]string, 0, limit)
	for _, hit := range response.Hits.Hits {
		if len(samples) >= limit {
			break
		}
		if message, ok := hit.Source["message"].(string); ok && strings.TrimSpace(message) != "" {
			samples = append(samples, truncate(message, maxBytes))
			continue
		}
		raw, err := json.Marshal(hit.Source)
		if err != nil {
			continue
		}
		samples = append(samples, truncate(string(raw), maxBytes))
	}
	return samples
}

func truncate(value string, maxBytes int) string {
	if len(value) <= maxBytes {
		return value
	}
	return value[:maxBytes] + "…"
}
