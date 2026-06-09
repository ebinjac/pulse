package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

func (s *Server) streamEvents(w http.ResponseWriter, r *http.Request) {
	if s.events == nil {
		writeError(w, http.StatusServiceUnavailable, "event streaming is not configured")
		return
	}

	topics := parseEventTopics(r.URL.Query().Get("topics"))
	if len(topics) == 0 {
		writeError(w, http.StatusBadRequest, "topics query parameter is required")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming is not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ch, unsubscribe, err := s.events.Subscribe(r.Context(), topics)
	if err != nil {
		return
	}
	defer unsubscribe()

	keepalive := time.NewTicker(25 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepalive.C:
			fmt.Fprintf(w, ": keepalive\n\n")
			flusher.Flush()
		case event, open := <-ch:
			if !open {
				return
			}
			if _, err := fmt.Fprintf(w, "id: %s\n", event.ID); err != nil {
				return
			}
			if _, err := fmt.Fprintf(w, "event: %s\n", event.Type); err != nil {
				return
			}
			payload, err := json.Marshal(event)
			if err != nil {
				continue
			}
			if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func parseEventTopics(raw string) []string {
	parts := strings.Split(raw, ",")
	topics := make([]string, 0, len(parts))
	seen := map[string]bool{}
	for _, part := range parts {
		topic := strings.TrimSpace(part)
		if topic == "" || seen[topic] {
			continue
		}
		seen[topic] = true
		topics = append(topics, topic)
	}
	return topics
}
