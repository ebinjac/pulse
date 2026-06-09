package elfsearch

import (
	"encoding/json"
	"fmt"
	"strings"
)

type InjectedTimeRange struct {
	Field string `json:"field"`
	Gte   string `json:"gte"`
	Lte   string `json:"lte"`
}

func InjectTimeRange(body []byte, field, gte, lte string) ([]byte, InjectedTimeRange, error) {
	field = strings.TrimSpace(field)
	if field == "" {
		field = "@timestamp"
	}
	gte = strings.TrimSpace(gte)
	lte = strings.TrimSpace(lte)
	if gte == "" || lte == "" {
		return nil, InjectedTimeRange{}, fmt.Errorf("gte and lte are required")
	}

	var root map[string]any
	if len(body) == 0 {
		body = []byte(`{}`)
	}
	if err := json.Unmarshal(body, &root); err != nil {
		return nil, InjectedTimeRange{}, fmt.Errorf("invalid search body JSON: %w", err)
	}

	injected := InjectedTimeRange{Field: field, Gte: gte, Lte: lte}
	if replaceRangeClause(root, field, gte, lte) {
		out, err := json.Marshal(root)
		return out, injected, err
	}

	appendTimeFilter(root, field, gte, lte)
	out, err := json.Marshal(root)
	return out, injected, err
}

func replaceRangeClause(node any, field, gte, lte string) bool {
	switch value := node.(type) {
	case map[string]any:
		if rng, ok := value["range"].(map[string]any); ok {
			if fieldNode, ok := rng[field].(map[string]any); ok {
				fieldNode["gte"] = gte
				fieldNode["lte"] = lte
				rng[field] = fieldNode
				value["range"] = rng
				return true
			}
			for key, child := range rng {
				if strings.EqualFold(key, field) {
					childMap, ok := child.(map[string]any)
					if !ok {
						childMap = map[string]any{}
					}
					childMap["gte"] = gte
					childMap["lte"] = lte
					rng[key] = childMap
					value["range"] = rng
					return true
				}
			}
		}
		for _, child := range value {
			if replaceRangeClause(child, field, gte, lte) {
				return true
			}
		}
	case []any:
		for _, child := range value {
			if replaceRangeClause(child, field, gte, lte) {
				return true
			}
		}
	}
	return false
}

func appendTimeFilter(root map[string]any, field, gte, lte string) {
	filterClause := map[string]any{
		"range": map[string]any{
			field: map[string]any{
				"gte": gte,
				"lte": lte,
			},
		},
	}

	queryNode, ok := root["query"].(map[string]any)
	if !ok {
		root["query"] = map[string]any{
			"bool": map[string]any{
				"filter": []any{filterClause},
			},
		}
		return
	}

	boolNode, ok := queryNode["bool"].(map[string]any)
	if !ok {
		queryNode["bool"] = map[string]any{
			"filter": []any{filterClause},
		}
		root["query"] = queryNode
		return
	}

	switch existing := boolNode["filter"].(type) {
	case []any:
		boolNode["filter"] = append(existing, filterClause)
	case nil:
		boolNode["filter"] = []any{filterClause}
	default:
		boolNode["filter"] = []any{existing, filterClause}
	}
	queryNode["bool"] = boolNode
	root["query"] = queryNode
}
