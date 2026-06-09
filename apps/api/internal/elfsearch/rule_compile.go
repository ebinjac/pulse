package elfsearch

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func OperatorsForType(valueType string) []string {
	switch strings.ToLower(strings.TrimSpace(valueType)) {
	case "number":
		return []string{"eq", "neq", "gte", "lte", "gt", "lt", "exists", "not_exists"}
	case "date":
		return []string{"gte", "lte", "gt", "lt", "exists", "not_exists"}
	case "boolean":
		return []string{"eq", "neq", "exists", "not_exists"}
	default:
		return []string{"contains", "not_contains", "eq", "neq", "regex", "exists", "not_exists"}
	}
}

func ValidateRule(rule domain.ElfCheckRule, descriptor domain.ElfFieldDescriptor) error {
	field := strings.TrimSpace(rule.Field)
	if field == "" {
		return fmt.Errorf("rule field is required")
	}
	operator := strings.TrimSpace(strings.ToLower(rule.Operator))
	if operator == "" {
		return fmt.Errorf("rule operator is required")
	}
	allowed := OperatorsForType(descriptor.ValueType)
	ok := false
	for _, item := range allowed {
		if item == operator {
			ok = true
			break
		}
	}
	if !ok {
		return fmt.Errorf("operator %q is not allowed for field type %q", operator, descriptor.ValueType)
	}
	switch operator {
	case "exists", "not_exists":
		return nil
	default:
		if rule.Value == nil || strings.TrimSpace(fmt.Sprint(rule.Value)) == "" {
			return fmt.Errorf("rule value is required for operator %q", operator)
		}
	}
	return nil
}

func IsTotalHitsExpression(config domain.ElfCheckConfig) bool {
	return len(config.Rules) == 0 && isTotalHitsPassWhen(strings.TrimSpace(config.PassWhen))
}

func isTotalHitsPassWhen(passWhen string) bool {
	switch strings.TrimSpace(passWhen) {
	case "hit_count_lte", "hit_count_gte", "hit_count_gt", "hit_count_eq", "hit_count_lt":
		return true
	default:
		return false
	}
}

func CompileRulesToQuery(config domain.ElfCheckConfig, timeField, gte, lte string) (json.RawMessage, error) {
	logic := strings.TrimSpace(strings.ToLower(config.Logic))
	if logic == "" {
		logic = "all"
	}
	clauses := make([]any, 0, len(config.Rules))
	for _, rule := range config.Rules {
		clause, err := compileRuleClause(rule)
		if err != nil {
			return nil, err
		}
		clauses = append(clauses, clause)
	}
	query := map[string]any{
		"bool": map[string]any{
			"must": []any{map[string]any{"match_all": map[string]any{}}},
		},
	}
	if len(clauses) > 0 {
		boolQuery := map[string]any{}
		switch logic {
		case "any":
			boolQuery["should"] = clauses
			boolQuery["minimum_should_match"] = 1
		default:
			boolQuery["must"] = clauses
		}
		query = map[string]any{"bool": boolQuery}
	}
	body := map[string]any{
		"size":             0,
		"track_total_hits": true,
		"query":            query,
	}
	if strings.TrimSpace(timeField) != "" && strings.TrimSpace(gte) != "" && strings.TrimSpace(lte) != "" {
		out, _, err := InjectTimeRange(mustMarshal(body), timeField, gte, lte)
		if err != nil {
			return nil, err
		}
		return out, nil
	}
	return mustMarshal(body), nil
}

func compileRuleClause(rule domain.ElfCheckRule) (map[string]any, error) {
	field := strings.TrimSpace(rule.Field)
	operator := strings.TrimSpace(strings.ToLower(rule.Operator))
	switch operator {
	case "contains":
		return map[string]any{"match_phrase": map[string]any{field: fmt.Sprint(rule.Value)}}, nil
	case "not_contains":
		return map[string]any{
			"bool": map[string]any{
				"must_not": []any{map[string]any{"match_phrase": map[string]any{field: fmt.Sprint(rule.Value)}}},
			},
		}, nil
	case "eq", "neq":
		value := coerceTermValue(rule.Value)
		clause := map[string]any{"term": map[string]any{field: value}}
		if operator == "neq" {
			return map[string]any{"bool": map[string]any{"must_not": []any{clause}}}, nil
		}
		return clause, nil
	case "gte", "lte", "gt", "lt":
		value := coerceRangeValue(rule.Value)
		return map[string]any{"range": map[string]any{field: map[string]any{operator: value}}}, nil
	case "exists":
		return map[string]any{"exists": map[string]any{"field": field}}, nil
	case "not_exists":
		return map[string]any{"bool": map[string]any{"must_not": []any{map[string]any{"exists": map[string]any{"field": field}}}}}, nil
	case "regex":
		return map[string]any{"regexp": map[string]any{field: fmt.Sprint(rule.Value)}}, nil
	default:
		return nil, fmt.Errorf("unsupported operator %q", operator)
	}
}

func coerceTermValue(value any) any {
	switch typed := value.(type) {
	case float64:
		if typed == float64(int64(typed)) {
			return int64(typed)
		}
		return typed
	case string:
		if b, err := strconv.ParseBool(typed); err == nil {
			return b
		}
		if i, err := strconv.ParseInt(typed, 10, 64); err == nil {
			return i
		}
		if f, err := strconv.ParseFloat(typed, 64); err == nil {
			return f
		}
		return typed
	default:
		return value
	}
}

func coerceRangeValue(value any) any {
	switch typed := value.(type) {
	case float64:
		return typed
	case string:
		if f, err := strconv.ParseFloat(typed, 64); err == nil {
			return f
		}
		return typed
	default:
		return value
	}
}

func PassCriteriaFromExpression(config domain.ElfCheckConfig) domain.ElfPassCriteria {
	passWhen := strings.TrimSpace(config.PassWhen)
	if passWhen == "" {
		passWhen = "no_matching_hits"
	}
	threshold := config.PassThreshold
	switch passWhen {
	case "has_matching_hits":
		return domain.ElfPassCriteria{Type: "min_hits", Threshold: 1}
	case "hit_count_lte":
		if threshold <= 0 {
			threshold = 0
		}
		return domain.ElfPassCriteria{Type: "max_hits", Threshold: threshold}
	case "hit_count_gte":
		if threshold <= 0 {
			threshold = 1
		}
		return domain.ElfPassCriteria{Type: "min_hits", Threshold: threshold}
	case "hit_count_gt":
		return domain.ElfPassCriteria{Type: "total_hits", Operator: "gt", Threshold: threshold}
	case "hit_count_eq":
		return domain.ElfPassCriteria{Type: "total_hits", Operator: "eq", Threshold: threshold}
	case "hit_count_lt":
		return domain.ElfPassCriteria{Type: "total_hits", Operator: "lt", Threshold: threshold}
	default:
		return domain.ElfPassCriteria{Type: "max_hits", Threshold: 0}
	}
}

func EvaluateExpressionPass(config domain.ElfCheckConfig, hitCount int) (string, string) {
	criteria := PassCriteriaFromExpression(config)
	result, reason := EvaluatePassCriteria(criteria, SearchResponseFromParsed(hitCount, nil))
	return result, reason
}

func mustMarshal(body map[string]any) json.RawMessage {
	raw, _ := json.Marshal(body)
	return json.RawMessage(raw)
}
