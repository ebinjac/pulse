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

type SecretReader interface {
	GetRawSecretValue(alias string) (string, bool)
}

type SettingsReader interface {
	GetElfProxySettings() domain.ElfProxySettings
}

type Runner struct {
	Settings SettingsReader
	Secrets  SecretReader
	Client   *http.Client
}

type SearchContext struct {
	ElfAppID               string
	ApplicationID          string
	CarID                  string
	DeploymentValidationID string
	BuildID                string
	Version                string
	Environment            string
	LogServiceName         string
	DeploymentStartedAt    time.Time
	DeploymentEndedAt      time.Time
	BaselineStartedAt      time.Time
}

func (r *Runner) RunQuery(ctx context.Context, query domain.ElfQuery, application domain.Application, searchCtx SearchContext) (domain.ElfQueryRunResult, error) {
	started := time.Now().UTC()
	result := domain.ElfQueryRunResult{
		QueryID:   query.ID,
		QueryName: query.Name,
		GateMode:  query.GateMode,
		RanAt:     started,
	}

	settings := r.Settings.GetElfProxySettings()
	elfAppID := strings.TrimSpace(searchCtx.ElfAppID)
	if elfAppID == "" {
		elfAppID = ResolveElfAppID(query, application)
	}
	result.ElfAppID = elfAppID

	template := ResolveIndexTemplate(query, application, settings, nil)
	indexPath, err := ResolveIndexPath(template, elfAppID)
	if err != nil {
		result.Result = "fail"
		result.ErrorMessage = err.Error()
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}

	searchURL, err := BuildSearchURL(settings, indexPath)
	if err != nil {
		result.Result = "fail"
		result.ErrorMessage = err.Error()
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}
	result.ResolvedURL = searchURL

	token, ok := r.Secrets.GetRawSecretValue("elfProxyBearerToken")
	if !ok || strings.TrimSpace(token) == "" {
		err = fmt.Errorf("elf proxy bearer token is not configured")
		result.Result = "fail"
		result.ErrorMessage = err.Error()
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}

	body := EffectiveSearchBody(query)
	if len(body) == 0 {
		body = json.RawMessage(`{"query":{"match_all":{}},"size":0}`)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, searchURL, bytes.NewReader(body))
	if err != nil {
		result.Result = "fail"
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
		result.Result = "fail"
		result.ErrorMessage = redactToken(err.Error(), token)
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		result.Result = "fail"
		result.ErrorMessage = err.Error()
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err = fmt.Errorf("elf proxy returned status %d: %s", resp.StatusCode, truncate(string(respBody), 512))
		result.Result = "fail"
		result.ErrorMessage = redactToken(err.Error(), token)
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}

	var parsed SearchResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		result.Result = "fail"
		result.ErrorMessage = err.Error()
		result.DurationMS = int(time.Since(started).Milliseconds())
		return result, err
	}

	result.HitCount = parsed.Hits.Total.Value
	result.SampleHits = ExtractSampleHits(parsed, 3, 2048)
	criteriaResult, reason := EvaluatePassCriteria(query.PassCriteria, parsed)
	result.Reason = reason
	result.Result = GateResult(query.GateMode, criteriaResult)
	result.DurationMS = int(time.Since(started).Milliseconds())
	return result, nil
}

func redactToken(message, token string) string {
	if token == "" {
		return message
	}
	return strings.ReplaceAll(message, token, "***")
}
