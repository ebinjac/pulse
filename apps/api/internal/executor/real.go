package executor

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/sha512"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptrace"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/masking"
	"github.com/ensemble-pulse/pulse/apps/api/internal/scripting"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
	"github.com/ensemble-pulse/pulse/apps/api/internal/variables"
	pkcs12 "software.sslmate.com/src/go-pkcs12"
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

func applyAuthConfig(req *http.Request, config map[string]any, resolver variables.Resolver) error {
	if config == nil {
		return nil
	}
	authMap, ok := config["auth"].(map[string]any)
	if !ok {
		return nil
	}
	authType := strings.TrimSpace(stringFromAny(authMap["type"]))
	if authType == "" || authType == "noAuth" {
		return nil
	}

	switch authType {
	case "apiKey":
		key, err := resolveConfigString(authMap["key"], resolver)
		if err != nil {
			return err
		}
		value, err := resolveConfigString(authMap["value"], resolver)
		if err != nil {
			return err
		}
		if key == "" {
			return fmt.Errorf("api key name is required")
		}
		if authMap["addTo"] == "query" {
			query := req.URL.Query()
			query.Set(key, value)
			req.URL.RawQuery = query.Encode()
		} else {
			req.Header.Set(key, value)
		}
	case "bearer":
		token, err := resolveConfigString(authMap["token"], resolver)
		if err != nil {
			return err
		}
		if token == "" {
			return fmt.Errorf("bearer token is required")
		}
		req.Header.Set("Authorization", "Bearer "+token)
	case "basic":
		username, err := resolveConfigString(authMap["username"], resolver)
		if err != nil {
			return err
		}
		password, err := resolveConfigString(authMap["password"], resolver)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(username+":"+password)))
	case "jwtBearer":
		token, err := jwtBearerToken(authMap, resolver)
		if err != nil {
			return err
		}
		addTo := stringFromAny(authMap["addTo"])
		prefix := stringFromAny(authMap["headerPrefix"])
		if prefix == "" {
			prefix = "Bearer"
		}
		if addTo == "query" {
			key := stringFromAny(authMap["queryKey"])
			if key == "" {
				key = "jwt"
			}
			query := req.URL.Query()
			query.Set(key, token)
			req.URL.RawQuery = query.Encode()
		} else {
			headerName := stringFromAny(authMap["headerName"])
			if headerName == "" {
				headerName = "Authorization"
			}
			if prefix != "" {
				token = prefix + " " + token
			}
			req.Header.Set(headerName, token)
		}
	default:
		return fmt.Errorf("unsupported auth type %q", authType)
	}

	return nil
}

func applyCookieConfig(req *http.Request, config map[string]any, resolver variables.Resolver) error {
	cookieMap := configMap(config, "cookies")
	if cookieMap == nil || !cookieConfigEnabled(cookieMap) {
		return nil
	}
	manual, ok := cookieMap["manual"].([]any)
	if !ok {
		return nil
	}

	for _, item := range manual {
		row, ok := item.(map[string]any)
		if !ok {
			continue
		}
		name, err := resolveConfigString(row["name"], resolver)
		if err != nil {
			return err
		}
		value, err := resolveConfigString(row["value"], resolver)
		if err != nil {
			return err
		}
		if strings.TrimSpace(name) == "" {
			continue
		}
		cookie := &http.Cookie{Name: strings.TrimSpace(name), Value: value}
		if path, err := resolveConfigString(row["path"], resolver); err != nil {
			return err
		} else if strings.TrimSpace(path) != "" {
			cookie.Path = strings.TrimSpace(path)
		}
		if domain, err := resolveConfigString(row["domain"], resolver); err != nil {
			return err
		} else if strings.TrimSpace(domain) != "" {
			cookie.Domain = strings.TrimSpace(domain)
		}
		req.AddCookie(cookie)
	}

	return nil
}

func jarForStep(config map[string]any, jar http.CookieJar) http.CookieJar {
	cookieMap := configMap(config, "cookies")
	if cookieMap == nil {
		return jar
	}
	if !cookieConfigEnabled(cookieMap) {
		return nil
	}
	return jar
}

func cookieConfigEnabled(cookieMap map[string]any) bool {
	if value, ok := cookieMap["enabled"]; ok {
		return boolFromAny(value)
	}
	return true
}

type rawSecretLookup func(alias string) (string, bool)

func transportForStep(config map[string]any, resolver variables.Resolver, secrets map[string]string, requestURL *url.URL, profiles []domain.CertificateProfile, lookup rawSecretLookup) (*http.Transport, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	tlsConfig, err := tlsConfigForStep(config, resolver, secrets, requestURL, profiles, lookup)
	if err != nil {
		return nil, err
	}
	if tlsConfig != nil {
		transport.TLSClientConfig = tlsConfig
	}
	proxy, err := proxyForStep(config, resolver)
	if err != nil {
		return nil, err
	}
	if proxy != nil {
		transport.Proxy = http.ProxyURL(proxy)
	}
	return transport, nil
}

func tlsConfigForStep(config map[string]any, resolver variables.Resolver, secrets map[string]string, requestURL *url.URL, profiles []domain.CertificateProfile, lookup rawSecretLookup) (*tls.Config, error) {
	mtlsMap := configMap(config, "mtls")
	mode := "global"
	if mtlsMap != nil {
		if configuredMode := strings.TrimSpace(stringFromAny(mtlsMap["mode"])); configuredMode != "" {
			mode = configuredMode
		} else if boolFromAny(mtlsMap["enabled"]) {
			mode = "custom"
		}
	}
	if mode == "none" {
		return nil, nil
	}
	if mode == "profile" {
		profileID, err := resolveConfigString(mtlsMap["profileId"], resolver)
		if err != nil {
			return nil, err
		}
		profile, ok := certificateProfileByID(profiles, profileID)
		if !ok || !profile.IsActive {
			return nil, fmt.Errorf("certificate profile %q was not found or is inactive", profileID)
		}
		return tlsConfigFromCertificateProfile(profile, lookup)
	}
	if mode == "global" {
		profile, ok := matchingCertificateProfile(profiles, requestURL)
		if !ok {
			return nil, nil
		}
		return tlsConfigFromCertificateProfile(profile, lookup)
	}
	if mtlsMap == nil {
		return nil, nil
	}

	tlsConfig := &tls.Config{
		InsecureSkipVerify: boolFromAny(mtlsMap["insecureSkipVerify"]), //nolint:gosec // Explicit user-controlled monitor setting, default false.
	}

	certAlias, err := resolveConfigString(mtlsMap["certSecretAlias"], resolver)
	if err != nil {
		return nil, err
	}
	keyAlias, err := resolveConfigString(mtlsMap["keySecretAlias"], resolver)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(certAlias) != "" || strings.TrimSpace(keyAlias) != "" {
		if strings.TrimSpace(certAlias) == "" || strings.TrimSpace(keyAlias) == "" {
			return nil, fmt.Errorf("both certificate and key secret aliases are required for mTLS")
		}
		certPEM, ok := secrets[strings.TrimSpace(certAlias)]
		if !ok || certPEM == "" {
			return nil, fmt.Errorf("certificate secret alias %q was not found", strings.TrimSpace(certAlias))
		}
		keyPEM, ok := secrets[strings.TrimSpace(keyAlias)]
		if !ok || keyPEM == "" {
			return nil, fmt.Errorf("private key secret alias %q was not found", strings.TrimSpace(keyAlias))
		}
		certificate, err := tls.X509KeyPair([]byte(certPEM), []byte(keyPEM))
		if err != nil {
			return nil, fmt.Errorf("load client certificate: %w", err)
		}
		tlsConfig.Certificates = []tls.Certificate{certificate}
	}

	caAlias, err := resolveConfigString(mtlsMap["caCertSecretAlias"], resolver)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(caAlias) != "" {
		caPEM, ok := secrets[strings.TrimSpace(caAlias)]
		if !ok || caPEM == "" {
			return nil, fmt.Errorf("CA certificate secret alias %q was not found", strings.TrimSpace(caAlias))
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM([]byte(caPEM)) {
			return nil, fmt.Errorf("CA certificate secret alias %q did not contain valid PEM certificates", strings.TrimSpace(caAlias))
		}
		tlsConfig.RootCAs = pool
	}

	return tlsConfig, nil
}

func tlsConfigFromCertificateProfile(profile domain.CertificateProfile, lookup rawSecretLookup) (*tls.Config, error) {
	tlsConfig := &tls.Config{
		InsecureSkipVerify: profile.InsecureSkipVerify, //nolint:gosec // Explicit user-controlled monitor setting, default false.
	}
	passphrase := ""
	if profile.PassphraseSecretAlias != "" {
		passphrase, _ = lookup(profile.PassphraseSecretAlias)
	}
	switch profile.CertType {
	case "pfx":
		pfxValue, ok := lookup(profile.PFXSecretAlias)
		if !ok || strings.TrimSpace(pfxValue) == "" {
			return nil, fmt.Errorf("PFX/P12 secret alias %q was not found", profile.PFXSecretAlias)
		}
		pfxBytes, err := decodeBase64FileValue(pfxValue)
		if err != nil {
			return nil, err
		}
		privateKey, certificate, caCerts, err := pkcs12.DecodeChain(pfxBytes, passphrase)
		if err != nil {
			return nil, fmt.Errorf("parse PFX/P12 bundle: %w", err)
		}
		tlsConfig.Certificates = []tls.Certificate{{
			Certificate: [][]byte{certificate.Raw},
			PrivateKey:  privateKey,
			Leaf:        certificate,
		}}
		if len(caCerts) > 0 {
			pool := x509.NewCertPool()
			for _, cert := range caCerts {
				pool.AddCert(cert)
			}
			tlsConfig.RootCAs = pool
		}
	default:
		certPEM, ok := lookup(profile.CertSecretAlias)
		if !ok || strings.TrimSpace(certPEM) == "" {
			return nil, fmt.Errorf("certificate secret alias %q was not found", profile.CertSecretAlias)
		}
		keyPEM, ok := lookup(profile.KeySecretAlias)
		if !ok || strings.TrimSpace(keyPEM) == "" {
			return nil, fmt.Errorf("private key secret alias %q was not found", profile.KeySecretAlias)
		}
		certificate, err := keyPairFromPEM([]byte(certPEM), []byte(keyPEM), passphrase)
		if err != nil {
			return nil, err
		}
		tlsConfig.Certificates = []tls.Certificate{certificate}
	}
	if profile.CACertSecretAlias != "" {
		caPEM, ok := lookup(profile.CACertSecretAlias)
		if !ok || strings.TrimSpace(caPEM) == "" {
			return nil, fmt.Errorf("CA certificate secret alias %q was not found", profile.CACertSecretAlias)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM([]byte(caPEM)) {
			return nil, fmt.Errorf("CA certificate secret alias %q did not contain valid PEM certificates", profile.CACertSecretAlias)
		}
		tlsConfig.RootCAs = pool
	}
	return tlsConfig, nil
}

func certificateProfileByID(profiles []domain.CertificateProfile, id string) (domain.CertificateProfile, bool) {
	for _, profile := range profiles {
		if profile.ID == id {
			return profile, true
		}
	}
	return domain.CertificateProfile{}, false
}

func matchingCertificateProfile(profiles []domain.CertificateProfile, requestURL *url.URL) (domain.CertificateProfile, bool) {
	if requestURL == nil {
		return domain.CertificateProfile{}, false
	}
	host := strings.ToLower(requestURL.Hostname())
	port := requestURL.Port()
	if port == "" {
		if requestURL.Scheme == "http" {
			port = "80"
		} else {
			port = "443"
		}
	}
	for _, profile := range profiles {
		if !profile.IsActive {
			continue
		}
		if strings.EqualFold(profile.Host, host) && strconv.Itoa(profile.Port) == port {
			return profile, true
		}
	}
	return domain.CertificateProfile{}, false
}

func keyPairFromPEM(certPEM []byte, keyPEM []byte, passphrase string) (tls.Certificate, error) {
	if passphrase == "" {
		certificate, err := tls.X509KeyPair(certPEM, keyPEM)
		if err != nil {
			return tls.Certificate{}, fmt.Errorf("load CRT/KEY files: %w", err)
		}
		return certificate, nil
	}
	block, rest := pem.Decode(keyPEM)
	if block == nil {
		return tls.Certificate{}, fmt.Errorf("KEY file did not contain a PEM block")
	}
	if !x509.IsEncryptedPEMBlock(block) {
		certificate, err := tls.X509KeyPair(certPEM, keyPEM)
		if err != nil {
			return tls.Certificate{}, fmt.Errorf("load CRT/KEY files: %w", err)
		}
		return certificate, nil
	}
	decrypted, err := x509.DecryptPEMBlock(block, []byte(passphrase))
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("decrypt KEY file: %w", err)
	}
	decryptedPEM := pem.EncodeToMemory(&pem.Block{Type: block.Type, Bytes: decrypted})
	decryptedPEM = append(decryptedPEM, rest...)
	certificate, err := tls.X509KeyPair(certPEM, decryptedPEM)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("load decrypted CRT/KEY files: %w", err)
	}
	return certificate, nil
}

func decodeBase64FileValue(value string) ([]byte, error) {
	trimmed := strings.TrimSpace(value)
	if comma := strings.Index(trimmed, ","); strings.HasPrefix(trimmed, "data:") && comma >= 0 {
		trimmed = trimmed[comma+1:]
	}
	decoded, err := base64.StdEncoding.DecodeString(trimmed)
	if err != nil {
		return nil, fmt.Errorf("decode PFX/P12 Base64 content: %w", err)
	}
	return decoded, nil
}

func proxyForStep(config map[string]any, resolver variables.Resolver) (*url.URL, error) {
	proxyMap := configMap(config, "proxy")
	if proxyMap == nil || !boolFromAny(proxyMap["enabled"]) {
		return nil, nil
	}
	rawProxyURL, err := resolveConfigString(proxyMap["url"], resolver)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(rawProxyURL) == "" {
		return nil, fmt.Errorf("proxy URL is required")
	}
	proxyURL, err := url.Parse(strings.TrimSpace(rawProxyURL))
	if err != nil {
		return nil, fmt.Errorf("parse proxy URL: %w", err)
	}
	if proxyURL.Scheme == "" || proxyURL.Host == "" {
		return nil, fmt.Errorf("proxy URL must include scheme and host")
	}

	username, err := resolveConfigString(proxyMap["username"], resolver)
	if err != nil {
		return nil, err
	}
	password, err := resolveConfigString(proxyMap["password"], resolver)
	if err != nil {
		return nil, err
	}
	if username != "" || password != "" {
		if password != "" {
			proxyURL.User = url.UserPassword(username, password)
		} else {
			proxyURL.User = url.User(username)
		}
	}

	return proxyURL, nil
}

func safeRequestHeaders(headers http.Header) map[string]string {
	if len(headers) == 0 {
		return nil
	}
	safe := make(map[string]string, len(headers))
	for key, values := range headers {
		if isSensitiveHeader(key) {
			safe[key] = masking.Mask
			continue
		}
		safe[key] = strings.Join(values, ", ")
	}
	return safe
}

func isSensitiveHeader(key string) bool {
	normalized := strings.ToLower(strings.TrimSpace(key))
	return normalized == "authorization" || normalized == "proxy-authorization" || normalized == "cookie" || normalized == "set-cookie"
}

func configMap(config map[string]any, key string) map[string]any {
	if config == nil {
		return nil
	}
	switch typed := config[key].(type) {
	case map[string]any:
		return typed
	case map[string]string:
		out := make(map[string]any, len(typed))
		for k, v := range typed {
			out[k] = v
		}
		return out
	default:
		return nil
	}
}

func jwtBearerToken(authMap map[string]any, resolver variables.Resolver) (string, error) {
	algorithm := strings.ToUpper(stringFromAny(authMap["algorithm"]))
	if algorithm == "" {
		algorithm = "HS256"
	}
	if algorithm != "HS256" && algorithm != "HS384" && algorithm != "HS512" {
		return "", fmt.Errorf("JWT bearer currently supports HS256, HS384, and HS512")
	}

	payloadRaw, err := resolveConfigString(authMap["payload"], resolver)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(payloadRaw) == "" {
		payloadRaw = "{}"
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(payloadRaw), &payload); err != nil {
		return "", fmt.Errorf("invalid JWT payload JSON: %w", err)
	}
	now := time.Now().Unix()
	if _, ok := payload["iat"]; !ok {
		payload["iat"] = now
	}
	if _, ok := payload["exp"]; !ok {
		payload["exp"] = now + 300
	}

	headers := map[string]any{"typ": "JWT", "alg": algorithm}
	if headersRaw, err := resolveConfigString(authMap["headers"], resolver); err != nil {
		return "", err
	} else if strings.TrimSpace(headersRaw) != "" {
		var custom map[string]any
		if err := json.Unmarshal([]byte(headersRaw), &custom); err != nil {
			return "", fmt.Errorf("invalid JWT headers JSON: %w", err)
		}
		for key, value := range custom {
			headers[key] = value
		}
		headers["alg"] = algorithm
	}

	secret, err := resolveConfigString(authMap["secret"], resolver)
	if err != nil {
		return "", err
	}
	if secret == "" {
		return "", fmt.Errorf("JWT secret is required")
	}
	secretBytes := []byte(secret)
	if boolFromAny(authMap["secretBase64Encoded"]) {
		decoded, err := base64.StdEncoding.DecodeString(secret)
		if err != nil {
			return "", fmt.Errorf("decode base64 JWT secret: %w", err)
		}
		secretBytes = decoded
	}

	headerBytes, _ := json.Marshal(headers)
	payloadBytes, _ := json.Marshal(payload)
	signingInput := base64.RawURLEncoding.EncodeToString(headerBytes) + "." + base64.RawURLEncoding.EncodeToString(payloadBytes)

	var signature []byte
	switch algorithm {
	case "HS384":
		mac := hmac.New(sha512.New384, secretBytes)
		_, _ = mac.Write([]byte(signingInput))
		signature = mac.Sum(nil)
	case "HS512":
		mac := hmac.New(sha512.New, secretBytes)
		_, _ = mac.Write([]byte(signingInput))
		signature = mac.Sum(nil)
	default:
		mac := hmac.New(sha256.New, secretBytes)
		_, _ = mac.Write([]byte(signingInput))
		signature = mac.Sum(nil)
	}

	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func resolveConfigString(value any, resolver variables.Resolver) (string, error) {
	resolved, err := resolver.Resolve(stringFromAny(value))
	if err != nil {
		return "", err
	}
	return resolved, nil
}

func stringFromAny(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	case nil:
		return ""
	default:
		return fmt.Sprint(typed)
	}
}

func boolFromAny(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		return typed == "true"
	default:
		return false
	}
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
