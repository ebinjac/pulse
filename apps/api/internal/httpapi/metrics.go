package httpapi

import "net/http"

func (s *Server) getSLOSummary(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"summary": s.store.GetSLOSummary(),
	})
}
