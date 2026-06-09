package elfsearch

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type CheckGenerateInput struct {
	Kind          string
	Config        domain.ElfCheckConfig
	Mapping       domain.LogFieldMapping
	TimeField     string
	MessageFilter string
}

func GenerateSearchBody(input CheckGenerateInput) (json.RawMessage, error) {
	kind := strings.TrimSpace(strings.ToLower(input.Kind))
	if kind == "" || kind == "raw" {
		return nil, fmt.Errorf("check kind raw does not generate a body")
	}
	field := strings.TrimSpace(input.Config.FacetField)
	if field == "" {
		field = defaultFieldForKind(kind, input.Mapping)
	}
	timeField := strings.TrimSpace(input.TimeField)
	if timeField == "" {
		timeField = firstNonEmptyField(input.Mapping.Timestamp, "@timestamp")
	}

	switch kind {
	case "expression":
		return CompileRulesToQuery(input.Config, timeField, "{{postGte}}", "{{postLte}}")
	case "message_match":
		messageField := firstNonEmptyField(input.Mapping.Message, "message")
		query := map[string]any{
			"size":             0,
			"track_total_hits": true,
			"query": map[string]any{
				"bool": map[string]any{
					"filter": []any{
						map[string]any{
							"range": map[string]any{
								timeField: map[string]any{
									"gte": "{{postGte}}",
									"lte": "{{postLte}}",
								},
							},
						},
					},
				},
			},
		}
		if pattern := strings.TrimSpace(input.Config.Pattern); pattern != "" {
			boolNode := query["query"].(map[string]any)["bool"].(map[string]any)
			boolNode["must"] = []any{
				map[string]any{
					"match_phrase": map[string]any{
						messageField: pattern,
					},
				},
			}
		}
		return marshalBody(query)
	case "hit_count":
		return marshalBody(map[string]any{
			"size":             0,
			"track_total_hits": true,
			"query": map[string]any{
				"bool": map[string]any{
					"filter": []any{
						map[string]any{
							"range": map[string]any{
								timeField: map[string]any{
									"gte": "{{postGte}}",
									"lte": "{{postLte}}",
								},
							},
						},
					},
				},
			},
		})
	case "new_terms":
		return marshalBody(map[string]any{
			"size": 0,
			"query": map[string]any{
				"bool": map[string]any{
					"filter": []any{
						map[string]any{
							"range": map[string]any{
								timeField: map[string]any{
									"gte": "{{postGte}}",
									"lte": "{{postLte}}",
								},
							},
						},
					},
				},
			},
			"aggs": map[string]any{
				"by_facet": map[string]any{
					"terms": map[string]any{
						"field": keywordField(field),
						"size":  50,
					},
				},
			},
		})
	case "delta_pct", "threshold":
		metricField := field
		if kind == "threshold" {
			metricField = firstNonEmptyField(input.Mapping.ResponseTimeMs, field, "responseTimeMs")
		}
		aggName := "metric_value"
		aggBody := map[string]any{}
		if kind == "threshold" {
			aggBody["percentiles"] = map[string]any{
				"field": metricField,
				"percents": []float64{
					input.Config.Percentile,
				},
			}
			if input.Config.Percentile == 0 {
				aggBody["percentiles"] = map[string]any{
					"field":    metricField,
					"percents": []float64{95},
				}
			}
		} else {
			aggBody["avg"] = map[string]any{"field": metricField}
		}
		return marshalBody(map[string]any{
			"size": 0,
			"query": map[string]any{
				"bool": map[string]any{
					"filter": []any{
						map[string]any{
							"range": map[string]any{
								timeField: map[string]any{
									"gte": "{{postGte}}",
									"lte": "{{postLte}}",
								},
							},
						},
					},
				},
			},
			"aggs": map[string]any{
				aggName: aggBody,
			},
		})
	default:
		return nil, fmt.Errorf("unsupported check kind %q", kind)
	}
}

func defaultFieldForKind(kind string, mapping domain.LogFieldMapping) string {
	switch kind {
	case "new_terms":
		return firstNonEmptyField(mapping.ExceptionType, mapping.Message, "exceptionType")
	case "delta_pct":
		return firstNonEmptyField(mapping.Level, "level")
	case "threshold":
		return firstNonEmptyField(mapping.ResponseTimeMs, "responseTimeMs")
	default:
		return firstNonEmptyField(mapping.Message, "message")
	}
}

func keywordField(field string) string {
	field = strings.TrimSpace(field)
	if field == "" {
		return "message.keyword"
	}
	if strings.HasSuffix(field, ".keyword") {
		return field
	}
	return field + ".keyword"
}

func firstNonEmptyField(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func marshalBody(body map[string]any) (json.RawMessage, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(raw), nil
}

func EffectiveSearchBody(query domain.ElfQuery) json.RawMessage {
	if strings.TrimSpace(query.CheckKind) != "" && query.CheckKind != "raw" && len(query.GeneratedSearchBody) > 0 {
		return query.GeneratedSearchBody
	}
	return query.SearchBody
}
