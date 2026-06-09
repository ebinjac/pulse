package elfsearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type ProbeOptions struct {
	SearchBodyOverride json.RawMessage
	TimeRange          ProbeTimeRange
	MaxResponseBytes   int
}

type ProbeTimeRange struct {
	Field string `json:"field"`
	Gte   string `json:"gte"`
	Lte   string `json:"lte"`
}

type ProbeResult struct {
	SearchURL            string                     `json:"searchUrl"`
	Curl                 string                     `json:"curl"`
	DurationMS           int                        `json:"durationMs"`
	StatusCode           int                        `json:"statusCode"`
	RawResponse          json.RawMessage            `json:"rawResponse,omitempty"`
	Truncated            bool                       `json:"truncated,omitempty"`
	HitCount             int                        `json:"hitCount"`
	Aggregations         map[string]any             `json:"aggregations,omitempty"`
	SampleHits           []map[string]any           `json:"sampleHits,omitempty"`
	ResolvedIndexPattern string                     `json:"resolvedIndexPattern"`
	ResolvedFieldMapping domain.LogFieldMapping     `json:"resolvedFieldMapping"`
	FieldSchema          domain.ElfFieldSchema      `json:"fieldSchema,omitempty"`
	InferredFields       []InferredField            `json:"inferredFields,omitempty"`
	DetectedRoles        []domain.ElfDetectedRole   `json:"detectedRoles,omitempty"`
	SuggestedChecks      []domain.ElfSuggestedCheck `json:"suggestedChecks,omitempty"`
	InjectedTimeRange    InjectedTimeRange          `json:"injectedTimeRange"`
	ErrorMessage         string                     `json:"errorMessage,omitempty"`
}

func (r *Runner) ProbeQuery(
	ctx context.Context,
	query domain.ElfQuery,
	application domain.Application,
	service *domain.ApplicationService,
	searchCtx SearchContext,
	opts ProbeOptions,
) (ProbeResult, error) {
	started := time.Now().UTC()
	result := ProbeResult{}

	settings := r.Settings.GetElfProxySettings()
	elfAppID := strings.TrimSpace(searchCtx.ElfAppID)
	if elfAppID == "" {
		elfAppID = ResolveElfAppIDForService(query, application, service)
	}

	prepared, err := PrepareSearch(settings, r.Secrets, query, application, searchCtx, service)
	if err != nil {
		result.ErrorMessage = err.Error()
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}

	// Probes always use the saved inquiry searchBody. Generated check bodies are for
	// deployment runs (EffectiveSearchBody) or explicit searchBodyOverride (e.g. test check).
	body := resolveProbeBody(query, prepared.Body, opts.SearchBodyOverride)

	mapping := resolveProbeMapping(application, service, query)
	result.ResolvedFieldMapping = mapping
	timeField := strings.TrimSpace(opts.TimeRange.Field)
	if timeField == "" {
		timeField = firstNonEmptyField(mapping.Timestamp, "@timestamp")
	}
	if strings.TrimSpace(opts.TimeRange.Gte) != "" && strings.TrimSpace(opts.TimeRange.Lte) != "" {
		body, result.InjectedTimeRange, err = InjectTimeRange(body, timeField, opts.TimeRange.Gte, opts.TimeRange.Lte)
		if err != nil {
			result.ErrorMessage = err.Error()
			result.DurationMS = int(time.Since(started).Milliseconds())
			return result, err
		}
	}

	result.ResolvedIndexPattern = prepared.IndexPath
	result.SearchURL = prepared.SearchURL

	token, ok := r.Secrets.GetRawSecretValue("elfProxyBearerToken")
	if !ok || strings.TrimSpace(token) == "" {
		err = fmt.Errorf("elf proxy bearer token is not configured")
		result.ErrorMessage = err.Error()
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}
	result.Curl = BuildEquivalentCurl(prepared.SearchURL, token, body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, prepared.SearchURL, bytes.NewReader(body))
	if err != nil {
		result.ErrorMessage = err.Error()
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := r.Client
	if client == nil {
		timeout := time.Duration(settings.TimeoutSeconds) * time.Second
		if timeout <= 0 {
			timeout = 30 * time.Second
		}
		client = &http.Client{Timeout: timeout}
	}

	resp, err := client.Do(req)
	if err != nil {
		result.ErrorMessage = redactToken(err.Error(), token)
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}
	defer resp.Body.Close()

	maxBytes := opts.MaxResponseBytes
	if maxBytes <= 0 {
		maxBytes = 512 * 1024
	}
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, int64(maxBytes)+1))
	if err != nil {
		result.ErrorMessage = err.Error()
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}
	result.StatusCode = resp.StatusCode
	result.DurationMS = int(time.Since(started).Milliseconds())

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err = fmt.Errorf("elf proxy returned status %d: %s", resp.StatusCode, truncate(string(respBody), 512))
		result.ErrorMessage = redactToken(err.Error(), token)
		return result, err
	}

	if len(respBody) > maxBytes {
		result.Truncated = true
		respBody = respBody[:maxBytes]
	}
	result.RawResponse = json.RawMessage(respBody)

	var parsed map[string]any
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		result.ErrorMessage = err.Error()
		return result, err
	}

	if hitsNode, ok := parsed["hits"].(map[string]any); ok {
		if totalNode, ok := hitsNode["total"].(map[string]any); ok {
			if value, ok := totalNode["value"].(float64); ok {
				result.HitCount = int(value)
			}
		}
		if hitItems, ok := hitsNode["hits"].([]any); ok {
			samples := make([]map[string]any, 0, min(len(hitItems), 20))
			for _, item := range hitItems {
				if len(samples) >= 20 {
					break
				}
				hitMap, ok := item.(map[string]any)
				if !ok {
					continue
				}
				if source, ok := hitMap["_source"].(map[string]any); ok {
					samples = append(samples, source)
				}
			}
			result.SampleHits = samples
			inferred := InferFieldsFromHits(samples, mapping)
			result.InferredFields = inferred
			var aggs map[string]any
			if aggsNode, ok := parsed["aggregations"].(map[string]any); ok {
				aggs = aggsNode
				result.Aggregations = aggs
			}
			result.FieldSchema = BuildFieldSchema(samples, aggs, mapping, query.FieldSchema)
			result.DetectedRoles = DetectRoles(result.FieldSchema, samples, mapping)
			result.SuggestedChecks = SuggestChecks(result.FieldSchema, samples, mapping)
		}
	}
	if result.FieldSchema.TimeField == "" {
		result.FieldSchema.TimeField = firstNonEmptyField(query.ProbeConfig.TimeField, mapping.Timestamp, "@timestamp")
	}

	return result, nil
}

func resolveProbeBody(query domain.ElfQuery, preparedBody []byte, override json.RawMessage) []byte {
	if len(override) > 0 {
		return override
	}
	if len(query.SearchBody) > 0 {
		return query.SearchBody
	}
	return preparedBody
}

func resolveProbeMapping(application domain.Application, service *domain.ApplicationService, query domain.ElfQuery) domain.LogFieldMapping {
	mapping := domain.LogFieldMapping{
		Timestamp:         "@timestamp",
		Level:             "level",
		Service:           "service",
		Endpoint:          "endpoint",
		StatusCode:        "statusCode",
		ResponseTimeMs:    "responseTimeMs",
		ExceptionType:     "exceptionType",
		Message:           "message",
		TraceID:           "traceId",
		Environment:       "environment",
		DownstreamService: "downstreamService",
		Tags:              "tags",
	}
	mergeLogMapping(&mapping, application.LogFieldMapping)
	if service != nil {
		mergeLogMapping(&mapping, service.LogFieldMapping)
	}
	mergeLogMapping(&mapping, query.FieldMapping)
	return mapping
}

func mergeLogMapping(base *domain.LogFieldMapping, override domain.LogFieldMapping) {
	if strings.TrimSpace(override.Timestamp) != "" {
		base.Timestamp = override.Timestamp
	}
	if strings.TrimSpace(override.Level) != "" {
		base.Level = override.Level
	}
	if strings.TrimSpace(override.Service) != "" {
		base.Service = override.Service
	}
	if strings.TrimSpace(override.Endpoint) != "" {
		base.Endpoint = override.Endpoint
	}
	if strings.TrimSpace(override.StatusCode) != "" {
		base.StatusCode = override.StatusCode
	}
	if strings.TrimSpace(override.ResponseTimeMs) != "" {
		base.ResponseTimeMs = override.ResponseTimeMs
	}
	if strings.TrimSpace(override.ExceptionType) != "" {
		base.ExceptionType = override.ExceptionType
	}
	if strings.TrimSpace(override.DownstreamService) != "" {
		base.DownstreamService = override.DownstreamService
	}
	if strings.TrimSpace(override.TraceID) != "" {
		base.TraceID = override.TraceID
	}
	if strings.TrimSpace(override.Environment) != "" {
		base.Environment = override.Environment
	}
	if strings.TrimSpace(override.Message) != "" {
		base.Message = override.Message
	}
	if strings.TrimSpace(override.Tags) != "" {
		base.Tags = override.Tags
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
