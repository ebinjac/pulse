package alerting

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func (s *Service) NotifyDeploymentObservabilityFailure(application domain.Application, validation domain.DeploymentValidation) {
	if validation.Report.ElfSummary.BlockingFails == 0 {
		return
	}
	routing := application.AlertRouting
	if !routing.Enabled || !routing.SlackWebhook {
		return
	}
	webhookURL := s.slackWebhookURL(ResolvedAlertPolicy{SlackWebhookSecret: routing.SlackWebhookSecret})
	if webhookURL == "" {
		return
	}

	findings := make([]string, 0, 3)
	for _, comparison := range validation.Report.ElfComparisons {
		if comparison.Result != "fail" || !strings.EqualFold(comparison.GateMode, "blocking") {
			continue
		}
		label := comparison.QueryName
		if comparison.ServiceName != "" {
			label = comparison.ServiceName + ": " + label
		}
		findings = append(findings, fmt.Sprintf("%s — %s", label, comparison.Reason))
		if len(findings) >= 3 {
			break
		}
	}

	text := fmt.Sprintf(
		"Pulse observability gate failed for deployment %s (%s). Blocking findings: %s",
		validation.Name,
		application.Name,
		strings.Join(findings, "; "),
	)
	payload := map[string]string{"text": text}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	_ = time.Now().UTC()
}
