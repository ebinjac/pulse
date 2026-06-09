package executor

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptrace"
	"strconv"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
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
	cookieJar, _ := cookiejar.New(nil)
	certificateProfiles := e.store.ListCertificateProfiles()

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
		var scriptSubRequests []scripting.SubRequestTrace
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
			if step.PreRequestScript != "" {
				scriptCtx := &scripting.ScriptContext{
					Variables: variablesPool,
					Secrets:   secretsPool,
					Steps:     stepsPool,
					Request: &scripting.RequestOverrides{
						Headers: map[string]string{},
					},
					Console:             []string{},
					ResponseBodyLimitKB: monitor.ResponseBodyLimitKB,
				}
				if err := scripting.Execute(step.PreRequestScript, scriptCtx); err != nil {
					status = domain.StatusError
					errorMessage = "Pre-request script error: " + err.Error()
					stepFailureCategory = domain.FailureUnknown
				}
				consoleOutput = scriptCtx.Console
				scriptSubRequests = scriptCtx.SubRequests
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
					Console:             []string{},
					ResponseBodyLimitKB: monitor.ResponseBodyLimitKB,
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
				scriptSubRequests = scriptCtx.SubRequests
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

						if err := applyAuthConfig(req, step.Config, resolver); err != nil {
							status = domain.StatusError
							errorMessage = "Authorization configuration error: " + err.Error()
							latency = int(time.Since(stepStart).Milliseconds())
						}

						if status != domain.StatusError {
							if err := applyCookieConfig(req, step.Config, resolver); err != nil {
								status = domain.StatusError
								errorMessage = "Cookie configuration error: " + err.Error()
								latency = int(time.Since(stepStart).Milliseconds())
							}
						}

						if status != domain.StatusError {
							transport, err := transportForStep(step.Config, resolver, secretsPool, req.URL, certificateProfiles, e.store.GetRawSecretValue)
							if err != nil {
								status = domain.StatusError
								errorMessage = "Network security configuration error: " + err.Error()
								latency = int(time.Since(stepStart).Milliseconds())
							} else {
								timeout := 10 * time.Second
								if step.TimeoutMS > 0 {
									timeout = time.Duration(step.TimeoutMS) * time.Millisecond
								}
								client := &http.Client{
									Timeout: timeout,
									Jar:     jarForStep(step.Config, cookieJar),
								}
								if transport != nil {
									client.Transport = transport
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
									requestHeaders = safeRequestHeaders(req.Header)
									requestBody = string(reqBody)
								}
							}
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
		stepRuns = append(stepRuns, subRequestStepRuns(runID, step, scriptSubRequests)...)

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
