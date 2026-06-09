package executor

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/scripting"
	"github.com/ensemble-pulse/pulse/apps/api/internal/variables"
)

func subRequestStepRuns(runID string, parent domain.MonitorStep, traces []scripting.SubRequestTrace) []domain.StepRun {
	if len(traces) == 0 {
		return nil
	}

	runs := make([]domain.StepRun, 0, len(traces))
	for index, trace := range traces {
		name := fmt.Sprintf("%s sendRequest %d", parent.Name, index+1)
		if trace.Method != "" && trace.URL != "" {
			name = fmt.Sprintf("%s %s", trace.Method, trace.URL)
		}
		runs = append(runs, domain.StepRun{
			ID:              fmt.Sprintf("%s-%s-send-request-%d", runID, parent.ID, index+1),
			StepName:        name,
			Type:            "http",
			Status:          trace.Status,
			LatencyMS:       trace.LatencyMS,
			Timing:          trace.Timing,
			RequestSummary:  trace.RequestSummary,
			RequestBody:     trace.RequestBody,
			RequestHeaders:  trace.RequestHeaders,
			ResponseSummary: trace.ResponseSummary,
			StatusCode:      trace.StatusCode,
			ResponseBody:    trace.ResponseBody,
			ResponseHeaders: trace.ResponseHeaders,
			Assertions:      []domain.Assertion{},
			Extractors:      []domain.Extractor{},
			ErrorMessage:    trace.ErrorMessage,
		})
	}

	return runs
}
func executePreRequestAction(actionType string, configPreview string, resolver variables.Resolver) string {
	switch actionType {
	case "generateUUID":
		return generateUUID()
	case "generateTimestamp":
		return strconv.FormatInt(time.Now().Unix(), 10)
	case "base64Encode":
		return base64.StdEncoding.EncodeToString([]byte(configPreview))
	case "base64Decode":
		decoded, err := base64.StdEncoding.DecodeString(configPreview)
		if err != nil {
			return ""
		}
		return string(decoded)
	case "sha256":
		h := sha256.Sum256([]byte(configPreview))
		return hex.EncodeToString(h[:])
	case "hmacSha256":
		// Parse config: format "secret=value, payload=value"
		var secret, payload string
		parts := strings.Split(configPreview, ",")
		for _, part := range parts {
			kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
			if len(kv) == 2 {
				if kv[0] == "secret" {
					secret = kv[1]
				} else if kv[0] == "payload" {
					payload = kv[1]
				}
			}
		}
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write([]byte(payload))
		return hex.EncodeToString(mac.Sum(nil))
	case "generateJWT":
		// Parse options or generate mockup JWT
		header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
		claims := configPreview
		if !strings.HasPrefix(claims, "{") {
			claims = fmt.Sprintf(`{"sub":"%s"}`, configPreview)
		}
		payload := base64.RawURLEncoding.EncodeToString([]byte(claims))
		return header + "." + payload + "."
	case "setVariable":
		return configPreview
	default:
		return configPreview
	}
}
func generateUUID() string {
	b := make([]byte, 16)
	_, err := rand.Read(b)
	if err != nil {
		return "00000000-0000-4000-8000-000000000000"
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}
