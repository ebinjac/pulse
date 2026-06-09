package elfanalytics

import (
	"fmt"
	"math"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/elfsearch"
)

type ComparativeMetrics struct {
	PostHitCount     int
	BaselineHitCount int
	PostValue        float64
	BaselineValue    float64
	DeltaPct         float64
	Facets           domain.ElfSignalFacets
	NewTerms         []domain.ElfFacetBucket
}

func EvaluateComparative(query domain.ElfQuery, post, baseline ParsedResponse) (result string, reason string, metrics ComparativeMetrics) {
	metrics.PostHitCount = post.HitCount
	metrics.BaselineHitCount = baseline.HitCount
	metrics.Facets = ExtractFacets(post.Aggregations)

	criteriaType := strings.TrimSpace(query.PassCriteria.Type)
	if criteriaType == "" || criteriaType == "max_hits" || criteriaType == "min_hits" || criteriaType == "aggregation" {
		criteriaType = comparativeTypeForSignal(query.SignalType, query.PassCriteria.Type)
	}

	metricName := strings.TrimSpace(query.PassCriteria.Name)
	if metricName == "" {
		metricName = query.ComparisonConfig.PostMetric
	}

	switch criteriaType {
	case "delta_pct", "delta_abs":
		postValue, err := MetricValue(post.Aggregations, metricName)
		if err != nil {
			postValue = float64(post.HitCount)
		}
		baselineValue, err := MetricValue(baseline.Aggregations, metricName)
		if err != nil {
			baselineValue = float64(baseline.HitCount)
		}
		metrics.PostValue = postValue
		metrics.BaselineValue = baselineValue
		metrics.DeltaPct = deltaPct(baselineValue, postValue)

		if criteriaType == "delta_abs" {
			delta := postValue - baselineValue
			threshold := query.PassCriteria.Threshold
			if threshold <= 0 {
				threshold = query.ComparisonConfig.DeltaAbsMax
			}
			if delta > threshold {
				return "fail", fmt.Sprintf("post %.0f exceeds baseline %.0f by %.0f (threshold %.0f)", postValue, baselineValue, delta, threshold), metrics
			}
			return "pass", "", metrics
		}

		threshold := query.PassCriteria.Threshold
		if threshold <= 0 {
			threshold = 50
		}
		multiplier := query.ComparisonConfig.MultiplierMax
		if multiplier > 0 && baselineValue > 0 && postValue > baselineValue*multiplier {
			return "fail", fmt.Sprintf("post %.0f exceeds baseline %.0f by multiplier %.2f", postValue, baselineValue, multiplier), metrics
		}
		if metrics.DeltaPct > threshold {
			return "fail", fmt.Sprintf("delta %.1f%% exceeds threshold %.0f%% (baseline %.0f → post %.0f)", metrics.DeltaPct, threshold, baselineValue, postValue), metrics
		}
		return "pass", "", metrics

	case "percentile_regression":
		postValue, err := MetricValue(post.Aggregations, metricName)
		if err != nil {
			return "fail", err.Error(), metrics
		}
		baselineValue, err := MetricValue(baseline.Aggregations, metricName)
		if err != nil {
			baselineValue = 0
		}
		metrics.PostValue = postValue
		metrics.BaselineValue = baselineValue
		metrics.DeltaPct = deltaPct(baselineValue, postValue)

		threshold := query.PassCriteria.Threshold
		if threshold <= 0 {
			threshold = 30
		}
		multiplier := query.ComparisonConfig.MultiplierMax
		if multiplier <= 0 {
			multiplier = 1.3
		}
		if baselineValue > 0 && postValue > baselineValue*multiplier {
			return "fail", fmt.Sprintf("post P95 %.1fms exceeds baseline %.1fms × %.2f", postValue, baselineValue, multiplier), metrics
		}
		if metrics.DeltaPct > threshold {
			return "fail", fmt.Sprintf("P95 latency regressed %.1f%% (baseline %.1fms → post %.1fms)", metrics.DeltaPct, baselineValue, postValue), metrics
		}
		return "pass", "", metrics

	case "new_terms":
		minHits := int(query.PassCriteria.Threshold)
		if minHits <= 0 {
			minHits = query.ComparisonConfig.MinNewTermHits
		}
		if minHits <= 0 {
			minHits = 1
		}
		metrics.NewTerms = NewTermBuckets(baseline.Aggregations, post.Aggregations, metricName, minHits)
		metrics.Facets.NewTerms = metrics.NewTerms
		metrics.PostValue = float64(len(metrics.NewTerms))
		if len(metrics.NewTerms) > 0 {
			keys := make([]string, 0, len(metrics.NewTerms))
			for _, term := range metrics.NewTerms {
				keys = append(keys, fmt.Sprintf("%s (%d)", term.Key, term.Count))
			}
			return "fail", fmt.Sprintf("new terms detected: %s", strings.Join(keys, ", ")), metrics
		}
		return "pass", "", metrics
	default:
		criteriaResult, singleReason := elfsearch.EvaluatePassCriteria(query.PassCriteria, elfsearch.SearchResponseFromParsed(post.HitCount, post.Aggregations))
		return criteriaResult, singleReason, metrics
	}
}

func comparativeTypeForSignal(signalType, fallback string) string {
	if strings.TrimSpace(fallback) != "" && fallback != "max_hits" {
		return fallback
	}
	switch signalType {
	case SignalLatencyRegression:
		return "percentile_regression"
	case SignalNewExceptions, SignalDownstreamErrors:
		return "new_terms"
	case SignalHTTP5xxSpike:
		return "delta_abs"
	default:
		return "delta_pct"
	}
}

func deltaPct(baseline, post float64) float64 {
	if baseline <= 0 {
		if post <= 0 {
			return 0
		}
		return 100
	}
	return math.Round(((post-baseline)/baseline)*1000) / 10
}

func GateResult(gateMode, criteriaResult string) string {
	return elfsearch.GateResult(gateMode, criteriaResult)
}
