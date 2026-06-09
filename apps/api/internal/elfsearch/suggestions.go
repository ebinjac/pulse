package elfsearch

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func DetectRoles(schema domain.ElfFieldSchema, samples []map[string]any, mapping domain.LogFieldMapping) []domain.ElfDetectedRole {
	roles := make([]domain.ElfDetectedRole, 0)
	seen := map[string]bool{}
	for _, field := range schema.Fields {
		role := strings.TrimSpace(field.SuggestedRole)
		if role == "" {
			role = roleFromMapping(field.Path, mapping)
		}
		if role == "" || seen[role] {
			continue
		}
		seen[role] = true
		roles = append(roles, domain.ElfDetectedRole{
			Role:       role,
			Path:       field.Path,
			Label:      firstNonEmptyField(field.Label, role),
			ValueType:  field.ValueType,
			Confidence: confidenceForField(field, mapping),
			Samples:    collectSamples(samples, field.Path, 3),
		})
	}
	return roles
}

func SuggestChecks(schema domain.ElfFieldSchema, samples []map[string]any, mapping domain.LogFieldMapping) []domain.ElfSuggestedCheck {
	fields := map[string]domain.ElfFieldDescriptor{}
	roles := map[string]string{}
	for _, field := range schema.Fields {
		fields[field.Path] = field
		if field.SuggestedRole != "" {
			roles[field.SuggestedRole] = field.Path
		}
	}
	rolePath := func(role string, fallbacks ...string) string {
		if path := roles[role]; path != "" {
			return path
		}
		for _, fallback := range fallbacks {
			if _, ok := fields[fallback]; ok {
				return fallback
			}
		}
		return ""
	}

	level := rolePath("level", mapping.Level, "level")
	status := rolePath("statusCode", mapping.StatusCode, "statusCode")
	latency := rolePath("responseTimeMs", mapping.ResponseTimeMs, "responseTimeMs")
	exception := rolePath("exceptionType", mapping.ExceptionType, "exceptionType")
	downstream := rolePath("downstreamService", mapping.DownstreamService, "downstreamService")
	pod := rolePath("podName", "podName", "kubernetes.pod.name")
	responseSuccess := rolePath("responseSuccess", "responseBody.success", "success")

	suggestions := make([]domain.ElfSuggestedCheck, 0)
	if level != "" {
		suggestions = append(suggestions, suggestedExpression(
			"no-error-logs",
			"No ERROR logs",
			"Fails when error-level logs appear in the selected window.",
			"blocking",
			"error",
			[]domain.ElfCheckRule{{Field: level, Operator: "eq", Value: "ERROR"}},
			"all",
			"no_matching_hits",
			0,
			samples,
		))
	}
	if status != "" {
		suggestions = append(suggestions, suggestedExpression(
			"no-5xx",
			"No 5xx responses",
			"Fails when server-side HTTP failures appear after deployment.",
			"blocking",
			"error",
			[]domain.ElfCheckRule{{Field: status, Operator: "gte", Value: 500}},
			"all",
			"no_matching_hits",
			0,
			samples,
		))
		suggestions = append(suggestions, suggestedExpression(
			"no-rate-limit-spike",
			"No rate-limit spike",
			"Flags HTTP 429 responses so SREs can catch throttling after deployment.",
			"advisory",
			"warning",
			[]domain.ElfCheckRule{{Field: status, Operator: "eq", Value: 429}},
			"all",
			"hit_count_lte",
			0,
			samples,
		))
	}
	if latency != "" {
		suggestions = append(suggestions, suggestedExpression(
			"no-slow-responses",
			"No slow responses above 2000ms",
			"Flags requests where client-facing response time is already high.",
			"advisory",
			"warning",
			[]domain.ElfCheckRule{{Field: latency, Operator: "gte", Value: 2000}},
			"all",
			"hit_count_lte",
			0,
			samples,
		))
	}
	if exception != "" {
		suggestions = append(suggestions, suggestedExpression(
			"no-exceptions",
			"No exception signatures",
			"Fails when logs contain an exception type.",
			"blocking",
			"error",
			[]domain.ElfCheckRule{{Field: exception, Operator: "exists"}},
			"all",
			"no_matching_hits",
			0,
			samples,
		))
	}
	if downstream != "" {
		rules := []domain.ElfCheckRule{{Field: downstream, Operator: "exists"}}
		if level != "" {
			rules = append(rules, domain.ElfCheckRule{Field: level, Operator: "eq", Value: "ERROR"})
		}
		suggestions = append(suggestions, suggestedExpression(
			"no-downstream-failures",
			"No downstream dependency failures",
			"Fails when error logs name a downstream service.",
			"blocking",
			"error",
			rules,
			"all",
			"no_matching_hits",
			0,
			samples,
		))
	}
	if status != "" && responseSuccess != "" {
		suggestions = append(suggestions, suggestedExpression(
			"no-false-success",
			"No false-success responses",
			"Flags logs where HTTP status is successful but the response body says success=false.",
			"advisory",
			"warning",
			[]domain.ElfCheckRule{{Field: status, Operator: "eq", Value: 200}, {Field: responseSuccess, Operator: "eq", Value: false}},
			"all",
			"hit_count_lte",
			0,
			samples,
		))
	}
	if pod != "" && level != "" {
		suggestions = append(suggestions, suggestedExpression(
			"pod-error-concentration",
			"Pod-specific error concentration",
			"Use this when one pod/container appears to carry most errors.",
			"advisory",
			"warning",
			[]domain.ElfCheckRule{{Field: pod, Operator: "exists"}, {Field: level, Operator: "eq", Value: "ERROR"}},
			"all",
			"hit_count_lte",
			0,
			samples,
		))
	}
	return suggestions
}

func suggestedExpression(id, label, description, gateMode, severity string, rules []domain.ElfCheckRule, logic, passWhen string, threshold float64, samples []map[string]any) domain.ElfSuggestedCheck {
	config := domain.ElfCheckConfig{
		Mode:          "expression",
		Logic:         logic,
		Rules:         rules,
		PassWhen:      passWhen,
		PassThreshold: threshold,
	}
	return domain.ElfSuggestedCheck{
		ID:              id,
		Label:           label,
		Description:     description,
		GateMode:        gateMode,
		CheckKind:       "expression",
		CheckConfig:     config,
		PassCriteria:    PassCriteriaFromExpression(config),
		MatchCount:      countMatchingSamples(samples, rules, logic),
		Severity:        severity,
		DeploymentFocus: "post_deploy",
	}
}

func countMatchingSamples(samples []map[string]any, rules []domain.ElfCheckRule, logic string) int {
	count := 0
	for _, sample := range samples {
		matched := strings.EqualFold(logic, "any") && len(rules) > 0
		if !strings.EqualFold(logic, "any") {
			matched = true
		}
		for _, rule := range rules {
			ok := sampleMatchesRule(sample, rule)
			if strings.EqualFold(logic, "any") {
				matched = matched || ok
			} else {
				matched = matched && ok
			}
		}
		if matched {
			count++
		}
	}
	return count
}

func sampleMatchesRule(sample map[string]any, rule domain.ElfCheckRule) bool {
	value, exists := valueAtPath(sample, rule.Field)
	operator := strings.ToLower(strings.TrimSpace(rule.Operator))
	switch operator {
	case "exists":
		return exists && strings.TrimSpace(fmt.Sprint(value)) != ""
	case "not_exists":
		return !exists || strings.TrimSpace(fmt.Sprint(value)) == ""
	case "contains":
		return strings.Contains(strings.ToLower(fmt.Sprint(value)), strings.ToLower(fmt.Sprint(rule.Value)))
	case "not_contains":
		return !strings.Contains(strings.ToLower(fmt.Sprint(value)), strings.ToLower(fmt.Sprint(rule.Value)))
	case "eq":
		return compareAny(value, rule.Value) == 0
	case "neq":
		return compareAny(value, rule.Value) != 0
	case "gte":
		return compareAny(value, rule.Value) >= 0
	case "lte":
		return compareAny(value, rule.Value) <= 0
	case "gt":
		return compareAny(value, rule.Value) > 0
	case "lt":
		return compareAny(value, rule.Value) < 0
	default:
		return false
	}
}

func compareAny(a, b any) int {
	af, aok := toFloat(a)
	bf, bok := toFloat(b)
	if aok && bok {
		switch {
		case af < bf:
			return -1
		case af > bf:
			return 1
		default:
			return 0
		}
	}
	as := strings.ToLower(strings.TrimSpace(fmt.Sprint(a)))
	bs := strings.ToLower(strings.TrimSpace(fmt.Sprint(b)))
	switch {
	case as < bs:
		return -1
	case as > bs:
		return 1
	default:
		return 0
	}
}

func toFloat(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		return f, err == nil
	default:
		return 0, false
	}
}

func valueAtPath(source map[string]any, path string) (any, bool) {
	parts := strings.Split(path, ".")
	var current any = source
	for _, part := range parts {
		node, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		current, ok = node[part]
		if !ok {
			return nil, false
		}
	}
	return current, true
}

func collectSamples(samples []map[string]any, path string, limit int) []string {
	out := make([]string, 0, limit)
	for _, sample := range samples {
		value, ok := valueAtPath(sample, path)
		if !ok || strings.TrimSpace(fmt.Sprint(value)) == "" {
			continue
		}
		out = append(out, truncate(fmt.Sprint(value), 120))
		if len(out) >= limit {
			break
		}
	}
	return out
}

func confidenceForField(field domain.ElfFieldDescriptor, mapping domain.LogFieldMapping) string {
	if roleFromMapping(field.Path, mapping) != "" || field.Source == "inherited" {
		return "high"
	}
	if field.SuggestedRole != "" {
		return "medium"
	}
	return "low"
}
