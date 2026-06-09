package elfanalytics

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
	"github.com/ensemble-pulse/pulse/apps/api/internal/elfsearch"
)

type ComparativeRunner struct {
	Runner *elfsearch.Runner
}

func (c *ComparativeRunner) RunSignal(
	ctx context.Context,
	query domain.ElfQuery,
	application domain.Application,
	service *domain.ApplicationService,
	windows TimeWindows,
	searchCtx elfsearch.SearchContext,
) (domain.ElfQueryRunResult, error) {
	started := time.Now().UTC()
	mapping := ResolveMapping(application, service)

	result := domain.ElfQueryRunResult{
		QueryID:    query.ID,
		QueryName:  query.Name,
		GateMode:   query.GateMode,
		SignalType: query.SignalType,
		RanAt:      started,
	}
	if service != nil {
		result.ServiceID = service.ID
		result.ServiceName = service.LogServiceName
	}

	elfAppID := strings.TrimSpace(searchCtx.ElfAppID)
	if elfAppID == "" {
		elfAppID = elfsearch.ResolveElfAppIDForService(query, application, service)
	}
	result.ElfAppID = elfAppID

	logServiceName := searchCtx.LogServiceName
	if logServiceName == "" && service != nil {
		logServiceName = service.LogServiceName
	}
	environment := searchCtx.Environment
	if environment == "" && service != nil && strings.TrimSpace(service.Environment) != "" {
		environment = service.Environment
	}

	templateCtx := TemplateContext{
		DeployStart:    windows.DeployStart,
		DeployEnd:      windows.DeployEnd,
		BaselineStart:  windows.BaselineStart,
		Environment:    environment,
		ElfAppID:       elfAppID,
		LogServiceName: logServiceName,
	}

	signalType := query.SignalType
	if signalType == "" {
		signalType = SignalCustom
	}

	postBody := SubstituteTemplates(string(BuildSignalSearchBody(signalType, mapping, false)), templateCtx)
	baselineBody := SubstituteTemplates(string(BuildSignalSearchBody(signalType, mapping, true)), templateCtx)

	if signalType == SignalCustom {
		bodySource := query.SearchBody
		if query.CheckKind != "" && query.CheckKind != "raw" && len(query.GeneratedSearchBody) > 0 {
			bodySource = query.GeneratedSearchBody
		}
		if len(bodySource) > 0 {
			postBody = SubstituteTemplates(string(bodySource), templateCtx)
			baselineBody = SubstituteTemplates(string(bodySource), templateCtx)
		}
	}

	postParsed, resolvedURL, err := c.executeSearch(ctx, query, application, service, elfAppID, postBody)
	if err != nil {
		result.Result = "fail"
		result.ErrorMessage = err.Error()
		result.ResolvedURL = resolvedURL
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}
	baselineParsed, _, err := c.executeSearch(ctx, query, application, service, elfAppID, baselineBody)
	if err != nil {
		result.Result = "fail"
		result.ErrorMessage = err.Error()
		result.ResolvedURL = resolvedURL
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}

	result.ResolvedURL = resolvedURL
	result.HitCount = postParsed.HitCount
	criteriaResult, reason, metrics := EvaluateComparative(query, postParsed, baselineParsed)
	result.BaselineValue = metrics.BaselineValue
	result.PostValue = metrics.PostValue
	result.DeltaPct = metrics.DeltaPct
	result.Facets = metrics.Facets
	result.Reason = reason
	result.Result = GateResult(query.GateMode, criteriaResult)

	samples := make([]domain.ElfStructuredSampleHit, 0, len(postParsed.Hits))
	textSamples := make([]string, 0, len(postParsed.Hits))
	for _, hit := range postParsed.Hits {
		structured := ParseHitSource(hit, mapping)
		samples = append(samples, structured)
		if structured.Message != "" {
			textSamples = append(textSamples, structured.Message)
		}
	}
	result.StructuredSamples = samples
	result.SampleHits = textSamples
	result.DurationMS = int(time.Since(started).Milliseconds())
	return result, nil
}

func (c *ComparativeRunner) executeSearch(
	ctx context.Context,
	query domain.ElfQuery,
	application domain.Application,
	service *domain.ApplicationService,
	elfAppID string,
	body string,
) (ParsedResponse, string, error) {
	settings := c.Runner.Settings.GetElfProxySettings()
	template := elfsearch.ResolveIndexTemplate(query, application, settings, service)
	indexPath, err := elfsearch.ResolveIndexPath(template, elfAppID)
	if err != nil {
		return ParsedResponse{}, "", err
	}
	searchURL, err := elfsearch.BuildSearchURL(settings, indexPath)
	if err != nil {
		return ParsedResponse{}, "", err
	}

	token, ok := c.Runner.Secrets.GetRawSecretValue("elfProxyBearerToken")
	if !ok || strings.TrimSpace(token) == "" {
		return ParsedResponse{}, searchURL, fmt.Errorf("elf proxy bearer token is not configured")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, searchURL, bytes.NewReader([]byte(body)))
	if err != nil {
		return ParsedResponse{}, searchURL, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := c.Runner.Client
	if client == nil {
		timeout := time.Duration(settings.TimeoutSeconds) * time.Second
		if timeout <= 0 {
			timeout = 30 * time.Second
		}
		client = &http.Client{Timeout: timeout}
	}

	resp, err := client.Do(req)
	if err != nil {
		return ParsedResponse{}, searchURL, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return ParsedResponse{}, searchURL, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ParsedResponse{}, searchURL, fmt.Errorf("elf proxy returned status %d", resp.StatusCode)
	}

	parsed, err := ParseResponse(respBody)
	if err != nil {
		return ParsedResponse{}, searchURL, err
	}
	_ = application
	return parsed, searchURL, nil
}

func BuildComparativeQueryFromSignal(signal BuiltInSignal, applicationID, serviceID string, mapping domain.LogFieldMapping) domain.ElfQuery {
	return SignalToQuery(signal, applicationID, serviceID, mapping)
}

func UnmarshalSearchBody(body string) json.RawMessage {
	return json.RawMessage(body)
}
