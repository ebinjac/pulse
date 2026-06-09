package store

import (
	"fmt"
	"strings"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
)

func MergeElfResultsIntoReport(report domain.DeploymentValidationReport, results []domain.ElfQueryRunResult, queries map[string]domain.ElfQuery) domain.DeploymentValidationReport {
	if len(results) == 0 {
		if report.ElfComparisons == nil {
			report.ElfComparisons = []domain.ElfQueryComparison{}
		}
		if report.ElfObservability.ByService == nil {
			report.ElfObservability.ByService = map[string][]domain.ElfQueryComparison{}
		}
		return report
	}

	report.ElfComparisons = make([]domain.ElfQueryComparison, 0, len(results))
	report.ElfObservability.ByService = map[string][]domain.ElfQueryComparison{}

	for _, result := range results {
		query := queries[result.QueryID]
		queryName := result.QueryName
		if queryName == "" {
			queryName = query.Name
		}
		gateMode := result.GateMode
		if gateMode == "" {
			gateMode = query.GateMode
		}
		comparison := domain.ElfQueryComparison{
			QueryID:           result.QueryID,
			QueryName:         queryName,
			GateMode:          gateMode,
			ServiceID:         result.ServiceID,
			ServiceName:       result.ServiceName,
			SignalType:        firstNonEmpty(result.SignalType, query.SignalType),
			Result:            result.Result,
			HitCount:          result.HitCount,
			BaselineValue:     result.BaselineValue,
			PostValue:         result.PostValue,
			DeltaPct:          result.DeltaPct,
			Reason:            result.Reason,
			SampleHits:        result.SampleHits,
			StructuredSamples: result.StructuredSamples,
			Facets:            result.Facets,
			RunMeta:           result.RunMeta,
		}
		if comparison.Result == "" && result.ErrorMessage != "" {
			comparison.Result = "fail"
			comparison.Reason = result.ErrorMessage
		}
		report.ElfComparisons = append(report.ElfComparisons, comparison)

		serviceKey := firstNonEmpty(comparison.ServiceName, comparison.ServiceID, "application")
		report.ElfObservability.ByService[serviceKey] = append(report.ElfObservability.ByService[serviceKey], comparison)

		if comparison.Result == "fail" && strings.EqualFold(gateMode, "blocking") {
			report.ElfSummary.BlockingFails++
			report.Regressions = append(report.Regressions, fmt.Sprintf("Blocking ELF signal %s failed for %s: %s", queryName, serviceKey, firstNonEmpty(comparison.Reason, result.ErrorMessage)))
		}
		if comparison.Result == "warning" || (comparison.Result == "fail" && strings.EqualFold(gateMode, "advisory")) {
			report.ElfSummary.AdvisoryWarnings++
			if strings.EqualFold(gateMode, "advisory") {
				report.Regressions = append(report.Regressions, fmt.Sprintf("Advisory ELF signal %s flagged for %s: %s", queryName, serviceKey, firstNonEmpty(comparison.Reason, result.ErrorMessage)))
			}
		}
	}

	monitorStatus := report.Status
	if report.ElfSummary.BlockingFails > 0 {
		report.Status = "fail"
	} else if report.ElfSummary.AdvisoryWarnings > 0 && monitorStatus != "fail" {
		report.Status = "warning"
	}
	if report.Regressions == nil {
		report.Regressions = []string{}
	}
	return report
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
