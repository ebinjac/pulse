package executor

import (
	"crypto/tls"
	"net/http"
	"net/http/httptrace"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/masking"
)

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
