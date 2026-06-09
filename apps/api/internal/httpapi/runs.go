package httpapi

import (
	"net/http"
	"strings"
)

func (s *Server) runRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/runs/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		if r.Method == http.MethodGet {
			s.listAllRuns(w, r)
			return
		}
		writeError(w, http.StatusNotFound, "run not found")
		return
	}

	run, ok := s.store.GetRun(parts[0])
	if !ok {
		writeError(w, http.StatusNotFound, "run not found")
		return
	}

	if len(parts) == 2 && parts[1] == "steps" && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{"steps": run.Steps})
		return
	}

	if len(parts) == 1 && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{"run": run})
		return
	}

	writeError(w, http.StatusNotFound, "route not found")
}

func (s *Server) listAllRuns(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"runs": s.store.ListRuns("")})
}

