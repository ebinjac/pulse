package elfanalytics

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

const (
	SignalErrorSpike        = "error_spike"
	SignalLatencyRegression = "latency_regression"
	SignalNewExceptions     = "new_exceptions"
	SignalHTTP5xxSpike      = "http_5xx_spike"
	SignalSlowResponseSpike = "slow_response_spike"
	SignalDownstreamErrors  = "downstream_errors"
	SignalCustom            = "custom"
)

type BuiltInSignal struct {
	SignalType       string
	Name             string
	GateMode         string
	PassCriteria     domain.ElfPassCriteria
	ComparisonConfig domain.ElfComparisonConfig
}

func ProfileSignals(profile string) []BuiltInSignal {
	switch strings.ToLower(strings.TrimSpace(profile)) {
	case "strict":
		return []BuiltInSignal{
			BuiltInErrorSpike("blocking"),
			BuiltInLatencyRegression("advisory"),
			BuiltInNewExceptions("advisory"),
			BuiltInHTTP5xxSpike("blocking"),
			BuiltInDownstreamErrors("advisory"),
		}
	case "custom":
		return nil
	default:
		return []BuiltInSignal{
			BuiltInErrorSpike("advisory"),
			BuiltInLatencyRegression("advisory"),
			BuiltInNewExceptions("advisory"),
		}
	}
}

func BuiltInErrorSpike(gateMode string) BuiltInSignal {
	return BuiltInSignal{
		SignalType: SignalErrorSpike,
		Name:       "Error spike",
		GateMode:   gateMode,
		PassCriteria: domain.ElfPassCriteria{
			Type:      "delta_pct",
			Threshold: 50,
			Operator:  "gt",
			Name:      "error_count",
		},
		ComparisonConfig: domain.ElfComparisonConfig{
			BaselineMetric: "error_count",
			PostMetric:     "error_count",
			MultiplierMax:  1.5,
			DeltaAbsMax:    10,
		},
	}
}

func BuiltInLatencyRegression(gateMode string) BuiltInSignal {
	return BuiltInSignal{
		SignalType: SignalLatencyRegression,
		Name:       "Latency regression",
		GateMode:   gateMode,
		PassCriteria: domain.ElfPassCriteria{
			Type:      "percentile_regression",
			Threshold: 30,
			Operator:  "gt",
			Name:      "p95_latency",
		},
		ComparisonConfig: domain.ElfComparisonConfig{
			BaselineMetric: "p95_latency",
			PostMetric:     "p95_latency",
			MultiplierMax:  1.3,
		},
	}
}

func BuiltInNewExceptions(gateMode string) BuiltInSignal {
	return BuiltInSignal{
		SignalType: SignalNewExceptions,
		Name:       "New exceptions",
		GateMode:   gateMode,
		PassCriteria: domain.ElfPassCriteria{
			Type:      "new_terms",
			Threshold: 1,
			Name:      "by_exception",
		},
		ComparisonConfig: domain.ElfComparisonConfig{
			MinNewTermHits: 1,
		},
	}
}

func BuiltInHTTP5xxSpike(gateMode string) BuiltInSignal {
	return BuiltInSignal{
		SignalType: SignalHTTP5xxSpike,
		Name:       "HTTP 5xx spike",
		GateMode:   gateMode,
		PassCriteria: domain.ElfPassCriteria{
			Type:      "delta_abs",
			Threshold: 5,
			Operator:  "gt",
			Name:      "http_5xx_count",
		},
		ComparisonConfig: domain.ElfComparisonConfig{
			BaselineMetric: "http_5xx_count",
			PostMetric:     "http_5xx_count",
			DeltaAbsMax:    5,
		},
	}
}

func BuiltInSlowResponseSpike(gateMode string) BuiltInSignal {
	return BuiltInSignal{
		SignalType: SignalSlowResponseSpike,
		Name:       "Slow response warnings",
		GateMode:   gateMode,
		PassCriteria: domain.ElfPassCriteria{
			Type:      "delta_pct",
			Threshold: 50,
			Name:      "slow_response_count",
		},
		ComparisonConfig: domain.ElfComparisonConfig{
			BaselineMetric: "slow_response_count",
			PostMetric:     "slow_response_count",
			MultiplierMax:  1.5,
		},
	}
}

func BuiltInDownstreamErrors(gateMode string) BuiltInSignal {
	return BuiltInSignal{
		SignalType: SignalDownstreamErrors,
		Name:       "Downstream dependency errors",
		GateMode:   gateMode,
		PassCriteria: domain.ElfPassCriteria{
			Type:      "new_terms",
			Threshold: 1,
			Name:      "by_downstream",
		},
		ComparisonConfig: domain.ElfComparisonConfig{
			MinNewTermHits: 1,
		},
	}
}

func timeRangeFilter(mapping domain.LogFieldMapping, baseline bool) map[string]any {
	timestamp := mapping.Timestamp
	if timestamp == "" {
		timestamp = "@timestamp"
	}
	if baseline {
		return map[string]any{"range": map[string]any{timestamp: map[string]string{
			"gte": "{{baselineStart}}",
			"lte": "{{deployStart}}",
		}}}
	}
	return map[string]any{"range": map[string]any{timestamp: map[string]string{
		"gte": "{{deployStart}}",
		"lte": "{{deployEnd}}",
	}}}
}

func serviceEnvFilters(mapping domain.LogFieldMapping) []map[string]any {
	filters := []map[string]any{
		{"term": map[string]string{mapping.Service: "{{logServiceName}}"}},
	}
	if strings.TrimSpace(mapping.Environment) != "" {
		filters = append(filters, map[string]any{"term": map[string]string{mapping.Environment: "{{environment}}"}})
	}
	return filters
}

func BuildSignalSearchBody(signalType string, mapping domain.LogFieldMapping, baseline bool) json.RawMessage {
	filters := []map[string]any{timeRangeFilter(mapping, baseline)}
	filters = append(filters, serviceEnvFilters(mapping)...)

	body := map[string]any{
		"size":  3,
		"query": map[string]any{"bool": map[string]any{"filter": filters}},
		"aggs":  map[string]any{},
	}

	switch signalType {
	case SignalErrorSpike:
		filters = append([]map[string]any{timeRangeFilter(mapping, baseline)}, map[string]any{"term": map[string]string{mapping.Level: "ERROR"}})
		filters = append(filters, serviceEnvFilters(mapping)...)
		body["size"] = 3
		body["aggs"] = map[string]any{
			"error_count":  map[string]any{"value_count": map[string]string{"field": "_id"}},
			"by_service":   map[string]any{"terms": map[string]any{"field": aggField(mapping.Service), "size": 10}},
			"by_exception": map[string]any{"terms": map[string]any{"field": aggField(mapping.ExceptionType), "size": 10}},
			"by_endpoint":  map[string]any{"terms": map[string]any{"field": aggField(mapping.Endpoint), "size": 10}},
		}
	case SignalLatencyRegression:
		body["size"] = 0
		body["aggs"] = map[string]any{
			"p95_latency": map[string]any{"percentiles": map[string]any{
				"field":    mapping.ResponseTimeMs,
				"percents": []float64{50, 95},
			}},
		}
	case SignalNewExceptions:
		filters = append([]map[string]any{timeRangeFilter(mapping, baseline)}, map[string]any{"exists": map[string]string{"field": mapping.ExceptionType}})
		filters = append(filters, serviceEnvFilters(mapping)...)
		body["size"] = 3
		body["aggs"] = map[string]any{
			"by_exception": map[string]any{"terms": map[string]any{"field": aggField(mapping.ExceptionType), "size": 20}},
			"by_endpoint":  map[string]any{"terms": map[string]any{"field": aggField(mapping.Endpoint), "size": 10}},
		}
	case SignalHTTP5xxSpike:
		filters = append([]map[string]any{timeRangeFilter(mapping, baseline)}, map[string]any{"range": map[string]any{mapping.StatusCode: map[string]int{"gte": 500}}})
		filters = append(filters, serviceEnvFilters(mapping)...)
		body["size"] = 3
		body["aggs"] = map[string]any{
			"http_5xx_count": map[string]any{"value_count": map[string]string{"field": "_id"}},
			"by_service":     map[string]any{"terms": map[string]any{"field": aggField(mapping.Service), "size": 10}},
			"by_endpoint":    map[string]any{"terms": map[string]any{"field": aggField(mapping.Endpoint), "size": 10}},
		}
	case SignalSlowResponseSpike:
		filters = append([]map[string]any{timeRangeFilter(mapping, baseline)}, map[string]any{"term": map[string]string{mapping.Tags: "slow-response"}})
		filters = append(filters, serviceEnvFilters(mapping)...)
		body["size"] = 3
		body["aggs"] = map[string]any{
			"slow_response_count": map[string]any{"value_count": map[string]string{"field": "_id"}},
			"by_endpoint":         map[string]any{"terms": map[string]any{"field": aggField(mapping.Endpoint), "size": 10}},
		}
	case SignalDownstreamErrors:
		filters = append([]map[string]any{timeRangeFilter(mapping, baseline)},
			map[string]any{"term": map[string]string{mapping.Level: "ERROR"}},
			map[string]any{"exists": map[string]string{"field": mapping.DownstreamService}},
		)
		filters = append(filters, serviceEnvFilters(mapping)...)
		body["size"] = 3
		body["aggs"] = map[string]any{
			"by_downstream": map[string]any{"terms": map[string]any{"field": aggField(mapping.DownstreamService), "size": 10}},
			"by_exception":  map[string]any{"terms": map[string]any{"field": aggField(mapping.ExceptionType), "size": 10}},
		}
	default:
		body["size"] = 0
	}

	body["query"] = map[string]any{"bool": map[string]any{"filter": filters}}
	raw, _ := json.Marshal(body)
	return raw
}

func SignalToQuery(signal BuiltInSignal, applicationID, serviceID string, mapping domain.LogFieldMapping) domain.ElfQuery {
	body := BuildSignalSearchBody(signal.SignalType, mapping, false)
	return domain.ElfQuery{
		ID:               fmt.Sprintf("signal-%s", signal.SignalType),
		Name:             signal.Name,
		SignalType:       signal.SignalType,
		GateMode:         signal.GateMode,
		PassCriteria:     signal.PassCriteria,
		ComparisonConfig: signal.ComparisonConfig,
		ApplicationID:    applicationID,
		ServiceID:        serviceID,
		SearchBody:       body,
		IsActive:         true,
	}
}
