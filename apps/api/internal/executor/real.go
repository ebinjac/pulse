package executor

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptrace"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/masking"
	"github.com/ensemble-pulse/pulse/apps/api/internal/scripting"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
	"github.com/ensemble-pulse/pulse/apps/api/internal/variables"
)

type Executor interface {
	Run(monitor domain.Monitor) domain.MonitorRun
	RunDraft(monitor domain.Monitor) domain.MonitorRun
	RunScheduled(monitor domain.Monitor) domain.MonitorRun
	Test(monitor domain.Monitor) domain.MonitorRun
}

type AlertProcessor interface {
	ProcessRun(monitor domain.Monitor, run domain.MonitorRun)
}

type RealExecutor struct {
	store  store.Store
	alerts AlertProcessor
}

func NewRealExecutor(store store.Store, alerts AlertProcessor) *RealExecutor {
	return &RealExecutor{store: store, alerts: alerts}
}

func (e *RealExecutor) Run(monitor domain.Monitor) domain.MonitorRun {
	return e.run(monitor, true, "manual")
}

func (e *RealExecutor) RunDraft(monitor domain.Monitor) domain.MonitorRun {
	return e.run(monitor, true, "draft")
}

func (e *RealExecutor) RunScheduled(monitor domain.Monitor) domain.MonitorRun {
	return e.run(monitor, true, "schedule")
}

func (e *RealExecutor) Test(monitor domain.Monitor) domain.MonitorRun {
	return e.run(monitor, false, "test")
}

func (e *RealExecutor) run(monitor domain.Monitor, saveToStore bool, triggeredBy string) domain.MonitorRun {
	startedAt := time.Now().UTC()
	runID := "run-" + strconv.FormatInt(startedAt.UnixNano(), 10)

	variablesPool := make(map[string]string)
	for k, v := range monitor.Variables {
		variablesPool[k] = v
	}

	secretsPool := make(map[string]string)
	for _, alias := range monitor.SecretAliases {
		if val, ok := e.store.GetRawSecretValue(alias); ok {
			secretsPool[alias] = val
		} else {
			secretsPool[alias] = ""
		}
	}

	stepsPool := make(map[string]map[string]string)
	uuidVal := generateUUID()

	stepRuns := make([]domain.StepRun, 0, len(monitor.Steps))
	var failedStep *domain.StepRun
	var failedStepCategory domain.FailureCategory
	totalDuration := 0

	for _, step := range monitor.Steps {
		resolver := variables.Resolver{
			Variables: variablesPool,
			Secrets:   secretsPool,
			Steps:     stepsPool,
			Now:       time.Now().UTC(),
			UUID:      uuidVal,
		}

		stepStart := time.Now().UTC()
		status := domain.StatusSuccess
		errorMessage := ""
		latency := 0
		var requestSummary string
		var requestBody string
		var requestHeaders map[string]string
		var responseSummary string
		var responseBody string
		var responseHeaders map[string]string
		var statusCode int
		var consoleOutput []string
		var timing domain.HTTPTiming
		extractedVars := make(map[string]string)

		stepOutputs := make(map[string]string)
		assertions := make([]domain.Assertion, len(step.Assertions))
		copy(assertions, step.Assertions)

		var stepFailureCategory domain.FailureCategory

		if step.Type == "preRequest" {
			for _, action := range step.Actions {
				resolvedPreview, _ := resolver.Resolve(action.ConfigPreview)
				val := executePreRequestAction(action.Type, resolvedPreview, resolver)
				variablesPool[action.Output] = val
				stepOutputs[action.Output] = val
			}
			latency = int(time.Since(stepStart).Milliseconds())
			requestSummary = "Executed pre-request actions."
			responseSummary = "Outputs exported to variables pool."
			for _, action := range step.Actions {
				if val, ok := variablesPool[action.Output]; ok {
					extractedVars[action.Output] = val
				}
			}
		} else if step.Type == "delay" {
			result := executeDelayStep(step)
			status = result.status
			errorMessage = result.errorMessage
			latency = result.latencyMS
			requestSummary = result.requestSummary
			responseSummary = result.responseSummary
			stepFailureCategory = result.failureCategory
		} else if step.Type == "dns" {
			result := executeDNSStep(step)
			status = result.status
			errorMessage = result.errorMessage
			latency = result.latencyMS
			requestSummary = result.requestSummary
			responseSummary = result.responseSummary
			stepFailureCategory = result.failureCategory
			if failed, reason := evaluateSyntheticAssertions(assertions, result.actuals, latency); failed {
				status = domain.StatusFailed
				errorMessage = reason
			}
		} else if step.Type == "tcp" {
			result := executeTCPStep(step)
			status = result.status
			errorMessage = result.errorMessage
			latency = result.latencyMS
			requestSummary = result.requestSummary
			responseSummary = result.responseSummary
			stepFailureCategory = result.failureCategory
			if failed, reason := evaluateSyntheticAssertions(assertions, result.actuals, latency); failed {
				status = domain.StatusFailed
				errorMessage = reason
			}
		} else if step.Type == "tls" {
			result := executeTLSStep(step)
			status = result.status
			errorMessage = result.errorMessage
			latency = result.latencyMS
			requestSummary = result.requestSummary
			responseSummary = result.responseSummary
			stepFailureCategory = result.failureCategory
			if failed, reason := evaluateSyntheticAssertions(assertions, result.actuals, latency); failed {
				status = domain.StatusFailed
				errorMessage = reason
				if stepFailureCategory == "" {
					stepFailureCategory = domain.FailureAssertion
				}
			}
		} else if step.Type == "http" {
			scriptHeaders := make(map[string]string)
			scriptBodyOverride := ""
			scriptMethodOverride := ""
			scriptURLOverride := ""
			hasScriptError := false

			if step.PreRequestScript != "" {
				// extract initial body & headers
				initialBody := ""
				if step.Config != nil {
					if bodyVal, ok := step.Config["body"]; ok {
						if bodyStr, isStr := bodyVal.(string); isStr {
							initialBody = bodyStr
						} else {
							bodyBytes, _ := json.Marshal(bodyVal)
							initialBody = string(bodyBytes)
						}
					}
				}
				initialHeaders := make(map[string]string)
				if step.Config != nil {
					if headersVal, ok := step.Config["headers"]; ok {
						if headersMap, ok := headersVal.(map[string]any); ok {
							for hk, hv := range headersMap {
								if hvs, ok := hv.(string); ok {
									initialHeaders[hk] = hvs
								}
							}
						}
					}
				}

				scriptCtx := &scripting.ScriptContext{
					Variables: variablesPool,
					Secrets:   secretsPool,
					Steps:     stepsPool,
					Request: &scripting.RequestOverrides{
						URL:     step.URL,
						Method:  step.Method,
						Headers: initialHeaders,
						Body:    initialBody,
					},
					Console: []string{},
				}

				if err := scripting.Execute(step.PreRequestScript, scriptCtx); err != nil {
					status = domain.StatusError
					errorMessage = "Pre-request script error: " + err.Error()
					hasScriptError = true
				} else {
					scriptURLOverride = scriptCtx.Request.URL
					scriptMethodOverride = scriptCtx.Request.Method
					scriptBodyOverride = scriptCtx.Request.Body
					scriptHeaders = scriptCtx.Request.Headers
				}
				consoleOutput = scriptCtx.Console
			}

			if !hasScriptError {
				targetURL := step.URL
				if scriptURLOverride != "" {
					targetURL = scriptURLOverride
				}
				resolvedURL, err := resolver.Resolve(targetURL)
				if err != nil {
					status = domain.StatusError
					errorMessage = "Variable resolution failure: " + err.Error()
				} else {
					method := step.Method
					if scriptMethodOverride != "" {
						method = scriptMethodOverride
					}
					if method == "" {
						method = "GET"
					}

					var reqBody []byte
					if scriptBodyOverride != "" {
						resolvedBody, _ := resolver.Resolve(scriptBodyOverride)
						reqBody = []byte(resolvedBody)
					} else if step.Config != nil {
						if bodyVal, ok := step.Config["body"]; ok {
							if bodyStr, isStr := bodyVal.(string); isStr {
								resolvedBody, _ := resolver.Resolve(bodyStr)
								reqBody = []byte(resolvedBody)
							} else {
								bodyBytes, _ := json.Marshal(bodyVal)
								resolvedBody, _ := resolver.Resolve(string(bodyBytes))
								reqBody = []byte(resolvedBody)
							}
						}
					}

					req, err := http.NewRequest(method, resolvedURL, bytes.NewBuffer(reqBody))
					if err != nil {
						status = domain.StatusError
						errorMessage = "Failed to create HTTP request: " + err.Error()
					} else {
						// Apply headers
						if len(scriptHeaders) > 0 {
							for hk, hv := range scriptHeaders {
								resolvedHV, _ := resolver.Resolve(hv)
								req.Header.Set(hk, resolvedHV)
							}
						} else if step.Config != nil {
							if headersVal, ok := step.Config["headers"]; ok {
								if headersMap, ok := headersVal.(map[string]any); ok {
									for hk, hv := range headersMap {
										if hvs, ok := hv.(string); ok {
											resolvedHV, _ := resolver.Resolve(hvs)
											req.Header.Set(hk, resolvedHV)
										}
									}
								}
							}
						}

						timeout := 10 * time.Second
						if step.TimeoutMS > 0 {
							timeout = time.Duration(step.TimeoutMS) * time.Millisecond
						}
						client := &http.Client{
							Timeout: timeout,
						}

						timingRecorder := newHTTPTimingRecorder()
						timingRecorder.markRequestStart()
						req = req.WithContext(httptrace.WithClientTrace(req.Context(), timingRecorder.trace()))

						resp, err := client.Do(req)

						if err != nil {
							latency = int(time.Since(stepStart).Milliseconds())
							timing = timingRecorder.breakdown(latency)
							status = domain.StatusFailed
							errorMessage = err.Error()
						} else {
							defer resp.Body.Close()

							limitKB := monitor.ResponseBodyLimitKB
							if limitKB <= 0 {
								limitKB = 32
							}
							limitedReader := io.LimitReader(resp.Body, int64(limitKB*1024))
							respBytes, _ := io.ReadAll(limitedReader)
							timingRecorder.markBodyReadDone()
							latency = int(time.Since(stepStart).Milliseconds())
							timing = timingRecorder.breakdown(latency)
							respStr := string(respBytes)

							// 1. Evaluate Assertions
							hasFailure := false
							for assertIdx, assertion := range assertions {
								actualVal := getActualAssertionValue(assertion, resp, respStr, latency)
								assertions[assertIdx].Actual = actualVal

								if assertionFails(assertion.Operator, actualVal, assertion.Expected) {
									hasFailure = true
								}
							}

							if hasFailure {
								status = domain.StatusFailed
								errorMessage = "One or more assertions failed."
							}

							// 2. Evaluate Extractors
							for _, extractor := range step.Extractors {
								extractedVal := getExtractedValue(extractor, resp, respStr)
								if !extractor.Sensitive {
									extractedVars[extractor.Name] = extractedVal
								} else {
									extractedVars[extractor.Name] = "********"
								}
								variablesPool[extractor.Name] = extractedVal
								stepOutputs[extractor.Name] = extractedVal
							}

							requestSummary = fmt.Sprintf("%s %s", method, resolvedURL)
							responseSummary = fmt.Sprintf("%d %s, %d bytes read", resp.StatusCode, resp.Header.Get("Content-Type"), len(respBytes))
							statusCode = resp.StatusCode
							responseBody = respStr
							// Collect all response headers
							responseHeaders = make(map[string]string)
							for hk, hvs := range resp.Header {
								responseHeaders[hk] = strings.Join(hvs, ", ")
							}
							// Collect request headers that were sent
							requestHeaders = make(map[string]string)
							for hk, hvs := range req.Header {
								requestHeaders[hk] = strings.Join(hvs, ", ")
							}
							requestBody = string(reqBody)
						}
					}
				}
			}
		}

		stepsPool[step.Name] = stepOutputs
		totalDuration += latency

		stepRun := domain.StepRun{
			ID:              runID + "-" + step.ID,
			StepID:          step.ID,
			StepName:        step.Name,
			Type:            step.Type,
			Status:          status,
			LatencyMS:       latency,
			Timing:          timing,
			RequestSummary:  requestSummary,
			RequestBody:     requestBody,
			RequestHeaders:  requestHeaders,
			ResponseSummary: responseSummary,
			StatusCode:      statusCode,
			ResponseBody:    responseBody,
			ResponseHeaders: responseHeaders,
			Assertions:      maskAssertionsReal(assertions),
			Extractors:      step.Extractors,
			ExtractedVars:   extractedVars,
			ErrorMessage:    errorMessage,
			ConsoleOutput:   consoleOutput,
		}

		if status != domain.StatusSuccess && failedStep == nil {
			copyStep := stepRun
			failedStep = &copyStep
			failedStepCategory = stepFailureCategory
		}

		stepRuns = append(stepRuns, stepRun)

		if status != domain.StatusSuccess && !step.ContinueOnFailure {
			break
		}
	}

	endedAt := startedAt.Add(time.Duration(totalDuration) * time.Millisecond)
	run := domain.MonitorRun{
		ID:          runID,
		MonitorID:   monitor.ID,
		MonitorName: monitor.Name,
		Status:      domain.StatusSuccess,
		TriggeredBy: triggeredBy,
		StartedAt:   startedAt,
		EndedAt:     endedAt,
		DurationMS:  totalDuration,
		Steps:       stepRuns,
	}

	if failedStep != nil {
		run.Status = failedStep.Status
		run.FailureReason = failedStep.ErrorMessage
		run.FailureCategory = domain.FailureAssertion
		if failedStepCategory != "" {
			run.FailureCategory = failedStepCategory
		}
	}

	if saveToStore {
		e.store.SaveRun(run)
		if e.alerts != nil && triggeredBy != "draft" && triggeredBy != "test" {
			e.alerts.ProcessRun(monitor, run)
		}
	}
	return run
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

type httpTimingRecorder struct {
	requestStart         time.Time
	dnsStart             time.Time
	dnsDone              time.Time
	connectStart         time.Time
	connectDone          time.Time
	tlsHandshakeStart    time.Time
	tlsHandshakeDone     time.Time
	wroteRequest         time.Time
	gotFirstResponseByte time.Time
	bodyReadDone         time.Time
}

func newHTTPTimingRecorder() *httpTimingRecorder {
	return &httpTimingRecorder{}
}

func (r *httpTimingRecorder) markRequestStart() {
	r.requestStart = time.Now().UTC()
}

func (r *httpTimingRecorder) markBodyReadDone() {
	r.bodyReadDone = time.Now().UTC()
}

func (r *httpTimingRecorder) trace() *httptrace.ClientTrace {
	return &httptrace.ClientTrace{
		DNSStart: func(_ httptrace.DNSStartInfo) {
			r.dnsStart = time.Now().UTC()
		},
		DNSDone: func(_ httptrace.DNSDoneInfo) {
			r.dnsDone = time.Now().UTC()
		},
		ConnectStart: func(_, _ string) {
			r.connectStart = time.Now().UTC()
		},
		ConnectDone: func(_, _ string, _ error) {
			r.connectDone = time.Now().UTC()
		},
		TLSHandshakeStart: func() {
			r.tlsHandshakeStart = time.Now().UTC()
		},
		TLSHandshakeDone: func(_ tls.ConnectionState, _ error) {
			r.tlsHandshakeDone = time.Now().UTC()
		},
		WroteRequest: func(_ httptrace.WroteRequestInfo) {
			r.wroteRequest = time.Now().UTC()
		},
		GotFirstResponseByte: func() {
			r.gotFirstResponseByte = time.Now().UTC()
		},
	}
}

func (r *httpTimingRecorder) breakdown(totalMS int) domain.HTTPTiming {
	timing := domain.HTTPTiming{
		DNSLookupMS:    durationMS(r.dnsStart, r.dnsDone),
		TCPConnectMS:   durationMS(r.connectStart, r.connectDone),
		TLSHandshakeMS: durationMS(r.tlsHandshakeStart, r.tlsHandshakeDone),
		TotalMS:        totalMS,
	}

	if !r.gotFirstResponseByte.IsZero() {
		waitStart := r.wroteRequest
		if waitStart.IsZero() {
			waitStart = r.requestStart
		}
		timing.TimeToFirstByteMS = durationMS(waitStart, r.gotFirstResponseByte)
	}
	if !r.bodyReadDone.IsZero() && !r.gotFirstResponseByte.IsZero() {
		timing.DownloadMS = durationMS(r.gotFirstResponseByte, r.bodyReadDone)
	}
	if timing.TotalMS <= 0 && !r.requestStart.IsZero() {
		end := r.bodyReadDone
		if end.IsZero() {
			end = time.Now().UTC()
		}
		timing.TotalMS = durationMS(r.requestStart, end)
	}

	return timing
}

func durationMS(start time.Time, end time.Time) int {
	if start.IsZero() || end.IsZero() || end.Before(start) {
		return 0
	}
	return int(end.Sub(start).Milliseconds())
}

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
