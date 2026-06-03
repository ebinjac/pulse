package variables

import (
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var tokenPattern = regexp.MustCompile(`\{\{\s*([^{}]+?)\s*\}\}`)

type Resolver struct {
	Variables map[string]string
	Secrets   map[string]string
	Steps     map[string]map[string]string
	Now       time.Time
	UUID      string
}

func (r Resolver) Resolve(input string) (string, error) {
	now := r.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}

	var missing []string
	output := tokenPattern.ReplaceAllStringFunc(input, func(token string) string {
		key := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(token, "{{"), "}}"))
		value, ok := r.resolveKey(key, now)
		if !ok {
			missing = append(missing, key)
			return token
		}

		return value
	})
	if len(missing) > 0 {
		return "", errors.New("missing template values: " + strings.Join(missing, ", "))
	}

	return output, nil
}

func (r Resolver) resolveKey(key string, now time.Time) (string, bool) {
	switch {
	case strings.HasPrefix(key, "variables."):
		value, ok := r.Variables[strings.TrimPrefix(key, "variables.")]
		return value, ok
	case strings.HasPrefix(key, "secrets."):
		value, ok := r.Secrets[strings.TrimPrefix(key, "secrets.")]
		return value, ok
	case strings.HasPrefix(key, "steps."):
		return r.resolveStepKey(key)
	case key == "random.uuid":
		if r.UUID == "" {
			return "00000000-0000-4000-8000-000000000000", true
		}
		return r.UUID, true
	case key == "timestamp.iso":
		return now.Format(time.RFC3339), true
	case key == "timestamp.epochSeconds":
		return strconv.FormatInt(now.Unix(), 10), true
	case key == "timestamp.epochSecondsPlus300":
		return strconv.FormatInt(now.Add(5*time.Minute).Unix(), 10), true
	default:
		return "", false
	}
}

func (r Resolver) resolveStepKey(key string) (string, bool) {
	parts := strings.Split(key, ".")
	if len(parts) < 4 || parts[0] != "steps" || parts[2] != "output" {
		return "", false
	}

	stepName := parts[1]
	outputName := parts[3]
	stepOutput, ok := r.Steps[stepName]
	if !ok {
		return "", false
	}
	value, ok := stepOutput[outputName]

	return value, ok
}
