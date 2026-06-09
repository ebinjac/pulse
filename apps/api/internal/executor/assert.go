package executor

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/masking"
)

func getActualAssertionValue(assertion domain.Assertion, resp *http.Response, body string, latency int) string {
	switch assertion.Type {
	case "statusCode":
		return strconv.Itoa(resp.StatusCode)
	case "responseTime":
		return strconv.Itoa(latency)
	case "header":
		return resp.Header.Get(assertion.Target)
	case "bodyContains", "bodyDoesNotContain":
		return body
	case "jsonPath":
		val, ok := evaluateJSONPath(body, assertion.Target)
		if !ok {
			return "missing"
		}
		return fmt.Sprintf("%v", val)
	default:
		return ""
	}
}

func getExtractedValue(extractor domain.Extractor, resp *http.Response, body string) string {
	switch extractor.Type {
	case "statusCode":
		return strconv.Itoa(resp.StatusCode)
	case "header":
		return resp.Header.Get(extractor.Source)
	case "jsonPath":
		val, ok := evaluateJSONPath(body, extractor.Source)
		if !ok {
			return ""
		}
		return fmt.Sprintf("%v", val)
	default:
		return ""
	}
}

func assertionFails(operator string, actual string, expected string) bool {
	switch operator {
	case "equals":
		return actual != expected
	case "notEquals":
		return actual == expected
	case "contains":
		return !strings.Contains(actual, expected)
	case "notContains":
		return strings.Contains(actual, expected)
	case "exists":
		return actual == "" || actual == "missing" || actual == "null"
	case "notExists":
		return actual != "" && actual != "missing" && actual != "null"
	case "greaterThan":
		actNum, err1 := strconv.ParseFloat(actual, 64)
		expNum, err2 := strconv.ParseFloat(expected, 64)
		if err1 != nil || err2 != nil {
			return true
		}
		return actNum <= expNum
	case "lessThan":
		actNum, err1 := strconv.ParseFloat(actual, 64)
		expNum, err2 := strconv.ParseFloat(expected, 64)
		if err1 != nil || err2 != nil {
			return true
		}
		return actNum >= expNum
	case "matchesRegex":
		matched, err := regexp.MatchString(expected, actual)
		if err != nil {
			return true
		}
		return !matched
	default:
		return false
	}
}

func maskAssertionsReal(assertions []domain.Assertion) []domain.Assertion {
	masked := make([]domain.Assertion, len(assertions))
	copy(masked, assertions)
	for index := range masked {
		if masked[index].Sensitive {
			masked[index].Actual = masking.Mask
		}
	}
	return masked
}

func evaluateJSONPath(jsonStr string, path string) (any, bool) {
	if !strings.HasPrefix(path, "$") {
		return nil, false
	}

	var root any
	if err := json.Unmarshal([]byte(jsonStr), &root); err != nil {
		return nil, false
	}

	cleaned := strings.ReplaceAll(path, "[", ".")
	cleaned = strings.ReplaceAll(cleaned, "]", "")

	parts := strings.Split(cleaned, ".")
	curr := root

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" || part == "$" {
			continue
		}

		switch typed := curr.(type) {
		case map[string]any:
			val, ok := typed[part]
			if !ok {
				return nil, false
			}
			curr = val
		case []any:
			idx, err := strconv.Atoi(part)
			if err != nil || idx < 0 || idx >= len(typed) {
				return nil, false
			}
			curr = typed[idx]
		default:
			return nil, false
		}
	}

	return curr, true
}
