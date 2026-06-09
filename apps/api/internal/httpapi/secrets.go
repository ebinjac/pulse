package httpapi

import (
	"net/http"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func (s *Server) listSecrets(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"secrets": s.store.ListSecrets()})
}

func (s *Server) createSecret(w http.ResponseWriter, r *http.Request) {
	secret, ok := decodeSecretPayload(w, r, "")
	if !ok {
		return
	}

	saved, err := s.store.UpsertSecret(secret)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"secret": saved})
}

func (s *Server) secretRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/secrets/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "secret not found")
		return
	}

	if len(parts) == 1 && r.Method == http.MethodPut {
		input, ok := decodeSecretPayload(w, r, parts[0])
		if !ok {
			return
		}
		if input.RawValue == "" {
			existing, exists := s.store.GetSecret(parts[0])
			if !exists {
				writeError(w, http.StatusNotFound, "secret not found")
				return
			}
			input.RawValue = existing.RawValue
		}
		saved, err := s.store.UpsertSecret(input)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"secret": saved})
		return
	}

	if len(parts) == 1 && r.Method == http.MethodDelete {
		if !s.store.DeleteSecret(parts[0]) {
			writeError(w, http.StatusNotFound, "secret not found")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}

	secret, ok := s.store.GetSecret(parts[0])
	if !ok {
		writeError(w, http.StatusNotFound, "secret not found")
		return
	}

	if len(parts) == 2 && parts[1] == "test" && r.Method == http.MethodPost {
		_, canDecrypt := s.store.GetRawSecretValue(secret.Alias)
		writeJSON(w, http.StatusOK, map[string]any{"ok": secret.IsActive && canDecrypt, "alias": secret.Alias, "provider": secret.Provider, "value": "********"})
		return
	}

	if len(parts) == 1 && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{"secret": secret})
		return
	}

	writeError(w, http.StatusNotFound, "route not found")
}

type secretPayload struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Alias       string `json:"alias"`
	Provider    string `json:"provider"`
	Description string `json:"description"`
	SecretPath  string `json:"secretPath"`
	SecretKey   string `json:"secretKey"`
	Value       string `json:"value"`
	IsActive    *bool  `json:"isActive"`
}

func decodeSecretPayload(w http.ResponseWriter, r *http.Request, id string) (domain.SecretReference, bool) {
	var payload secretPayload
	if !decodeJSON(w, r, &payload) {
		return domain.SecretReference{}, false
	}
	if id != "" {
		payload.ID = id
	}
	if payload.Name == "" {
		writeError(w, http.StatusBadRequest, "secret name is required")
		return domain.SecretReference{}, false
	}
	if payload.Alias == "" {
		writeError(w, http.StatusBadRequest, "secret alias is required")
		return domain.SecretReference{}, false
	}
	if payload.Provider == "" {
		payload.Provider = "encrypted-db"
	}
	isActive := true
	if payload.IsActive != nil {
		isActive = *payload.IsActive
	}

	return domain.SecretReference{
		ID:          payload.ID,
		Name:        payload.Name,
		Alias:       payload.Alias,
		Provider:    payload.Provider,
		Description: payload.Description,
		SecretPath:  payload.SecretPath,
		SecretKey:   payload.SecretKey,
		MaskedValue: "********",
		IsActive:    isActive,
		RawValue:    payload.Value,
	}, true
}

