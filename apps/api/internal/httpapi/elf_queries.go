package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/elfsearch"
)

type elfQueryInput struct {
	Name                string                     `json:"name"`
	Description         string                     `json:"description"`
	ElfAppID            string                     `json:"elfAppId"`
	IndexPathTemplate   string                     `json:"indexPathTemplate"`
	SearchBody          json.RawMessage            `json:"searchBody"`
	GateMode            string                     `json:"gateMode"`
	PassCriteria        domain.ElfPassCriteria     `json:"passCriteria"`
	ComparisonConfig    domain.ElfComparisonConfig `json:"comparisonConfig"`
	ApplicationID       string                     `json:"applicationId"`
	ServiceID           string                     `json:"serviceId"`
	ProbeConfig         domain.ElfProbeConfig      `json:"probeConfig"`
	FieldMapping        domain.LogFieldMapping     `json:"fieldMapping"`
	FieldSchema         domain.ElfFieldSchema      `json:"fieldSchema"`
	CheckKind           string                     `json:"checkKind"`
	CheckConfig         domain.ElfCheckConfig      `json:"checkConfig"`
	GeneratedSearchBody json.RawMessage            `json:"generatedSearchBody"`
	Tags                []string                   `json:"tags"`
	IsActive            *bool                      `json:"isActive"`
}

type elfQueryTestInput struct {
	ElfAppID      string `json:"elfAppId"`
	ApplicationID string `json:"applicationId"`
}

type elfQueryProbeInput struct {
	ApplicationID      string                   `json:"applicationId"`
	ServiceID          string                   `json:"serviceId"`
	ElfAppID           string                   `json:"elfAppId"`
	TimeRange          elfsearch.ProbeTimeRange `json:"timeRange"`
	SearchBodyOverride json.RawMessage          `json:"searchBodyOverride"`
	MaxResponseBytes   int                      `json:"maxResponseBytes"`
	SaveProbeSummary   bool                     `json:"saveProbeSummary"`
}

type elfQueryValidateCheckInput struct {
	ApplicationID      string                   `json:"applicationId"`
	ServiceID          string                   `json:"serviceId"`
	ElfAppID           string                   `json:"elfAppId"`
	TimeRange          elfsearch.ProbeTimeRange `json:"timeRange"`
	CheckKind          string                   `json:"checkKind"`
	CheckConfig        domain.ElfCheckConfig    `json:"checkConfig"`
	PassCriteria       domain.ElfPassCriteria   `json:"passCriteria"`
	FieldSchema        domain.ElfFieldSchema    `json:"fieldSchema"`
	FieldMapping       domain.LogFieldMapping   `json:"fieldMapping"`
	SearchBodyOverride json.RawMessage          `json:"searchBodyOverride"`
	MaxResponseBytes   int                      `json:"maxResponseBytes"`
}

func (s *Server) listElfQueries(w http.ResponseWriter, r *http.Request) {
	applicationID := strings.TrimSpace(r.URL.Query().Get("applicationId"))
	writeJSON(w, http.StatusOK, map[string]any{"queries": s.store.ListElfQueries(applicationID)})
}

func (s *Server) createElfQuery(w http.ResponseWriter, r *http.Request) {
	var input elfQueryInput
	if !decodeJSON(w, r, &input) {
		return
	}
	query, err := s.buildElfQueryPayload(input, domain.ElfQuery{})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	query = s.store.UpsertElfQuery(query)
	writeJSON(w, http.StatusCreated, map[string]any{"query": query})
}

func (s *Server) getElfQuery(w http.ResponseWriter, queryID string) {
	query, ok := s.store.GetElfQuery(queryID)
	if !ok {
		writeError(w, http.StatusNotFound, "elf query not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"query": query})
}

func (s *Server) updateElfQuery(w http.ResponseWriter, r *http.Request, queryID string) {
	existing, ok := s.store.GetElfQuery(queryID)
	if !ok {
		writeError(w, http.StatusNotFound, "elf query not found")
		return
	}
	var input elfQueryInput
	if !decodeJSON(w, r, &input) {
		return
	}
	query, err := s.buildElfQueryPayload(input, existing)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	query.ID = existing.ID
	query.CreatedAt = existing.CreatedAt
	query.LastProbeAt = existing.LastProbeAt
	query.LastProbeSummary = existing.LastProbeSummary
	query = s.store.UpsertElfQuery(query)
	writeJSON(w, http.StatusOK, map[string]any{"query": query})
}

func (s *Server) deleteElfQuery(w http.ResponseWriter, queryID string) {
	if !s.store.DeleteElfQuery(queryID) {
		writeError(w, http.StatusNotFound, "elf query not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func (s *Server) testElfQuery(w http.ResponseWriter, r *http.Request, queryID string) {
	query, ok := s.store.GetElfQuery(queryID)
	if !ok {
		writeError(w, http.StatusNotFound, "elf query not found")
		return
	}
	var input elfQueryTestInput
	if r.Body != nil && r.ContentLength != 0 {
		if !decodeJSON(w, r, &input) {
			return
		}
	}
	application, err := s.resolveElfApplication(query, input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	runner := &elfsearch.Runner{Settings: s.store, Secrets: s.store}
	result, runErr := runner.RunQuery(context.Background(), query, application, elfsearch.SearchContext{
		ElfAppID:      firstNonEmpty(input.ElfAppID, query.ElfAppID, application.ElfAppID),
		ApplicationID: application.ID,
		CarID:         application.CarID,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":     runErr == nil && result.ErrorMessage == "",
		"result": result,
	})
}

func (s *Server) probeElfQuery(w http.ResponseWriter, r *http.Request, queryID string) {
	query, ok := s.store.GetElfQuery(queryID)
	if !ok {
		writeError(w, http.StatusNotFound, "elf query not found")
		return
	}
	var input elfQueryProbeInput
	if r.Body != nil && r.ContentLength != 0 {
		if !decodeJSON(w, r, &input) {
			return
		}
	}

	application, service, err := s.resolveElfProbeContext(query, input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	runner := &elfsearch.Runner{Settings: s.store, Secrets: s.store}
	probe, probeErr := runner.ProbeQuery(context.Background(), query, application, service, elfsearch.SearchContext{
		ElfAppID:      firstNonEmpty(input.ElfAppID, query.ElfAppID, application.ElfAppID),
		ApplicationID: application.ID,
		CarID:         application.CarID,
	}, elfsearch.ProbeOptions{
		SearchBodyOverride: input.SearchBodyOverride,
		TimeRange:          input.TimeRange,
		MaxResponseBytes:   input.MaxResponseBytes,
	})

	if input.SaveProbeSummary {
		now := time.Now().UTC()
		query.LastProbeAt = &now
		query.LastProbeSummary = domain.ElfProbeSummary{
			HitCount:      probe.HitCount,
			Gte:           probe.InjectedTimeRange.Gte,
			Lte:           probe.InjectedTimeRange.Lte,
			ResolvedIndex: probe.ResolvedIndexPattern,
			DurationMS:    probe.DurationMS,
			Truncated:     probe.Truncated,
			ErrorMessage:  probe.ErrorMessage,
		}
		if strings.TrimSpace(input.TimeRange.Gte) != "" {
			query.ProbeConfig.DefaultGte = input.TimeRange.Gte
		}
		if strings.TrimSpace(input.TimeRange.Lte) != "" {
			query.ProbeConfig.DefaultLte = input.TimeRange.Lte
		}
		if strings.TrimSpace(input.TimeRange.Field) != "" {
			query.ProbeConfig.TimeField = input.TimeRange.Field
		}
		if len(probe.FieldSchema.Fields) > 0 {
			query.FieldSchema = probe.FieldSchema
		}
		query = s.store.UpsertElfQuery(query)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":    probeErr == nil && probe.ErrorMessage == "",
		"probe": probe,
		"query": query,
	})
}

func (s *Server) validateElfCheck(w http.ResponseWriter, r *http.Request, queryID string) {
	query, ok := s.store.GetElfQuery(queryID)
	if !ok {
		writeError(w, http.StatusNotFound, "elf query not found")
		return
	}
	var input elfQueryValidateCheckInput
	if !decodeJSON(w, r, &input) {
		return
	}
	application, service, err := s.resolveElfProbeContext(query, elfQueryProbeInput{
		ApplicationID: input.ApplicationID,
		ServiceID:     input.ServiceID,
		ElfAppID:      input.ElfAppID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	draft := query
	if strings.TrimSpace(input.CheckKind) != "" {
		draft.CheckKind = strings.TrimSpace(input.CheckKind)
	}
	if hasElfCheckConfig(input.CheckConfig) {
		draft.CheckConfig = input.CheckConfig
	}
	if input.PassCriteria.Type != "" {
		draft.PassCriteria = input.PassCriteria
	}
	if len(input.FieldSchema.Fields) > 0 {
		draft.FieldSchema = input.FieldSchema
	}
	if input.FieldMapping.Timestamp != "" || input.FieldMapping.Message != "" {
		draft.FieldMapping = input.FieldMapping
	}

	compiled, err := compileDraftElfCheckBody(draft, input.TimeRange)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(input.SearchBodyOverride) > 0 {
		compiled = input.SearchBodyOverride
	}

	runner := &elfsearch.Runner{Settings: s.store, Secrets: s.store}
	probe, probeErr := runner.ProbeQuery(context.Background(), draft, application, service, elfsearch.SearchContext{
		ElfAppID:      firstNonEmpty(input.ElfAppID, draft.ElfAppID, application.ElfAppID),
		ApplicationID: application.ID,
		CarID:         application.CarID,
	}, elfsearch.ProbeOptions{
		SearchBodyOverride: compiled,
		TimeRange:          input.TimeRange,
		MaxResponseBytes:   input.MaxResponseBytes,
	})

	criteria := draft.PassCriteria
	if draft.CheckKind == "expression" || draft.CheckConfig.Mode == "expression" {
		criteria = elfsearch.PassCriteriaFromExpression(draft.CheckConfig)
	}
	criteriaResult, reason := elfsearch.EvaluatePassCriteria(criteria, elfsearch.SearchResponseFromParsed(probe.HitCount, nil))
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":                 probeErr == nil && probe.ErrorMessage == "",
		"compiledSearchBody": compiled,
		"probe":              probe,
		"criteriaResult":     criteriaResult,
		"gateResult":         elfsearch.GateResult(draft.GateMode, criteriaResult),
		"reason":             reason,
		"passCriteria":       criteria,
	})
}

func (s *Server) elfQueryRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/elf-queries/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusNotFound, "elf query not found")
		return
	}
	queryID := parts[0]
	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			s.getElfQuery(w, queryID)
		case http.MethodPut:
			s.updateElfQuery(w, r, queryID)
		case http.MethodDelete:
			s.deleteElfQuery(w, queryID)
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}
	if len(parts) == 2 && parts[1] == "test" && r.Method == http.MethodPost {
		s.testElfQuery(w, r, queryID)
		return
	}
	if len(parts) == 2 && parts[1] == "probe" && r.Method == http.MethodPost {
		s.probeElfQuery(w, r, queryID)
		return
	}
	if len(parts) == 2 && parts[1] == "validate-check" && r.Method == http.MethodPost {
		s.validateElfCheck(w, r, queryID)
		return
	}
	writeError(w, http.StatusNotFound, "route not found")
}

func compileDraftElfCheckBody(query domain.ElfQuery, timeRange elfsearch.ProbeTimeRange) (json.RawMessage, error) {
	timeField := firstNonEmpty(timeRange.Field, query.ProbeConfig.TimeField, query.FieldSchema.TimeField, query.FieldMapping.Timestamp, "@timestamp")
	checkKind := strings.TrimSpace(query.CheckKind)
	if checkKind == "" {
		checkKind = "raw"
	}
	if checkKind == "expression" || query.CheckConfig.Mode == "expression" {
		config := query.CheckConfig
		config.Mode = "expression"
		return elfsearch.CompileRulesToQuery(config, timeField, timeRange.Gte, timeRange.Lte)
	}
	if checkKind != "raw" {
		mapping := query.FieldMapping
		if mapping.Timestamp == "" {
			mapping.Timestamp = "@timestamp"
		}
		return elfsearch.GenerateSearchBody(elfsearch.CheckGenerateInput{
			Kind:      checkKind,
			Config:    query.CheckConfig,
			Mapping:   mapping,
			TimeField: timeField,
		})
	}
	if len(query.GeneratedSearchBody) > 0 {
		return query.GeneratedSearchBody, nil
	}
	if len(query.SearchBody) > 0 {
		return query.SearchBody, nil
	}
	return json.RawMessage(`{"query":{"match_all":{}},"size":10}`), nil
}

func (s *Server) buildElfQueryPayload(input elfQueryInput, existing domain.ElfQuery) (domain.ElfQuery, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		if strings.TrimSpace(existing.Name) != "" {
			name = existing.Name
		} else {
			return domain.ElfQuery{}, fmt.Errorf("name is required")
		}
	}
	gateMode := strings.TrimSpace(strings.ToLower(input.GateMode))
	if gateMode == "" {
		gateMode = existing.GateMode
	}
	if gateMode == "" {
		gateMode = "advisory"
	}
	if gateMode != "blocking" && gateMode != "advisory" {
		return domain.ElfQuery{}, fmt.Errorf("gateMode must be blocking or advisory")
	}
	searchBody := input.SearchBody
	if len(searchBody) == 0 {
		searchBody = existing.SearchBody
	}
	if len(searchBody) == 0 {
		searchBody = json.RawMessage(`{"query":{"match_all":{}},"size":10}`)
	}
	passCriteria := input.PassCriteria
	if passCriteria.Type == "" && existing.PassCriteria.Type != "" {
		passCriteria = existing.PassCriteria
	}
	if passCriteria.Type == "" {
		passCriteria = domain.ElfPassCriteria{Type: "max_hits", Threshold: 0}
	}
	isActive := existing.IsActive
	if input.IsActive != nil {
		isActive = *input.IsActive
	}
	if existing.ID == "" {
		isActive = true
		if input.IsActive != nil {
			isActive = *input.IsActive
		}
	}
	tags := input.Tags
	if tags == nil {
		tags = existing.Tags
	}
	if tags == nil {
		tags = []string{}
	}
	applicationID := strings.TrimSpace(input.ApplicationID)
	if applicationID == "" {
		applicationID = existing.ApplicationID
	}
	serviceID := strings.TrimSpace(input.ServiceID)
	if serviceID == "" {
		serviceID = existing.ServiceID
	}
	elfAppID := strings.TrimSpace(input.ElfAppID)
	if elfAppID == "" {
		elfAppID = existing.ElfAppID
	}
	indexPathTemplate := strings.TrimSpace(input.IndexPathTemplate)
	if indexPathTemplate == "" {
		indexPathTemplate = existing.IndexPathTemplate
	}
	description := strings.TrimSpace(input.Description)
	if description == "" {
		description = existing.Description
	}

	comparisonConfig := input.ComparisonConfig
	if comparisonConfig.BaselineMetric == "" && existing.ComparisonConfig.BaselineMetric != "" {
		comparisonConfig = existing.ComparisonConfig
	}

	probeConfig := input.ProbeConfig
	if probeConfig.TimeField == "" && probeConfig.DefaultGte == "" && probeConfig.DefaultLte == "" {
		probeConfig = existing.ProbeConfig
	}

	fieldMapping := input.FieldMapping
	if fieldMapping.Timestamp == "" && fieldMapping.Message == "" {
		fieldMapping = existing.FieldMapping
	}

	fieldSchema := input.FieldSchema
	if len(fieldSchema.Fields) == 0 {
		fieldSchema = existing.FieldSchema
	}

	checkKind := strings.TrimSpace(input.CheckKind)
	if checkKind == "" {
		checkKind = existing.CheckKind
	}
	if checkKind == "" {
		checkKind = "raw"
	}

	checkConfig := input.CheckConfig
	if !hasElfCheckConfig(checkConfig) {
		checkConfig = existing.CheckConfig
	}

	generatedBody := input.GeneratedSearchBody
	if len(generatedBody) == 0 {
		generatedBody = existing.GeneratedSearchBody
	}

	timeField := firstNonEmpty(probeConfig.TimeField, fieldSchema.TimeField, fieldMapping.Timestamp, "@timestamp")
	if checkKind == "expression" || checkConfig.Mode == "expression" {
		checkKind = "expression"
		checkConfig.Mode = "expression"
		body, err := elfsearch.CompileRulesToQuery(checkConfig, timeField, probeConfig.DefaultGte, probeConfig.DefaultLte)
		if err == nil {
			generatedBody = body
		}
		passCriteria = elfsearch.PassCriteriaFromExpression(checkConfig)
	} else if checkKind != "" && checkKind != "raw" && len(generatedBody) == 0 {
		mapping := fieldMapping
		if mapping.Timestamp == "" {
			mapping.Timestamp = "@timestamp"
		}
		body, err := elfsearch.GenerateSearchBody(elfsearch.CheckGenerateInput{
			Kind:      checkKind,
			Config:    checkConfig,
			Mapping:   mapping,
			TimeField: timeField,
		})
		if err == nil {
			generatedBody = body
		}
	}

	signalType := existing.SignalType
	if signalType == "" {
		signalType = "custom"
	}
	if checkKind == "expression" {
		signalType = "custom"
	} else if checkKind == "new_terms" {
		signalType = "new_exceptions"
	} else if checkKind == "delta_pct" {
		signalType = "error_spike"
	} else if checkKind == "threshold" {
		signalType = "latency_regression"
	}

	return domain.ElfQuery{
		ID:                  existing.ID,
		Name:                name,
		Description:         description,
		ElfAppID:            elfAppID,
		IndexPathTemplate:   indexPathTemplate,
		SearchBody:          searchBody,
		GateMode:            gateMode,
		PassCriteria:        passCriteria,
		ComparisonConfig:    comparisonConfig,
		SignalType:          signalType,
		ApplicationID:       applicationID,
		ServiceID:           serviceID,
		ProbeConfig:         probeConfig,
		FieldMapping:        fieldMapping,
		FieldSchema:         fieldSchema,
		CheckKind:           checkKind,
		CheckConfig:         checkConfig,
		GeneratedSearchBody: generatedBody,
		Tags:                tags,
		IsActive:            isActive,
	}, nil
}

func hasElfCheckConfig(config domain.ElfCheckConfig) bool {
	return config.Mode != "" ||
		len(config.Rules) > 0 ||
		config.FacetField != "" ||
		config.Pattern != "" ||
		config.PassWhen != "" ||
		config.PassThreshold != 0 ||
		config.Threshold != 0 ||
		config.MaxHits != 0 ||
		config.DeltaPctMax != 0 ||
		config.BaselineOffsetMins != 0
}

func (s *Server) resolveElfApplication(query domain.ElfQuery, input elfQueryTestInput) (domain.Application, error) {
	applicationID := firstNonEmpty(input.ApplicationID, query.ApplicationID)
	if applicationID == "" {
		if strings.TrimSpace(input.ElfAppID) != "" || strings.TrimSpace(query.ElfAppID) != "" {
			return domain.Application{ElfAppID: firstNonEmpty(input.ElfAppID, query.ElfAppID)}, nil
		}
		return domain.Application{}, fmt.Errorf("applicationId or elfAppId is required")
	}
	application, ok := s.store.GetApplication(applicationID)
	if !ok {
		return domain.Application{}, fmt.Errorf("application not found")
	}
	return application, nil
}

func (s *Server) resolveElfProbeContext(query domain.ElfQuery, input elfQueryProbeInput) (domain.Application, *domain.ApplicationService, error) {
	applicationID := firstNonEmpty(input.ApplicationID, query.ApplicationID)
	var application domain.Application
	if applicationID != "" {
		app, ok := s.store.GetApplication(applicationID)
		if !ok {
			return domain.Application{}, nil, fmt.Errorf("application not found")
		}
		application = app
	} else if strings.TrimSpace(input.ElfAppID) != "" || strings.TrimSpace(query.ElfAppID) != "" {
		application = domain.Application{ElfAppID: firstNonEmpty(input.ElfAppID, query.ElfAppID)}
	}

	serviceID := firstNonEmpty(input.ServiceID, query.ServiceID)
	var service *domain.ApplicationService
	if serviceID != "" {
		svc, ok := s.store.GetApplicationService(serviceID)
		if !ok {
			return domain.Application{}, nil, fmt.Errorf("application service not found")
		}
		service = &svc
		if application.ID == "" {
			if app, ok := s.store.GetApplication(svc.ApplicationID); ok {
				application = app
			}
		}
	}
	return application, service, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
