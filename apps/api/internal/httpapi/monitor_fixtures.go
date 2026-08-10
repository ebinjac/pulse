package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

func (s *Server) monitorFixtureRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/qa/monitor-fixtures/")
	switch strings.Trim(path, "/") {
	case "health":
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":      true,
			"service": "pulse-monitor-fixture",
			"version": "qa-v1",
		})
	case "token":
		writeJSON(w, http.StatusOK, map[string]any{
			"access_token": "fixture-token-123",
			"token_type":   "Bearer",
			"expires_in":   3600,
		})
	case "echo":
		s.echoMonitorFixture(w, r)
	case "cookies":
		s.cookieMonitorFixture(w, r)
	case "failure":
		writeJSON(w, http.StatusInternalServerError, map[string]any{
			"ok":    false,
			"error": "intentional fixture failure",
		})
	case "slow":
		time.Sleep(250 * time.Millisecond)
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":      true,
			"delayed": true,
		})
	default:
		writeError(w, http.StatusNotFound, "monitor fixture not found")
	}
}

func (s *Server) echoMonitorFixture(w http.ResponseWriter, r *http.Request) {
	body := ""
	if r.Body != nil {
		defer r.Body.Close()
		if bytes, err := io.ReadAll(io.LimitReader(r.Body, 64*1024)); err == nil {
			body = string(bytes)
		}
	}

	headers := map[string]string{}
	for key, values := range r.Header {
		headers[key] = strings.Join(values, ", ")
	}

	var jsonBody any
	if strings.TrimSpace(body) != "" {
		_ = json.Unmarshal([]byte(body), &jsonBody)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"method":   r.Method,
		"path":     r.URL.Path,
		"query":    r.URL.RawQuery,
		"headers":  headers,
		"body":     body,
		"jsonBody": jsonBody,
	})
}

func (s *Server) cookieMonitorFixture(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("set") == "true" {
		http.SetCookie(w, &http.Cookie{
			Name:     "pulse_fixture_session",
			Value:    "session-123",
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
		})
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":     true,
			"action": "set-cookie",
		})
		return
	}

	cookie, err := r.Cookie("pulse_fixture_session")
	value := ""
	if err == nil {
		value = cookie.Value
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":            value != "",
		"sessionCookie": value,
	})
}
