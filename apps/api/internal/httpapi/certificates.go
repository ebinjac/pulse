package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/certs"
	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

type certificateProfilePayload struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	Host               string `json:"host"`
	Port               int    `json:"port"`
	CertType           string `json:"certType"`
	CertFile           string `json:"certFile"`
	KeyFile            string `json:"keyFile"`
	PFXFile            string `json:"pfxFile"`
	CACertFile         string `json:"caCertFile"`
	Passphrase         string `json:"passphrase"`
	InsecureSkipVerify bool   `json:"insecureSkipVerify"`
	IsActive           *bool  `json:"isActive"`
}

func (s *Server) listCertificateProfiles(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"profiles": s.store.ListCertificateProfiles()})
}

func (s *Server) createCertificateProfile(w http.ResponseWriter, r *http.Request) {
	profile, ok := s.decodeCertificateProfilePayload(w, r, "")
	if !ok {
		return
	}
	saved, err := s.store.UpsertCertificateProfile(profile)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"profile": saved})
}

func (s *Server) certificateProfileRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/settings/certificates/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "certificate profile not found")
		return
	}
	id := parts[0]

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			profile, ok := s.store.GetCertificateProfile(id)
			if !ok {
				writeError(w, http.StatusNotFound, "certificate profile not found")
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"profile": profile})
		case http.MethodPut:
			profile, ok := s.decodeCertificateProfilePayload(w, r, id)
			if !ok {
				return
			}
			saved, err := s.store.UpsertCertificateProfile(profile)
			if err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"profile": saved})
		case http.MethodDelete:
			if !s.store.DeleteCertificateProfile(id) {
				writeError(w, http.StatusNotFound, "certificate profile not found")
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}

	if len(parts) == 2 && parts[1] == "test" && r.Method == http.MethodPost {
		profile, ok := s.store.GetCertificateProfile(id)
		if !ok {
			writeError(w, http.StatusNotFound, "certificate profile not found")
			return
		}
		err := s.validateCertificateProfileSecrets(profile)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		now := time.Now().UTC()
		profile.LastTestedAt = &now
		saved, _ := s.store.UpsertCertificateProfile(profile)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "profile": saved})
		return
	}

	writeError(w, http.StatusNotFound, "route not found")
}

func (s *Server) decodeCertificateProfilePayload(w http.ResponseWriter, r *http.Request, id string) (domain.CertificateProfile, bool) {
	var payload certificateProfilePayload
	if !decodeJSON(w, r, &payload) {
		return domain.CertificateProfile{}, false
	}
	if id != "" {
		payload.ID = id
	}
	if payload.ID == "" {
		payload.ID = "cert-" + apiRandomID()
	}
	payload.Host = certs.NormalizeHost(payload.Host)
	if payload.Host == "" {
		writeError(w, http.StatusBadRequest, "host is required")
		return domain.CertificateProfile{}, false
	}
	if payload.Port <= 0 {
		payload.Port = 443
	}
	payload.CertType = strings.ToLower(strings.TrimSpace(payload.CertType))
	if payload.CertType == "" {
		payload.CertType = "pem"
	}
	if payload.CertType != "pem" && payload.CertType != "pfx" {
		writeError(w, http.StatusBadRequest, "certType must be pem or pfx")
		return domain.CertificateProfile{}, false
	}
	isActive := true
	if payload.IsActive != nil {
		isActive = *payload.IsActive
	}
	name := strings.TrimSpace(payload.Name)
	if name == "" {
		name = payload.Host + ":" + strconv.Itoa(payload.Port)
	}

	existing, _ := s.store.GetCertificateProfile(payload.ID)
	profile := domain.CertificateProfile{
		ID:                    payload.ID,
		Name:                  name,
		Host:                  payload.Host,
		Port:                  payload.Port,
		CertType:              payload.CertType,
		CertSecretAlias:       existing.CertSecretAlias,
		KeySecretAlias:        existing.KeySecretAlias,
		PFXSecretAlias:        existing.PFXSecretAlias,
		CACertSecretAlias:     existing.CACertSecretAlias,
		PassphraseSecretAlias: existing.PassphraseSecretAlias,
		InsecureSkipVerify:    payload.InsecureSkipVerify,
		IsActive:              isActive,
		LastTestedAt:          existing.LastTestedAt,
		CreatedAt:             existing.CreatedAt,
	}

	if payload.CertFile != "" {
		profile.CertSecretAlias = certificateSecretAlias(profile.ID, "cert")
		if err := s.upsertCertificateSecret(profile.ID, profile.CertSecretAlias, "Client certificate PEM", payload.CertFile); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return domain.CertificateProfile{}, false
		}
	}
	if payload.KeyFile != "" {
		profile.KeySecretAlias = certificateSecretAlias(profile.ID, "key")
		if err := s.upsertCertificateSecret(profile.ID, profile.KeySecretAlias, "Client key PEM", payload.KeyFile); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return domain.CertificateProfile{}, false
		}
	}
	if payload.PFXFile != "" {
		profile.PFXSecretAlias = certificateSecretAlias(profile.ID, "pfx")
		if err := s.upsertCertificateSecret(profile.ID, profile.PFXSecretAlias, "Client PFX/P12 bundle", payload.PFXFile); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return domain.CertificateProfile{}, false
		}
	}
	if payload.CACertFile != "" {
		profile.CACertSecretAlias = certificateSecretAlias(profile.ID, "ca")
		if err := s.upsertCertificateSecret(profile.ID, profile.CACertSecretAlias, "Custom CA certificate PEM", payload.CACertFile); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return domain.CertificateProfile{}, false
		}
	}
	if payload.Passphrase != "" {
		profile.PassphraseSecretAlias = certificateSecretAlias(profile.ID, "passphrase")
		if err := s.upsertCertificateSecret(profile.ID, profile.PassphraseSecretAlias, "Certificate passphrase", payload.Passphrase); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return domain.CertificateProfile{}, false
		}
	}

	if profile.CertType == "pem" && (profile.CertSecretAlias == "" || profile.KeySecretAlias == "") {
		writeError(w, http.StatusBadRequest, "CRT and KEY files are required for PEM certificate profiles")
		return domain.CertificateProfile{}, false
	}
	if profile.CertType == "pfx" && profile.PFXSecretAlias == "" {
		writeError(w, http.StatusBadRequest, "PFX/P12 file is required for PFX certificate profiles")
		return domain.CertificateProfile{}, false
	}

	return profile, true
}

func (s *Server) upsertCertificateSecret(profileID string, alias string, name string, value string) error {
	_, err := s.store.UpsertSecret(domain.SecretReference{
		ID:          "sec-" + profileID + "-" + strings.TrimPrefix(alias, "certprofile."+profileID+"."),
		Name:        name,
		Alias:       alias,
		Description: "Certificate profile material managed from Pulse settings.",
		Provider:    "encrypted-db",
		MaskedValue: "********",
		IsActive:    true,
		RawValue:    value,
	})
	return err
}

func (s *Server) validateCertificateProfileSecrets(profile domain.CertificateProfile) error {
	return certs.ValidateProfileSecrets(profile, s.store.GetRawSecretValue)
}

func certificateSecretAlias(profileID string, part string) string {
	return "certprofile." + profileID + "." + part
}

func apiRandomID() string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(bytes)
}

