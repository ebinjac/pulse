package executor

import (
	"strconv"
	"strings"
	"time"

	"github.com/ensemble-pulse/pulse/apps/api/internal/domain"
	"github.com/ensemble-pulse/pulse/apps/api/internal/masking"
	"github.com/ensemble-pulse/pulse/apps/api/internal/store"
	"github.com/ensemble-pulse/pulse/apps/api/internal/variables"
)

type MockExecutor struct {
	store store.Store
}

func NewMockExecutor(store store.Store) *MockExecutor {
	return &MockExecutor{store: store}
}

func (e *MockExecutor) Run(monitor domain.Monitor) domain.MonitorRun {
	return e.run(monitor, true, "manual")
}

func (e *MockExecutor) RunDraft(monitor domain.Monitor) domain.MonitorRun {
	return e.run(monitor, true, "draft")
}

func (e *MockExecutor) RunScheduled(monitor domain.Monitor) domain.MonitorRun {
	return e.run(monitor, true, "schedule")
}

func (e *MockExecutor) Test(monitor domain.Monitor) domain.MonitorRun {
	return e.run(monitor, false, "test")
}

func (e *MockExecutor) run(monitor domain.Monitor, saveToStore bool, triggeredBy string) domain.MonitorRun {
	startedAt := time.Now().UTC()
	runID := "run-" + strconv.FormatInt(startedAt.UnixNano(), 10)
	stepRuns := make([]domain.StepRun, 0, len(monitor.Steps))
	duration := 0
	var failedStep *domain.StepRun

	for index, step := range monitor.Steps {
		latency := 280 + index*170
		if step.Type == "preRequest" {
			latency = 26 + index*9
		}
		duration += latency
		status := domain.StatusSuccess
		errorMessage := ""
		if stepHasAssertionFailure(step) {
			status = domain.StatusFailed
			errorMessage = "One or more assertions failed."
		}

		stepRun := domain.StepRun{
			ID:              runID + "-" + step.ID,
			StepID:          step.ID,
			StepName:        step.Name,
			Type:            step.Type,
			Status:          status,
			LatencyMS:       latency,
			Timing:          mockTiming(step.Type, latency),
			RequestSummary:  requestSummary(monitor, step),
			ResponseSummary: responseSummary(step, status, monitor.ResponseBodyLimitKB),
			Assertions:      maskAssertions(step.Assertions),
			Extractors:      step.Extractors,
			ErrorMessage:    errorMessage,
		}
		if status != domain.StatusSuccess && failedStep == nil {
			copyStep := stepRun
			failedStep = &copyStep
		}
		stepRuns = append(stepRuns, stepRun)
		if status != domain.StatusSuccess && !step.ContinueOnFailure {
			break
		}
	}

	endedAt := startedAt.Add(time.Duration(duration) * time.Millisecond)
	run := domain.MonitorRun{
		ID:          runID,
		MonitorID:   monitor.ID,
		MonitorName: monitor.Name,
		Status:      domain.StatusSuccess,
		TriggeredBy: triggeredBy,
		StartedAt:   startedAt,
		EndedAt:     endedAt,
		DurationMS:  duration,
		Steps:       stepRuns,
	}
	if failedStep != nil {
		run.Status = domain.StatusFailed
		run.FailureCategory = domain.FailureAssertion
		run.FailureReason = failedStep.StepName + " failed during mocked execution."
	}

	if saveToStore {
		e.store.SaveRun(run)
	}
	return run
}

func mockTiming(stepType string, latency int) domain.HTTPTiming {
	if stepType != "http" {
		return domain.HTTPTiming{}
	}

	dns := maxInt(latency/30, 1)
	tcp := maxInt(latency/12, 1)
	tls := maxInt(latency/10, 1)
	download := maxInt(latency/20, 1)
	waiting := latency - dns - tcp - tls - download
	if waiting < 0 {
		waiting = 0
	}

	return domain.HTTPTiming{
		DNSLookupMS:       dns,
		TCPConnectMS:      tcp,
		TLSHandshakeMS:    tls,
		TimeToFirstByteMS: waiting,
		DownloadMS:        download,
		TotalMS:           latency,
	}
}

func maxInt(value int, minimum int) int {
	if value < minimum {
		return minimum
	}
	return value
}

func stepHasAssertionFailure(step domain.MonitorStep) bool {
	for _, assertion := range step.Assertions {
		if assertion.Actual == "" {
			continue
		}
		switch assertion.Operator {
		case "equals":
			if assertion.Actual != assertion.Expected {
				return true
			}
		case "notEquals":
			if assertion.Actual == assertion.Expected {
				return true
			}
		case "lessThan":
			if numeric(assertion.Actual) >= numeric(assertion.Expected) {
				return true
			}
		case "greaterThan":
			if numeric(assertion.Actual) <= numeric(assertion.Expected) {
				return true
			}
		case "exists":
			if assertion.Actual == "missing" {
				return true
			}
		}
	}

	return false
}

func maskAssertions(assertions []domain.Assertion) []domain.Assertion {
	masked := make([]domain.Assertion, len(assertions))
	copy(masked, assertions)
	for index := range masked {
		if masked[index].Sensitive {
			masked[index].Actual = masking.Mask
		}
	}

	return masked
}

func requestSummary(monitor domain.Monitor, step domain.MonitorStep) string {
	if step.Type == "http" {
		method := step.Method
		if method == "" {
			method = "GET"
		}
		url := step.URL
		resolved, err := (variables.Resolver{Variables: monitor.Variables}).Resolve(step.URL)
		if err == nil {
			url = resolved
		}

		return method + " " + url + ". Sensitive headers/body values masked before storage."
	}

	return "Executed controlled pre-request actions. Secret inputs masked."
}

func responseSummary(step domain.MonitorStep, status domain.MonitorStatus, limitKB int) string {
	if step.Type != "http" {
		return "Generated outputs available to later steps as masked runtime variables."
	}
	statusCode := "200"
	if status != domain.StatusSuccess {
		statusCode = "503"
	}
	if limitKB <= 0 {
		limitKB = 32
	}

	return statusCode + " application/json, masked and truncated to " + strconv.Itoa(limitKB) + " KB."
}

func numeric(value string) float64 {
	clean := strings.Map(func(r rune) rune {
		if (r >= '0' && r <= '9') || r == '.' {
			return r
		}
		return -1
	}, value)
	parsed, err := strconv.ParseFloat(clean, 64)
	if err != nil {
		return 0
	}

	return parsed
}
