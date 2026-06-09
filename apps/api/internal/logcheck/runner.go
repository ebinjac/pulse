package logcheck

import (
	"context"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/elfanalytics"
	"github.com/ensemble-pulse/pulse/apps/api/internal/elfsearch"
	"github.com/ensemble-pulse/pulse/apps/api/internal/events"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
)

type Service struct {
	Store  store.Store
	Events events.Publisher
}

func (s *Service) Execute(validationID string, preRuns, postRuns []domain.MonitorRun) domain.DeploymentValidation {
	validation, ok := s.Store.GetDeploymentValidation(validationID)
	if !ok {
		return domain.DeploymentValidation{}
	}
	application, appOK := s.Store.GetApplication(validation.ApplicationID)
	if !appOK {
		application = domain.Application{CarID: validation.CarID}
	}

	runner := &elfsearch.Runner{Settings: s.Store, Secrets: s.Store}
	comparative := &elfanalytics.ComparativeRunner{Runner: runner}
	results := make([]domain.ElfQueryRunResult, 0)

	deployStart := time.Now().UTC().Add(-1 * time.Hour)
	if validation.DeploymentStartedAt != nil {
		deployStart = validation.DeploymentStartedAt.UTC()
	}
	windows := elfanalytics.BuildWindows(deployStart, validation.BaselineWindowHours, time.Now().UTC())

	searchCtx := elfsearch.SearchContext{
		ApplicationID:          validation.ApplicationID,
		CarID:                  validation.CarID,
		DeploymentValidationID: validation.ID,
		BuildID:                validation.BuildID,
		Version:                validation.Version,
		Environment:            validation.Environment,
		DeploymentStartedAt:    windows.DeployStart,
		DeploymentEndedAt:      windows.DeployEnd,
		BaselineStartedAt:      windows.BaselineStart,
	}

	results = append(results, s.runManualQueries(comparative, runner, validation, application, windows, searchCtx)...)

	completed := time.Now().UTC()
	validation.ElfResults = results
	validation.LogCompletedAt = &completed
	validation.Status = domain.DeploymentValidationReportReady

	if len(preRuns) == 0 {
		preRuns = []domain.MonitorRun{}
	}
	if len(postRuns) == 0 {
		postRuns = s.Store.ListDeploymentValidationRuns(validation.ID, domain.DeploymentValidationPhasePost)
	}
	validation.Report = store.MergeElfResultsIntoReport(
		store.BuildDeploymentValidationReport(validation, preRuns, postRuns),
		results,
		elfQueryLookup(s.Store),
	)
	validation = s.Store.UpdateDeploymentValidation(validation)
	events.PublishValidationStatusChanged(s.Events, validation.ID, validation.Status)
	events.PublishValidationReportUpdated(s.Events, validation.ID, validation.Status)
	return validation
}

func (s *Service) scopedServices(validation domain.DeploymentValidation) []domain.ApplicationService {
	all := s.Store.ListApplicationServices(validation.ApplicationID)
	active := make([]domain.ApplicationService, 0, len(all))
	for _, service := range all {
		if service.IsActive {
			active = append(active, service)
		}
	}
	if len(validation.ServiceIDs) == 0 {
		return active
	}
	selected := make(map[string]bool, len(validation.ServiceIDs))
	for _, id := range validation.ServiceIDs {
		selected[id] = true
	}
	scoped := make([]domain.ApplicationService, 0)
	for _, service := range active {
		if selected[service.ID] {
			scoped = append(scoped, service)
		}
	}
	return scoped
}

func (s *Service) runManualQueries(
	comparative *elfanalytics.ComparativeRunner,
	runner *elfsearch.Runner,
	validation domain.DeploymentValidation,
	application domain.Application,
	windows elfanalytics.TimeWindows,
	searchCtx elfsearch.SearchContext,
) []domain.ElfQueryRunResult {
	results := make([]domain.ElfQueryRunResult, 0, len(validation.ElfQueryIDs))
	for _, queryID := range validation.ElfQueryIDs {
		query, found := s.Store.GetElfQuery(queryID)
		if !found || !query.IsActive {
			results = append(results, domain.ElfQueryRunResult{
				QueryID:      queryID,
				Result:       "fail",
				ErrorMessage: "ELF query not found or inactive",
				RanAt:        time.Now().UTC(),
			})
			continue
		}

		var service *domain.ApplicationService
		if strings.TrimSpace(query.ServiceID) != "" {
			if svc, ok := s.Store.GetApplicationService(query.ServiceID); ok {
				service = &svc
			}
		}

		mapping := elfanalytics.ResolveMapping(application, service)
		mergeQueryFieldMapping(&mapping, query.FieldMapping)

		var result domain.ElfQueryRunResult
		runQuery := query
		if query.CheckKind == "expression" {
			timeField := firstNonEmptyString(query.ProbeConfig.TimeField, query.FieldSchema.TimeField, mapping.Timestamp, "@timestamp")
			body, err := elfsearch.CompileRulesToQuery(
				query.CheckConfig,
				timeField,
				windows.DeployStart.Format(time.RFC3339),
				windows.DeployEnd.Format(time.RFC3339),
			)
			if err != nil {
				results = append(results, domain.ElfQueryRunResult{
					QueryID:      query.ID,
					QueryName:    query.Name,
					GateMode:     query.GateMode,
					Result:       "fail",
					ErrorMessage: err.Error(),
					RanAt:        time.Now().UTC(),
				})
				continue
			}
			runQuery.GeneratedSearchBody = body
			result, _ = runner.RunQuery(context.Background(), runQuery, application, searchCtx)
			criteriaResult, reason := elfsearch.EvaluateExpressionPass(query.CheckConfig, result.HitCount)
			result.Reason = reason
			result.Result = elfsearch.GateResult(query.GateMode, criteriaResult)
		} else if query.CheckKind != "" && query.CheckKind != "raw" && len(query.GeneratedSearchBody) > 0 {
			signalQuery := query
			if signalQuery.SignalType == "" || signalQuery.SignalType == "custom" {
				signalQuery.SignalType = checkKindToSignal(query.CheckKind)
			}
			result, _ = comparative.RunSignal(context.Background(), signalQuery, application, service, windows, searchCtx)
		} else {
			result, _ = runner.RunQuery(context.Background(), runQuery, application, searchCtx)
		}

		result.RunMeta = buildRunMeta(query, application, service, windows, mapping, result)
		results = append(results, result)
	}
	return results
}

func mergeQueryFieldMapping(base *domain.LogFieldMapping, override domain.LogFieldMapping) {
	if strings.TrimSpace(override.Timestamp) != "" {
		base.Timestamp = override.Timestamp
	}
	if strings.TrimSpace(override.Level) != "" {
		base.Level = override.Level
	}
	if strings.TrimSpace(override.Message) != "" {
		base.Message = override.Message
	}
	if strings.TrimSpace(override.ExceptionType) != "" {
		base.ExceptionType = override.ExceptionType
	}
	if strings.TrimSpace(override.ResponseTimeMs) != "" {
		base.ResponseTimeMs = override.ResponseTimeMs
	}
	if strings.TrimSpace(override.Service) != "" {
		base.Service = override.Service
	}
	if strings.TrimSpace(override.Endpoint) != "" {
		base.Endpoint = override.Endpoint
	}
	if strings.TrimSpace(override.StatusCode) != "" {
		base.StatusCode = override.StatusCode
	}
}

func checkKindToSignal(kind string) string {
	switch strings.TrimSpace(strings.ToLower(kind)) {
	case "new_terms":
		return elfanalytics.SignalNewExceptions
	case "delta_pct":
		return elfanalytics.SignalErrorSpike
	case "threshold":
		return elfanalytics.SignalLatencyRegression
	default:
		return elfanalytics.SignalCustom
	}
}

func buildRunMeta(
	query domain.ElfQuery,
	application domain.Application,
	service *domain.ApplicationService,
	windows elfanalytics.TimeWindows,
	mapping domain.LogFieldMapping,
	result domain.ElfQueryRunResult,
) domain.ElfQueryRunMeta {
	timeField := firstNonEmptyString(query.ProbeConfig.TimeField, mapping.Timestamp, "@timestamp")
	return domain.ElfQueryRunMeta{
		CheckKind:            query.CheckKind,
		PostWindow:           domain.ElfTimeWindow{Gte: windows.DeployStart.Format(time.RFC3339), Lte: windows.DeployEnd.Format(time.RFC3339), Field: timeField},
		BaselineWindow:       domain.ElfTimeWindow{Gte: windows.BaselineStart.Format(time.RFC3339), Lte: windows.DeployStart.Format(time.RFC3339), Field: timeField},
		FieldMappingUsed:     mapping,
		FieldSchemaUsed:      query.FieldSchema,
		CheckConfig:          query.CheckConfig,
		PassCriteria:         query.PassCriteria,
		ResolvedIndexPattern: result.ResolvedURL,
	}
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func (s *Service) runSignalPack(
	comparative *elfanalytics.ComparativeRunner,
	validation domain.DeploymentValidation,
	application domain.Application,
	service *domain.ApplicationService,
	windows elfanalytics.TimeWindows,
	searchCtx elfsearch.SearchContext,
) []domain.ElfQueryRunResult {
	profile := validation.ObservabilityProfile
	if profile == "" {
		profile = "standard"
	}
	if profile == "custom" && len(validation.SignalPackIDs) == 0 {
		return nil
	}
	signals := elfanalytics.ProfileSignals(profile)
	if len(signals) == 0 {
		return nil
	}

	mapping := elfanalytics.ResolveMapping(application, service)
	serviceID := ""
	if service != nil {
		serviceID = service.ID
	}

	results := make([]domain.ElfQueryRunResult, 0, len(signals))
	for _, signal := range signals {
		query := elfanalytics.BuildComparativeQueryFromSignal(signal, validation.ApplicationID, serviceID, mapping)
		query.ID = query.ID + "-" + serviceID
		if serviceID == "" {
			query.ID = "signal-" + signal.SignalType
		}
		result, err := comparative.RunSignal(context.Background(), query, application, service, windows, searchCtx)
		if err != nil && result.ErrorMessage == "" {
			result.ErrorMessage = err.Error()
		}
		results = append(results, result)
	}
	return results
}

func elfQueryLookup(st store.Store) map[string]domain.ElfQuery {
	lookup := map[string]domain.ElfQuery{}
	for _, query := range st.ListElfQueries("") {
		lookup[query.ID] = query
	}
	return lookup
}
