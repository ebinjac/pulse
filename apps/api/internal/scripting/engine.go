package scripting

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptrace"
	"strings"
	"time"

	"github.com/dop251/goja"
	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

// RequestOverrides holds mutations that scripts can make to the outgoing HTTP request.
type RequestOverrides struct {
	URL     string
	Method  string
	Headers map[string]string
	Body    string
}

// ScriptContext holds the input/output data for a script execution.
type ScriptContext struct {
	Variables           map[string]string            // read/write — merged back after execution
	Secrets             map[string]string            // read-only access to resolved secrets
	Steps               map[string]map[string]string // previous step outputs (read-only)
	Request             *RequestOverrides            // mutable request fields
	Console             []string                     // captured console.log output
	SubRequests         []SubRequestTrace            // requests issued through pm.sendRequest
	ResponseBodyLimitKB int                          // captured body limit for pm.sendRequest
}

const scriptTimeout = 5 * time.Second

type SubRequestTrace struct {
	URL             string
	Method          string
	StatusCode      int
	Status          domain.MonitorStatus
	RequestHeaders  map[string]string
	RequestBody     string
	ResponseHeaders map[string]string
	ResponseBody    string
	RequestSummary  string
	ResponseSummary string
	ErrorMessage    string
	LatencyMS       int
	Timing          domain.HTTPTiming
}

// Execute runs a JavaScript script in a sandboxed goja VM with the pm.* API surface.
func Execute(script string, ctx *ScriptContext) error {
	vm := goja.New()

	// --- pm.variables ---
	variables := vm.NewObject()
	variables.Set("set", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		value := call.Argument(1).String()
		ctx.Variables[key] = value
		return goja.Undefined()
	})
	variables.Set("get", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		if val, ok := ctx.Variables[key]; ok {
			return vm.ToValue(val)
		}
		return goja.Undefined()
	})
	variables.Set("toObject", func(call goja.FunctionCall) goja.Value {
		copy := make(map[string]string, len(ctx.Variables))
		for k, v := range ctx.Variables {
			copy[k] = v
		}
		return vm.ToValue(copy)
	})

	// --- pm.environment (alias for pm.variables, Postman compat) ---
	environment := vm.NewObject()
	environment.Set("set", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		value := call.Argument(1).String()
		ctx.Variables[key] = value
		return goja.Undefined()
	})
	environment.Set("get", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		if val, ok := ctx.Variables[key]; ok {
			return vm.ToValue(val)
		}
		return goja.Undefined()
	})

	// --- pm.secrets ---
	secrets := vm.NewObject()
	secrets.Set("get", func(call goja.FunctionCall) goja.Value {
		alias := call.Argument(0).String()
		if val, ok := ctx.Secrets[alias]; ok {
			return vm.ToValue(val)
		}
		return goja.Undefined()
	})

	// --- pm.request.headers ---
	headers := vm.NewObject()
	headers.Set("add", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		value := call.Argument(1).String()
		ctx.Request.Headers[key] = value
		return goja.Undefined()
	})
	headers.Set("get", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		if val, ok := ctx.Request.Headers[key]; ok {
			return vm.ToValue(val)
		}
		return goja.Undefined()
	})
	headers.Set("remove", func(call goja.FunctionCall) goja.Value {
		key := call.Argument(0).String()
		delete(ctx.Request.Headers, key)
		return goja.Undefined()
	})

	// --- pm.request ---
	reqObj := vm.NewObject()
	reqObj.Set("url", ctx.Request.URL)
	reqObj.Set("method", ctx.Request.Method)
	reqObj.Set("body", ctx.Request.Body)
	reqObj.Set("headers", headers)

	// --- pm ---
	pm := vm.NewObject()
	pm.Set("variables", variables)
	pm.Set("environment", environment)
	pm.Set("secrets", secrets)
	pm.Set("request", reqObj)
	pm.Set("sendRequest", func(call goja.FunctionCall) goja.Value {
		trace, err := executeSendRequest(call.Argument(0), ctx)
		if trace.URL != "" {
			ctx.SubRequests = append(ctx.SubRequests, trace)
		}

		if callback, ok := goja.AssertFunction(call.Argument(1)); ok {
			var errValue goja.Value = goja.Null()
			if err != nil {
				errObj := vm.NewObject()
				_ = errObj.Set("message", err.Error())
				errValue = errObj
			}
			if _, callbackErr := callback(goja.Undefined(), errValue, responseObject(vm, trace)); callbackErr != nil {
				panic(callbackErr)
			}
		}

		return goja.Undefined()
	})
	vm.Set("pm", pm)
	vm.Set("CryptoJS", cryptoJSObject(vm))

	// --- console ---
	consoleObj := vm.NewObject()
	consoleObj.Set("log", func(call goja.FunctionCall) goja.Value {
		args := make([]string, len(call.Arguments))
		for i, arg := range call.Arguments {
			args[i] = arg.String()
		}
		ctx.Console = append(ctx.Console, strings.Join(args, " "))
		return goja.Undefined()
	})
	vm.Set("console", consoleObj)

	// --- Execute with timeout ---
	type result struct {
		err error
	}
	done := make(chan result, 1)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				done <- result{err: fmt.Errorf("script panic: %v", r)}
			}
		}()
		_, err := vm.RunString(script)
		done <- result{err: err}
	}()

	timer := time.NewTimer(scriptTimeout)
	defer timer.Stop()

	select {
	case <-timer.C:
		vm.Interrupt("script timeout")
		return fmt.Errorf("script exceeded %s timeout", scriptTimeout)
	case res := <-done:
		if res.err != nil {
			return fmt.Errorf("script error: %w", res.err)
		}
	}

	// Read back mutable request properties
	if v := reqObj.Get("url"); v != nil && !goja.IsUndefined(v) {
		ctx.Request.URL = v.String()
	}
	if v := reqObj.Get("method"); v != nil && !goja.IsUndefined(v) {
		ctx.Request.Method = v.String()
	}
	if v := reqObj.Get("body"); v != nil && !goja.IsUndefined(v) {
		ctx.Request.Body = v.String()
	}

	return nil
}

func cryptoJSObject(vm *goja.Runtime) *goja.Object {
	base64Obj := vm.NewObject()
	_ = base64Obj.Set("parse", func(call goja.FunctionCall) goja.Value {
		return vm.ToValue(cryptoBytesPrefix + call.Argument(0).String())
	})
	_ = base64Obj.Set("stringify", func(call goja.FunctionCall) goja.Value {
		return vm.ToValue(base64FromCryptoValue(call.Argument(0)))
	})

	encObj := vm.NewObject()
	_ = encObj.Set("Base64", base64Obj)

	cryptoObj := vm.NewObject()
	_ = cryptoObj.Set("enc", encObj)
	_ = cryptoObj.Set("HmacSHA256", func(call goja.FunctionCall) goja.Value {
		input := []byte(call.Argument(0).String())
		key := bytesFromCryptoValue(call.Argument(1))
		mac := hmac.New(sha256.New, key)
		_, _ = mac.Write(input)
		return vm.ToValue(cryptoBytesPrefix + base64.StdEncoding.EncodeToString(mac.Sum(nil)))
	})

	return cryptoObj
}

const cryptoBytesPrefix = "__pulse_crypto_bytes_base64__:"

func bytesFromCryptoValue(value goja.Value) []byte {
	raw := value.String()
	raw = strings.TrimPrefix(raw, cryptoBytesPrefix)
	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err == nil {
		return decoded
	}
	return []byte(value.String())
}

func base64FromCryptoValue(value goja.Value) string {
	raw := value.String()
	if strings.HasPrefix(raw, cryptoBytesPrefix) {
		return strings.TrimPrefix(raw, cryptoBytesPrefix)
	}
	return base64.StdEncoding.EncodeToString([]byte(raw))
}

func executeSendRequest(value goja.Value, ctx *ScriptContext) (SubRequestTrace, error) {
	spec := sendRequestSpecFromValue(value)
	trace := SubRequestTrace{
		URL:            spec.URL,
		Method:         spec.Method,
		RequestHeaders: spec.Headers,
		RequestBody:    spec.Body,
		Status:         domain.StatusSuccess,
	}
	if trace.Method == "" {
		trace.Method = "GET"
	}
	trace.RequestSummary = fmt.Sprintf("%s %s", trace.Method, trace.URL)

	req, err := http.NewRequest(trace.Method, trace.URL, bytes.NewBufferString(trace.RequestBody))
	if err != nil {
		trace.Status = domain.StatusError
		trace.ErrorMessage = err.Error()
		trace.ResponseSummary = err.Error()
		return trace, err
	}
	for key, value := range spec.Headers {
		req.Header.Set(key, value)
	}

	client := &http.Client{Timeout: scriptTimeout}
	timingRecorder := newHTTPTimingRecorder()
	start := time.Now().UTC()
	timingRecorder.markRequestStart()
	req = req.WithContext(httptrace.WithClientTrace(req.Context(), timingRecorder.trace()))

	resp, err := client.Do(req)
	if err != nil {
		trace.LatencyMS = elapsedMillis(start)
		trace.Timing = timingRecorder.breakdown(trace.LatencyMS)
		trace.Status = domain.StatusFailed
		trace.ErrorMessage = err.Error()
		trace.ResponseSummary = err.Error()
		return trace, err
	}
	defer resp.Body.Close()

	limitKB := ctx.ResponseBodyLimitKB
	if limitKB <= 0 {
		limitKB = 32
	}
	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, int64(limitKB*1024)))
	timingRecorder.markBodyReadDone()
	trace.LatencyMS = elapsedMillis(start)
	trace.Timing = timingRecorder.breakdown(trace.LatencyMS)
	trace.StatusCode = resp.StatusCode
	trace.ResponseBody = string(bodyBytes)
	trace.ResponseSummary = fmt.Sprintf("%d %s, %d bytes read", resp.StatusCode, resp.Header.Get("Content-Type"), len(bodyBytes))
	trace.ResponseHeaders = make(map[string]string)
	for key, values := range resp.Header {
		trace.ResponseHeaders[key] = strings.Join(values, ", ")
	}
	if resp.StatusCode >= 400 {
		trace.Status = domain.StatusFailed
	}

	return trace, nil
}

type sendRequestSpec struct {
	URL     string
	Method  string
	Headers map[string]string
	Body    string
}

func sendRequestSpecFromValue(value goja.Value) sendRequestSpec {
	spec := sendRequestSpec{Method: "GET", Headers: map[string]string{}}
	if goja.IsUndefined(value) || goja.IsNull(value) {
		return spec
	}
	if url, ok := value.Export().(string); ok {
		spec.URL = url
		return spec
	}

	exported, ok := value.Export().(map[string]any)
	if !ok {
		spec.URL = value.String()
		return spec
	}
	if url, ok := exported["url"].(string); ok {
		spec.URL = url
	}
	if method, ok := exported["method"].(string); ok && method != "" {
		spec.Method = strings.ToUpper(method)
	}
	spec.Headers = headersFromAny(exported["header"])
	if len(spec.Headers) == 0 {
		spec.Headers = headersFromAny(exported["headers"])
	}
	spec.Body = bodyFromAny(exported["body"])

	return spec
}

func headersFromAny(value any) map[string]string {
	headers := map[string]string{}
	switch typed := value.(type) {
	case map[string]any:
		for key, value := range typed {
			headers[key] = fmt.Sprint(value)
		}
	case []any:
		for _, item := range typed {
			entry, ok := item.(map[string]any)
			if !ok {
				continue
			}
			key := fmt.Sprint(entry["key"])
			if key == "" {
				continue
			}
			headers[key] = fmt.Sprint(entry["value"])
		}
	}
	return headers
}

func bodyFromAny(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case map[string]any:
		if raw, ok := typed["raw"].(string); ok {
			return raw
		}
		encoded, _ := json.Marshal(typed)
		return string(encoded)
	case nil:
		return ""
	default:
		encoded, _ := json.Marshal(typed)
		return string(encoded)
	}
}

func responseObject(vm *goja.Runtime, trace SubRequestTrace) *goja.Object {
	resp := vm.NewObject()
	_ = resp.Set("code", trace.StatusCode)
	_ = resp.Set("status", trace.StatusCode)
	_ = resp.Set("headers", trace.ResponseHeaders)
	_ = resp.Set("text", func(goja.FunctionCall) goja.Value {
		return vm.ToValue(trace.ResponseBody)
	})
	_ = resp.Set("json", func(goja.FunctionCall) goja.Value {
		var payload any
		if err := json.Unmarshal([]byte(trace.ResponseBody), &payload); err != nil {
			panic(vm.ToValue(err.Error()))
		}
		return vm.ToValue(payload)
	})
	return resp
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
		from := r.wroteRequest
		if from.IsZero() {
			from = r.requestStart
		}
		timing.TimeToFirstByteMS = durationMS(from, r.gotFirstResponseByte)
	}
	if !r.bodyReadDone.IsZero() && !r.gotFirstResponseByte.IsZero() {
		timing.DownloadMS = durationMS(r.gotFirstResponseByte, r.bodyReadDone)
	}
	return timing
}

func durationMS(start, end time.Time) int {
	if start.IsZero() || end.IsZero() || end.Before(start) {
		return 0
	}
	return int(end.Sub(start).Milliseconds())
}

func elapsedMillis(start time.Time) int {
	elapsed := int(time.Since(start).Milliseconds())
	if elapsed <= 0 {
		return 1
	}
	return elapsed
}
