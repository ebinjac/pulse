package executor

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func stepConfigString(config map[string]any, key string) string {
	if config == nil {
		return ""
	}
	value, ok := config[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case float64:
		return strconv.Itoa(int(typed))
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case bool:
		return strconv.FormatBool(typed)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func stepConfigInt(config map[string]any, key string, fallback int) int {
	raw := stepConfigString(config, key)
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return parsed
}

func stepTimeout(step domain.MonitorStep, fallbackMS int) time.Duration {
	timeoutMS := step.TimeoutMS
	if timeoutMS <= 0 {
		timeoutMS = stepConfigInt(step.Config, "timeoutMs", fallbackMS)
	}
	if timeoutMS <= 0 {
		timeoutMS = fallbackMS
	}
	return time.Duration(timeoutMS) * time.Millisecond
}

type syntheticStepResult struct {
	status          domain.MonitorStatus
	errorMessage    string
	latencyMS       int
	requestSummary  string
	responseSummary string
	failureCategory domain.FailureCategory
	actuals         map[string]string
}

func executeDelayStep(step domain.MonitorStep) syntheticStepResult {
	delayMS := step.TimeoutMS
	if delayMS <= 0 {
		delayMS = stepConfigInt(step.Config, "delayMs", 1000)
	}
	if delayMS < 0 {
		delayMS = 0
	}
	time.Sleep(time.Duration(delayMS) * time.Millisecond)
	return syntheticStepResult{
		status:          domain.StatusSuccess,
		latencyMS:       delayMS,
		requestSummary:  fmt.Sprintf("Delay %dms", delayMS),
		responseSummary: "Wait completed",
	}
}

func executeDNSStep(step domain.MonitorStep) syntheticStepResult {
	started := time.Now()
	host := stepConfigString(step.Config, "host")
	if host == "" {
		host = strings.TrimSpace(step.URL)
	}
	recordType := strings.ToUpper(stepConfigString(step.Config, "recordType"))
	if recordType == "" {
		recordType = "A"
	}
	if host == "" {
		return syntheticStepResult{
			status:          domain.StatusFailed,
			errorMessage:    "DNS host is required",
			latencyMS:       int(time.Since(started).Milliseconds()),
			requestSummary:  "DNS lookup",
			failureCategory: domain.FailureDNS,
		}
	}

	timeout := stepTimeout(step, 5000)
	resolver := &net.Resolver{}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	actuals := make(map[string]string)
	var records []string
	var err error

	switch recordType {
	case "CNAME":
		cname, lookupErr := resolver.LookupCNAME(ctx, host)
		err = lookupErr
		if lookupErr == nil {
			records = []string{strings.TrimSuffix(cname, ".")}
			actuals["cname"] = records[0]
		}
	case "AAAA":
		ips, lookupErr := resolver.LookupIP(ctx, "ip6", host)
		err = lookupErr
		for _, ip := range ips {
			records = append(records, ip.String())
		}
		actuals["records"] = strings.Join(records, ", ")
	default:
		ips, lookupErr := resolver.LookupIP(ctx, "ip4", host)
		err = lookupErr
		for _, ip := range ips {
			records = append(records, ip.String())
		}
		actuals["records"] = strings.Join(records, ", ")
		recordType = "A"
	}

	latency := int(time.Since(started).Milliseconds())
	if err != nil {
		return syntheticStepResult{
			status:          domain.StatusFailed,
			errorMessage:    err.Error(),
			latencyMS:       latency,
			requestSummary:  fmt.Sprintf("DNS %s %s", recordType, host),
			responseSummary: "Lookup failed",
			failureCategory: domain.FailureDNS,
			actuals:         actuals,
		}
	}
	if len(records) == 0 {
		return syntheticStepResult{
			status:          domain.StatusFailed,
			errorMessage:    "no DNS records returned",
			latencyMS:       latency,
			requestSummary:  fmt.Sprintf("DNS %s %s", recordType, host),
			responseSummary: "No records",
			failureCategory: domain.FailureDNS,
			actuals:         actuals,
		}
	}

	if expected := stepConfigString(step.Config, "expected"); expected != "" {
		matched := false
		for _, record := range records {
			if strings.Contains(record, expected) {
				matched = true
				break
			}
		}
		if !matched {
			return syntheticStepResult{
				status:          domain.StatusFailed,
				errorMessage:    fmt.Sprintf("expected DNS record %q not found in %s", expected, strings.Join(records, ", ")),
				latencyMS:       latency,
				requestSummary:  fmt.Sprintf("DNS %s %s", recordType, host),
				responseSummary: strings.Join(records, ", "),
				failureCategory: domain.FailureDNS,
				actuals:         actuals,
			}
		}
	}

	return syntheticStepResult{
		status:          domain.StatusSuccess,
		latencyMS:       latency,
		requestSummary:  fmt.Sprintf("DNS %s %s", recordType, host),
		responseSummary: strings.Join(records, ", "),
		actuals:         actuals,
	}
}

func executeTCPStep(step domain.MonitorStep) syntheticStepResult {
	started := time.Now()
	host := stepConfigString(step.Config, "host")
	if host == "" {
		host = strings.TrimSpace(step.URL)
	}
	port := stepConfigInt(step.Config, "port", 443)
	if host == "" {
		return syntheticStepResult{
			status:          domain.StatusFailed,
			errorMessage:    "TCP host is required",
			latencyMS:       int(time.Since(started).Milliseconds()),
			requestSummary:  "TCP connect",
			failureCategory: domain.FailureConnection,
		}
	}

	address := net.JoinHostPort(host, strconv.Itoa(port))
	timeout := stepTimeout(step, 5000)
	conn, err := net.DialTimeout("tcp", address, timeout)
	latency := int(time.Since(started).Milliseconds())
	if err != nil {
		return syntheticStepResult{
			status:          domain.StatusFailed,
			errorMessage:    err.Error(),
			latencyMS:       latency,
			requestSummary:  fmt.Sprintf("TCP %s", address),
			responseSummary: "Connection failed",
			failureCategory: domain.FailureConnection,
		}
	}
	_ = conn.Close()

	return syntheticStepResult{
		status:          domain.StatusSuccess,
		latencyMS:       latency,
		requestSummary:  fmt.Sprintf("TCP %s", address),
		responseSummary: "Port open",
		actuals: map[string]string{
			"port": strconv.Itoa(port),
		},
	}
}

func executeTLSStep(step domain.MonitorStep) syntheticStepResult {
	started := time.Now()
	host := stepConfigString(step.Config, "host")
	if host == "" {
		host = strings.TrimSpace(step.URL)
	}
	port := stepConfigInt(step.Config, "port", 443)
	if host == "" {
		return syntheticStepResult{
			status:          domain.StatusFailed,
			errorMessage:    "TLS host is required",
			latencyMS:       int(time.Since(started).Milliseconds()),
			requestSummary:  "TLS handshake",
			failureCategory: domain.FailureTLS,
		}
	}

	address := net.JoinHostPort(host, strconv.Itoa(port))
	timeout := stepTimeout(step, 8000)
	dialer := &net.Dialer{Timeout: timeout}
	conn, err := tls.DialWithDialer(dialer, "tcp", address, &tls.Config{
		ServerName: host,
		MinVersion: tls.VersionTLS12,
	})
	latency := int(time.Since(started).Milliseconds())
	if err != nil {
		return syntheticStepResult{
			status:          domain.StatusFailed,
			errorMessage:    err.Error(),
			latencyMS:       latency,
			requestSummary:  fmt.Sprintf("TLS %s", address),
			responseSummary: "Handshake failed",
			failureCategory: domain.FailureTLS,
		}
	}
	defer conn.Close()

	state := conn.ConnectionState()
	daysUntilExpiry := 0
	expiresAt := ""
	if len(state.PeerCertificates) > 0 {
		cert := state.PeerCertificates[0]
		expiresAt = cert.NotAfter.UTC().Format(time.RFC3339)
		daysUntilExpiry = int(time.Until(cert.NotAfter).Hours() / 24)
	}

	return syntheticStepResult{
		status:          domain.StatusSuccess,
		latencyMS:       latency,
		requestSummary:  fmt.Sprintf("TLS %s", address),
		responseSummary: fmt.Sprintf("Certificate expires %s (%d days)", expiresAt, daysUntilExpiry),
		actuals: map[string]string{
			"certExpiryDays": strconv.Itoa(daysUntilExpiry),
			"certExpiresAt":  expiresAt,
			"tlsVersion":     tlsVersionLabel(state.Version),
		},
	}
}

func tlsVersionLabel(version uint16) string {
	switch version {
	case tls.VersionTLS13:
		return "TLS 1.3"
	case tls.VersionTLS12:
		return "TLS 1.2"
	default:
		return fmt.Sprintf("0x%x", version)
	}
}

func evaluateSyntheticAssertions(assertions []domain.Assertion, actuals map[string]string, latencyMS int) (bool, string) {
	hasFailure := false
	reasons := make([]string, 0)
	for assertIdx, assertion := range assertions {
		actual := syntheticAssertionActual(assertion, actuals, latencyMS)
		assertions[assertIdx].Actual = actual
		if assertionFails(assertion.Operator, actual, assertion.Expected) {
			hasFailure = true
			reasons = append(reasons, fmt.Sprintf("%s expected %s %s %s", assertion.Label, assertion.Operator, assertion.Expected, actual))
		}
	}
	if !hasFailure {
		return false, ""
	}
	return true, strings.Join(reasons, "; ")
}

func syntheticAssertionActual(assertion domain.Assertion, actuals map[string]string, latencyMS int) string {
	switch assertion.Type {
	case "responseTime":
		return strconv.Itoa(latencyMS)
	case "certExpiryDays", "tlsCertExpiryDays":
		return actuals["certExpiryDays"]
	case "dnsRecords", "bodyContains":
		return actuals["records"]
	case "header":
		return actuals[assertion.Target]
	default:
		if value, ok := actuals[assertion.Type]; ok {
			return value
		}
		if value, ok := actuals[assertion.Target]; ok {
			return value
		}
		return actuals["records"]
	}
}
