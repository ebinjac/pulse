package domain

import (
	"encoding/json"
	"strings"
	"time"
)

type MonitorStatus string

const (
	StatusSuccess MonitorStatus = "SUCCESS"
	StatusFailed  MonitorStatus = "FAILED"
	StatusTimeout MonitorStatus = "TIMEOUT"
	StatusError   MonitorStatus = "ERROR"
	StatusSkipped MonitorStatus = "SKIPPED"
)

func (status MonitorStatus) MarshalJSON() ([]byte, error) {
	return json.Marshal(strings.ToLower(string(status)))
}

func (status *MonitorStatus) UnmarshalJSON(value []byte) error {
	var raw string
	if err := json.Unmarshal(value, &raw); err != nil {
		return err
	}
	*status = NormalizeMonitorStatus(raw)
	return nil
}

func NormalizeMonitorStatus(status string) MonitorStatus {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case string(StatusSuccess):
		return StatusSuccess
	case string(StatusFailed):
		return StatusFailed
	case string(StatusTimeout):
		return StatusTimeout
	case string(StatusError):
		return StatusError
	case string(StatusSkipped):
		return StatusSkipped
	default:
		return MonitorStatus(strings.ToUpper(strings.TrimSpace(status)))
	}
}

type FailureCategory string

const (
	FailureAssertion  FailureCategory = "ASSERTION_FAILURE"
	FailureDNS        FailureCategory = "DNS_FAILURE"
	FailureConnection FailureCategory = "CONNECTION_FAILURE"
	FailureTLS        FailureCategory = "TLS_FAILURE"
	FailureTimeout    FailureCategory = "TIMEOUT"
	FailureUnknown    FailureCategory = "UNKNOWN_ERROR"
)

type Monitor struct {
	ID                  string            `json:"id"`
	ApplicationID       string            `json:"applicationId,omitempty"`
	Name                string            `json:"name"`
	Description         string            `json:"description"`
	ScheduleMode        string            `json:"scheduleMode,omitempty"`
	ScheduleLabel       string            `json:"scheduleLabel,omitempty"`
	Cron                string            `json:"cron,omitempty"`
	ScheduleCron        string            `json:"scheduleCron"`
	Timezone            string            `json:"timezone"`
	TimeoutMS           int               `json:"timeoutMs"`
	RetryCount          int               `json:"retryCount"`
	FailureThreshold    int               `json:"failureThreshold"`
	ResponseBodyLimitKB int               `json:"responseBodyLimitKb"`
	IsActive            bool              `json:"isActive"`
	AlertEnabled        bool              `json:"alertEnabled"`
	Variables           map[string]string `json:"variables"`
	SecretAliases       []string          `json:"secretAliases"`
	Steps               []MonitorStep     `json:"steps"`
	AlertPolicy         AlertPolicy       `json:"alertPolicy,omitempty"`
	Status              MonitorStatus     `json:"status"`
	LastRunAt           *time.Time        `json:"lastRunAt,omitempty"`
	LastDurationMS      int               `json:"lastDurationMs"`
	SuccessRate24H      float64           `json:"successRate24h,omitempty"`
	CreatedAt           time.Time         `json:"createdAt"`
	UpdatedAt           time.Time         `json:"updatedAt"`
	PublishedVersion    int               `json:"publishedVersion,omitempty"`
	HasUnpublishedDraft bool              `json:"hasUnpublishedDraft,omitempty"`
}

type MonitorVersion struct {
	ID            string    `json:"id"`
	MonitorID     string    `json:"monitorId"`
	VersionNumber int       `json:"versionNumber"`
	Config        Monitor   `json:"config"`
	ChangeNote    string    `json:"changeNote,omitempty"`
	CreatedBy     string    `json:"createdBy,omitempty"`
	Source        string    `json:"source"`
	CreatedAt     time.Time `json:"createdAt"`
}

type MonitorVersionSummary struct {
	ID            string    `json:"id"`
	MonitorID     string    `json:"monitorId"`
	VersionNumber int       `json:"versionNumber"`
	ChangeNote    string    `json:"changeNote,omitempty"`
	CreatedBy     string    `json:"createdBy,omitempty"`
	Source        string    `json:"source"`
	CreatedAt     time.Time `json:"createdAt"`
}

type MonitorDetail struct {
	Published           Monitor  `json:"published"`
	Draft               *Monitor `json:"draft,omitempty"`
	PublishedVersion    int      `json:"publishedVersion"`
	HasUnpublishedDraft bool     `json:"hasUnpublishedDraft"`
}

type LogFieldMapping struct {
	Timestamp         string `json:"timestamp,omitempty"`
	Level             string `json:"level,omitempty"`
	Service           string `json:"service,omitempty"`
	Endpoint          string `json:"endpoint,omitempty"`
	StatusCode        string `json:"statusCode,omitempty"`
	ResponseTimeMs    string `json:"responseTimeMs,omitempty"`
	ExceptionType     string `json:"exceptionType,omitempty"`
	DownstreamService string `json:"downstreamService,omitempty"`
	TraceID           string `json:"traceId,omitempty"`
	Environment       string `json:"environment,omitempty"`
	Message           string `json:"message,omitempty"`
	Tags              string `json:"tags,omitempty"`
}

type ApplicationService struct {
	ID                string          `json:"id"`
	ApplicationID     string          `json:"applicationId"`
	Name              string          `json:"name"`
	LogServiceName    string          `json:"logServiceName"`
	Squad             string          `json:"squad,omitempty"`
	Owner             string          `json:"owner,omitempty"`
	Environment       string          `json:"environment,omitempty"`
	ElfAppID          string          `json:"elfAppId,omitempty"`
	IndexPathTemplate string          `json:"indexPathTemplate,omitempty"`
	LogFieldMapping   LogFieldMapping `json:"logFieldMapping,omitempty"`
	IsActive          bool            `json:"isActive"`
	CreatedAt         time.Time       `json:"createdAt"`
	UpdatedAt         time.Time       `json:"updatedAt"`
}

type Application struct {
	ID                string          `json:"id"`
	Name              string          `json:"name"`
	CarID             string          `json:"carId"`
	ElfAppID          string          `json:"elfAppId,omitempty"`
	IndexPathTemplate string          `json:"indexPathTemplate,omitempty"`
	LogFieldMapping   LogFieldMapping `json:"logFieldMapping,omitempty"`
	Description       string          `json:"description,omitempty"`
	Owner             string          `json:"owner,omitempty"`
	Environment       string          `json:"environment,omitempty"`
	Tags              []string        `json:"tags,omitempty"`
	AlertRouting      AlertRouting    `json:"alertRouting,omitempty"`
	CreatedAt         time.Time       `json:"createdAt"`
	UpdatedAt         time.Time       `json:"updatedAt"`
}

type ApplicationRunSummary struct {
	ApplicationID string   `json:"applicationId"`
	BatchID       string   `json:"batchId,omitempty"`
	Queued        int      `json:"queued"`
	Skipped       int      `json:"skipped"`
	MonitorIDs    []string `json:"monitorIds"`
}

type DeploymentValidationStatus string

const (
	DeploymentValidationDraft       DeploymentValidationStatus = "draft"
	DeploymentValidationPreRunning  DeploymentValidationStatus = "pre_running"
	DeploymentValidationPreComplete DeploymentValidationStatus = "pre_complete"
	DeploymentValidationPostRunning DeploymentValidationStatus = "post_running"
	DeploymentValidationLogRunning  DeploymentValidationStatus = "log_running"
	DeploymentValidationReportReady DeploymentValidationStatus = "report_ready"
	DeploymentValidationIncomplete  DeploymentValidationStatus = "incomplete"
)

type DeploymentValidationPhase string

const (
	DeploymentValidationPhasePre  DeploymentValidationPhase = "pre_deploy"
	DeploymentValidationPhasePost DeploymentValidationPhase = "post_deploy"
)

type DeploymentValidation struct {
	ID                   string                       `json:"id"`
	ApplicationID        string                       `json:"applicationId"`
	ApplicationName      string                       `json:"applicationName"`
	CarID                string                       `json:"carId"`
	Name                 string                       `json:"name"`
	Version              string                       `json:"version,omitempty"`
	BuildID              string                       `json:"buildId,omitempty"`
	Environment          string                       `json:"environment,omitempty"`
	Status               DeploymentValidationStatus   `json:"status"`
	MonitorIDs           []string                     `json:"monitorIds"`
	Report               DeploymentValidationReport   `json:"report,omitempty"`
	AIReport             DeploymentValidationAIReport `json:"aiReport,omitempty"`
	SampleCount          int                          `json:"sampleCount"`
	IntervalSeconds      int                          `json:"intervalSeconds"`
	DeploymentStartedAt  *time.Time                   `json:"deploymentStartedAt,omitempty"`
	BaselineWindowHours  int                          `json:"baselineWindowHours"`
	BaselineRunCount     int                          `json:"baselineRunCount"`
	CreatedAt            time.Time                    `json:"createdAt"`
	UpdatedAt            time.Time                    `json:"updatedAt"`
	PreStartedAt         *time.Time                   `json:"preStartedAt,omitempty"`
	PreCompletedAt       *time.Time                   `json:"preCompletedAt,omitempty"`
	PostStartedAt        *time.Time                   `json:"postStartedAt,omitempty"`
	PostCompletedAt      *time.Time                   `json:"postCompletedAt,omitempty"`
	ElfQueryIDs          []string                     `json:"elfQueryIds,omitempty"`
	AutoRunLogCheck      bool                         `json:"autoRunLogCheck,omitempty"`
	ServiceIDs           []string                     `json:"serviceIds,omitempty"`
	ObservabilityProfile string                       `json:"observabilityProfile,omitempty"` // legacy; log checks use elfQueryIds only
	SignalPackIDs        []string                     `json:"signalPackIds,omitempty"`        // legacy
	ElfResults           []ElfQueryRunResult          `json:"elfResults,omitempty"`
	LogStartedAt         *time.Time                   `json:"logStartedAt,omitempty"`
	LogCompletedAt       *time.Time                   `json:"logCompletedAt,omitempty"`
}

type ElfProxySettings struct {
	BaseURL           string `json:"baseUrl"`
	IndexPathTemplate string `json:"indexPathTemplate"`
	Pretty            bool   `json:"pretty"`
	TimeoutSeconds    int    `json:"timeoutSeconds"`
	BasicAuthUsername string `json:"basicAuthUsername,omitempty"`
}

type ElfPassCriteria struct {
	Type      string  `json:"type"`
	Threshold float64 `json:"threshold"`
	Operator  string  `json:"operator,omitempty"`
	Path      string  `json:"path,omitempty"`
	Name      string  `json:"name,omitempty"`
}

type ElfComparisonConfig struct {
	BaselineMetric string  `json:"baselineMetric,omitempty"`
	PostMetric     string  `json:"postMetric,omitempty"`
	DeltaPctMax    float64 `json:"deltaPctMax,omitempty"`
	DeltaAbsMax    float64 `json:"deltaAbsMax,omitempty"`
	MultiplierMax  float64 `json:"multiplierMax,omitempty"`
	MinNewTermHits int     `json:"minNewTermHits,omitempty"`
}

type ElfProbeConfig struct {
	TimeField      string `json:"timeField,omitempty"`
	DefaultGte     string `json:"defaultGte,omitempty"`
	DefaultLte     string `json:"defaultLte,omitempty"`
	RelativePreset string `json:"relativePreset,omitempty"`
}

type ElfFieldDescriptor struct {
	Path          string   `json:"path"`
	Label         string   `json:"label,omitempty"`
	ValueType     string   `json:"valueType,omitempty"`
	SampleValues  []string `json:"sampleValues,omitempty"`
	SuggestedRole string   `json:"suggestedRole,omitempty"`
	IsTimeField   bool     `json:"isTimeField,omitempty"`
	Source        string   `json:"source,omitempty"`
}

type ElfFieldSchema struct {
	TimeField    string               `json:"timeField,omitempty"`
	Fields       []ElfFieldDescriptor `json:"fields,omitempty"`
	DiscoveredAt time.Time            `json:"discoveredAt,omitempty"`
}

type ElfCheckRule struct {
	ID       string `json:"id,omitempty"`
	Field    string `json:"field"`
	Operator string `json:"operator"`
	Value    any    `json:"value,omitempty"`
}

type ElfCheckConfig struct {
	Mode               string         `json:"mode,omitempty"`
	Logic              string         `json:"logic,omitempty"`
	Rules              []ElfCheckRule `json:"rules,omitempty"`
	PassWhen           string         `json:"passWhen,omitempty"`
	PassThreshold      float64        `json:"passThreshold,omitempty"`
	FacetField         string         `json:"facetField,omitempty"`
	Pattern            string         `json:"pattern,omitempty"`
	BaselineOffsetMins int            `json:"baselineOffsetMins,omitempty"`
	DeltaPctMax        float64        `json:"deltaPctMax,omitempty"`
	Percentile         float64        `json:"percentile,omitempty"`
	Threshold          float64        `json:"threshold,omitempty"`
	MaxHits            float64        `json:"maxHits,omitempty"`
}

type ElfDetectedRole struct {
	Role       string   `json:"role"`
	Path       string   `json:"path"`
	Label      string   `json:"label,omitempty"`
	ValueType  string   `json:"valueType,omitempty"`
	Confidence string   `json:"confidence,omitempty"`
	Samples    []string `json:"samples,omitempty"`
}

type ElfSuggestedCheck struct {
	ID              string          `json:"id"`
	Label           string          `json:"label"`
	Description     string          `json:"description"`
	GateMode        string          `json:"gateMode"`
	CheckKind       string          `json:"checkKind"`
	CheckConfig     ElfCheckConfig  `json:"checkConfig"`
	PassCriteria    ElfPassCriteria `json:"passCriteria"`
	MatchCount      int             `json:"matchCount"`
	Severity        string          `json:"severity,omitempty"`
	DeploymentFocus string          `json:"deploymentFocus,omitempty"`
}

type ElfProbeSummary struct {
	HitCount      int    `json:"hitCount,omitempty"`
	Gte           string `json:"gte,omitempty"`
	Lte           string `json:"lte,omitempty"`
	ResolvedIndex string `json:"resolvedIndex,omitempty"`
	DurationMS    int    `json:"durationMs,omitempty"`
	Truncated     bool   `json:"truncated,omitempty"`
	ErrorMessage  string `json:"errorMessage,omitempty"`
}

type ElfQueryRunMeta struct {
	CheckKind            string          `json:"checkKind,omitempty"`
	PostWindow           ElfTimeWindow   `json:"postWindow,omitempty"`
	BaselineWindow       ElfTimeWindow   `json:"baselineWindow,omitempty"`
	Curl                 string          `json:"curl,omitempty"`
	FieldMappingUsed     LogFieldMapping `json:"fieldMappingUsed,omitempty"`
	FieldSchemaUsed      ElfFieldSchema  `json:"fieldSchemaUsed,omitempty"`
	CheckConfig          ElfCheckConfig  `json:"checkConfig,omitempty"`
	PassCriteria         ElfPassCriteria `json:"passCriteria,omitempty"`
	ResolvedIndexPattern string          `json:"resolvedIndexPattern,omitempty"`
}

type ElfTimeWindow struct {
	Gte   string `json:"gte,omitempty"`
	Lte   string `json:"lte,omitempty"`
	Field string `json:"field,omitempty"`
}

type ElfQuery struct {
	ID                  string              `json:"id"`
	Name                string              `json:"name"`
	Description         string              `json:"description,omitempty"`
	ElfAppID            string              `json:"elfAppId,omitempty"`
	IndexPathTemplate   string              `json:"indexPathTemplate,omitempty"`
	SearchBody          json.RawMessage     `json:"searchBody"`
	GateMode            string              `json:"gateMode"`
	PassCriteria        ElfPassCriteria     `json:"passCriteria"`
	ComparisonConfig    ElfComparisonConfig `json:"comparisonConfig,omitempty"`
	SignalType          string              `json:"signalType,omitempty"`
	ApplicationID       string              `json:"applicationId,omitempty"`
	ServiceID           string              `json:"serviceId,omitempty"`
	ProbeConfig         ElfProbeConfig      `json:"probeConfig,omitempty"`
	FieldMapping        LogFieldMapping     `json:"fieldMapping,omitempty"`
	FieldSchema         ElfFieldSchema      `json:"fieldSchema,omitempty"`
	CheckKind           string              `json:"checkKind,omitempty"`
	CheckConfig         ElfCheckConfig      `json:"checkConfig,omitempty"`
	GeneratedSearchBody json.RawMessage     `json:"generatedSearchBody,omitempty"`
	LastProbeAt         *time.Time          `json:"lastProbeAt,omitempty"`
	LastProbeSummary    ElfProbeSummary     `json:"lastProbeSummary,omitempty"`
	Tags                []string            `json:"tags,omitempty"`
	IsActive            bool                `json:"isActive"`
	CreatedAt           time.Time           `json:"createdAt"`
	UpdatedAt           time.Time           `json:"updatedAt"`
}

type ElfFacetBucket struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
}

type ElfSignalFacets struct {
	TopServices    []ElfFacetBucket `json:"topServices,omitempty"`
	TopExceptions  []ElfFacetBucket `json:"topExceptions,omitempty"`
	TopEndpoints   []ElfFacetBucket `json:"topEndpoints,omitempty"`
	TopDownstreams []ElfFacetBucket `json:"topDownstreams,omitempty"`
	NewTerms       []ElfFacetBucket `json:"newTerms,omitempty"`
}

type ElfStructuredSampleHit struct {
	Service       string `json:"service,omitempty"`
	Endpoint      string `json:"endpoint,omitempty"`
	ExceptionType string `json:"exceptionType,omitempty"`
	TraceID       string `json:"traceId,omitempty"`
	Level         string `json:"level,omitempty"`
	StatusCode    string `json:"statusCode,omitempty"`
	Message       string `json:"message,omitempty"`
}

type ElfQueryRunResult struct {
	QueryID           string                   `json:"queryId"`
	QueryName         string                   `json:"queryName,omitempty"`
	GateMode          string                   `json:"gateMode,omitempty"`
	ElfAppID          string                   `json:"elfAppId,omitempty"`
	ServiceID         string                   `json:"serviceId,omitempty"`
	ServiceName       string                   `json:"serviceName,omitempty"`
	SignalType        string                   `json:"signalType,omitempty"`
	ResolvedURL       string                   `json:"resolvedUrl,omitempty"`
	Result            string                   `json:"result"`
	HitCount          int                      `json:"hitCount"`
	BaselineValue     float64                  `json:"baselineValue,omitempty"`
	PostValue         float64                  `json:"postValue,omitempty"`
	DeltaPct          float64                  `json:"deltaPct,omitempty"`
	Reason            string                   `json:"reason,omitempty"`
	SampleHits        []string                 `json:"sampleHits,omitempty"`
	StructuredSamples []ElfStructuredSampleHit `json:"structuredSamples,omitempty"`
	Facets            ElfSignalFacets          `json:"facets,omitempty"`
	DurationMS        int                      `json:"durationMs"`
	ErrorMessage      string                   `json:"errorMessage,omitempty"`
	RunMeta           ElfQueryRunMeta          `json:"runMeta,omitempty"`
	RanAt             time.Time                `json:"ranAt"`
}

type DeploymentValidationRunLink struct {
	ValidationID string                    `json:"validationId"`
	Phase        DeploymentValidationPhase `json:"phase"`
	MonitorID    string                    `json:"monitorId"`
	RunID        string                    `json:"runId"`
	CreatedAt    time.Time                 `json:"createdAt"`
}

type ElfQueryComparison struct {
	QueryID           string                   `json:"queryId"`
	QueryName         string                   `json:"queryName"`
	GateMode          string                   `json:"gateMode"`
	ServiceID         string                   `json:"serviceId,omitempty"`
	ServiceName       string                   `json:"serviceName,omitempty"`
	SignalType        string                   `json:"signalType,omitempty"`
	Result            string                   `json:"result"`
	HitCount          int                      `json:"hitCount"`
	BaselineValue     float64                  `json:"baselineValue,omitempty"`
	PostValue         float64                  `json:"postValue,omitempty"`
	DeltaPct          float64                  `json:"deltaPct,omitempty"`
	Reason            string                   `json:"reason,omitempty"`
	SampleHits        []string                 `json:"sampleHits,omitempty"`
	StructuredSamples []ElfStructuredSampleHit `json:"structuredSamples,omitempty"`
	Facets            ElfSignalFacets          `json:"facets,omitempty"`
	RunMeta           ElfQueryRunMeta          `json:"runMeta,omitempty"`
}

type ElfObservabilityFindings struct {
	ByService map[string][]ElfQueryComparison `json:"byService,omitempty"`
}

type ElfReportSummary struct {
	BlockingFails    int `json:"blockingFails"`
	AdvisoryWarnings int `json:"advisoryWarnings"`
}

type DeploymentValidationReport struct {
	Status             string                        `json:"status"`
	Summary            DeploymentValidationSummary   `json:"summary"`
	Regressions        []string                      `json:"regressions"`
	MonitorComparisons []MonitorValidationComparison `json:"monitorComparisons"`
	ElfComparisons     []ElfQueryComparison          `json:"elfComparisons,omitempty"`
	ElfObservability   ElfObservabilityFindings      `json:"elfObservability,omitempty"`
	ElfSummary         ElfReportSummary              `json:"elfSummary,omitempty"`
	GeneratedAt        time.Time                     `json:"generatedAt,omitempty"`
	IncompleteReason   string                        `json:"incompleteReason,omitempty"`
}

type DeploymentValidationAIReport struct {
	GeneratedAt      time.Time `json:"generatedAt,omitempty"`
	ExecutiveSummary string    `json:"executiveSummary,omitempty"`
	Recommendation   string    `json:"recommendation,omitempty"`
	RiskLevel        string    `json:"riskLevel,omitempty"`
	KeyFindings      []string  `json:"keyFindings,omitempty"`
	NextActions      []string  `json:"nextActions,omitempty"`
}

type DeploymentValidationSummary struct {
	TotalMonitors      int     `json:"totalMonitors"`
	ComparedMonitors   int     `json:"comparedMonitors"`
	PreSuccessRate     float64 `json:"preSuccessRate"`
	PostSuccessRate    float64 `json:"postSuccessRate"`
	SuccessRateDelta   float64 `json:"successRateDelta"`
	PreP95LatencyMS    int     `json:"preP95LatencyMs"`
	PostP95LatencyMS   int     `json:"postP95LatencyMs"`
	P95LatencyDeltaMS  int     `json:"p95LatencyDeltaMs"`
	P95LatencyDeltaPct float64 `json:"p95LatencyDeltaPct"`
	PreP99LatencyMS    int     `json:"preP99LatencyMs"`
	PostP99LatencyMS   int     `json:"postP99LatencyMs"`
	PreMaxLatencyMS    int     `json:"preMaxLatencyMs"`
	PostMaxLatencyMS   int     `json:"postMaxLatencyMs"`
	PreMeanLatencyMS   int     `json:"preMeanLatencyMs"`
	PostMeanLatencyMS  int     `json:"postMeanLatencyMs"`
	PreFailureCount    int     `json:"preFailureCount"`
	PostFailureCount   int     `json:"postFailureCount"`
	NewFailures        int     `json:"newFailures"`
	ResolvedFailures   int     `json:"resolvedFailures"`
}

type MonitorValidationComparison struct {
	MonitorID            string        `json:"monitorId"`
	MonitorName          string        `json:"monitorName"`
	PreRunID             string        `json:"preRunId,omitempty"`
	PostRunID            string        `json:"postRunId,omitempty"`
	PreStatus            MonitorStatus `json:"preStatus,omitempty"`
	PostStatus           MonitorStatus `json:"postStatus,omitempty"`
	PreDurationMS        int           `json:"preDurationMs"`
	PostDurationMS       int           `json:"postDurationMs"`
	DurationDeltaMS      int           `json:"durationDeltaMs"`
	DurationDeltaPct     float64       `json:"durationDeltaPct"`
	Result               string        `json:"result"`
	Reason               string        `json:"reason,omitempty"`
	SlowestTimingPhase   string        `json:"slowestTimingPhase,omitempty"`
	SlowestTimingDeltaMS int           `json:"slowestTimingDeltaMs,omitempty"`
}

type AlertRouting struct {
	Enabled                bool     `json:"enabled"`
	Severity               string   `json:"severity,omitempty"`
	Threshold              int      `json:"threshold,omitempty"`
	ResponseTimeMS         int      `json:"responseTimeMs,omitempty"`
	CooldownMinutes        int      `json:"cooldownMinutes,omitempty"`
	Email                  bool     `json:"email"`
	SlackWebhook           bool     `json:"slackWebhook"`
	EmailTo                []string `json:"emailTo,omitempty"`
	OnCallTargets          []string `json:"onCallTargets,omitempty"`
	SlackWebhookSecret     string   `json:"slackWebhookSecret,omitempty"`
	InheritFromApplication bool     `json:"inheritFromApplication,omitempty"`
}

type AlertPolicy struct {
	Enabled                bool     `json:"enabled"`
	Threshold              int      `json:"threshold"`
	ResponseTimeMS         int      `json:"responseTimeMs"`
	Email                  bool     `json:"email"`
	SlackWebhook           bool     `json:"slackWebhook"`
	CooldownMinutes        int      `json:"cooldownMinutes"`
	Severity               string   `json:"severity,omitempty"`
	EmailTo                []string `json:"emailTo,omitempty"`
	OnCallTargets          []string `json:"onCallTargets,omitempty"`
	SlackWebhookSecret     string   `json:"slackWebhookSecret,omitempty"`
	InheritFromApplication bool     `json:"inheritFromApplication,omitempty"`
}

type MonitorStep struct {
	ID                string         `json:"id"`
	MonitorID         string         `json:"monitorId"`
	Order             int            `json:"order"`
	Name              string         `json:"name"`
	Type              string         `json:"type"`
	Method            string         `json:"method,omitempty"`
	URL               string         `json:"url,omitempty"`
	TimeoutMS         int            `json:"timeoutMs"`
	RetryCount        int            `json:"retryCount"`
	ContinueOnFailure bool           `json:"continueOnFailure"`
	Actions           []Action       `json:"actions,omitempty"`
	Assertions        []Assertion    `json:"assertions"`
	Extractors        []Extractor    `json:"extractors"`
	Config            map[string]any `json:"config,omitempty"`
	PreRequestScript  string         `json:"preRequestScript,omitempty"`
}

type Action struct {
	ID            string `json:"id"`
	Type          string `json:"type"`
	Label         string `json:"label"`
	Output        string `json:"output"`
	ConfigPreview string `json:"configPreview"`
}

type Assertion struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Label     string `json:"label"`
	Target    string `json:"target"`
	Operator  string `json:"operator"`
	Expected  string `json:"expected"`
	Actual    string `json:"actual,omitempty"`
	Sensitive bool   `json:"sensitive,omitempty"`
}

type Extractor struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Source    string `json:"source"`
	Sensitive bool   `json:"sensitive,omitempty"`
	Optional  bool   `json:"optional,omitempty"`
}

type MonitorRun struct {
	ID              string          `json:"id"`
	MonitorID       string          `json:"monitorId"`
	MonitorName     string          `json:"monitorName"`
	Status          MonitorStatus   `json:"status"`
	TriggeredBy     string          `json:"triggeredBy"`
	StartedAt       time.Time       `json:"startedAt"`
	EndedAt         time.Time       `json:"endedAt"`
	DurationMS      int             `json:"durationMs"`
	FailureCategory FailureCategory `json:"failureCategory,omitempty"`
	FailureReason   string          `json:"failureReason,omitempty"`
	Steps           []StepRun       `json:"steps"`
}

type AlertStatus string

const (
	AlertStatusOpen         AlertStatus = "open"
	AlertStatusAcknowledged AlertStatus = "acknowledged"
	AlertStatusSuppressed   AlertStatus = "suppressed"
	AlertStatusResolved     AlertStatus = "resolved"
)

type AlertDelivery struct {
	Channel string    `json:"channel"`
	Status  string    `json:"status"`
	Detail  string    `json:"detail,omitempty"`
	SentAt  time.Time `json:"sentAt,omitempty"`
}

type AlertEvent struct {
	ID                string          `json:"id"`
	MonitorID         string          `json:"monitorId"`
	RunID             string          `json:"runId,omitempty"`
	Status            AlertStatus     `json:"status"`
	Severity          string          `json:"severity"`
	Title             string          `json:"title"`
	Description       string          `json:"description"`
	FailureCategory   FailureCategory `json:"failureCategory,omitempty"`
	Channels          []string        `json:"channels"`
	Deliveries        []AlertDelivery `json:"deliveries"`
	FirstTriggeredAt  time.Time       `json:"firstTriggeredAt"`
	LastTriggeredAt   time.Time       `json:"lastTriggeredAt"`
	LastDeliveredAt   *time.Time      `json:"lastDeliveredAt,omitempty"`
	ResolvedAt        *time.Time      `json:"resolvedAt,omitempty"`
	AcknowledgedBy    string          `json:"acknowledgedBy,omitempty"`
	AcknowledgedAt    *time.Time      `json:"acknowledgedAt,omitempty"`
	SnoozedUntil      *time.Time      `json:"snoozedUntil,omitempty"`
	SuppressionReason string          `json:"suppressionReason,omitempty"`
	CreatedAt         time.Time       `json:"createdAt"`
	UpdatedAt         time.Time       `json:"updatedAt"`
}

type RetentionSettings struct {
	RunsRetentionDays int  `json:"runsRetentionDays"`
	Enabled           bool `json:"enabled"`
}

type CertificateProfile struct {
	ID                    string     `json:"id"`
	Name                  string     `json:"name"`
	Host                  string     `json:"host"`
	Port                  int        `json:"port"`
	CertType              string     `json:"certType"`
	CertSecretAlias       string     `json:"certSecretAlias,omitempty"`
	KeySecretAlias        string     `json:"keySecretAlias,omitempty"`
	PFXSecretAlias        string     `json:"pfxSecretAlias,omitempty"`
	CACertSecretAlias     string     `json:"caCertSecretAlias,omitempty"`
	PassphraseSecretAlias string     `json:"passphraseSecretAlias,omitempty"`
	InsecureSkipVerify    bool       `json:"insecureSkipVerify"`
	IsActive              bool       `json:"isActive"`
	LastTestedAt          *time.Time `json:"lastTestedAt,omitempty"`
	CreatedAt             time.Time  `json:"createdAt"`
	UpdatedAt             time.Time  `json:"updatedAt"`
}

type NotificationTestOverrides struct {
	SMTPHost        string   `json:"smtpHost,omitempty"`
	SMTPPort        string   `json:"smtpPort,omitempty"`
	SMTPFrom        string   `json:"smtpFrom,omitempty"`
	SMTPTo          string   `json:"smtpTo,omitempty"`
	SMTPUser        string   `json:"smtpUser,omitempty"`
	SMTPPassword    string   `json:"smtpPassword,omitempty"`
	SlackWebhookURL string   `json:"slackWebhookUrl,omitempty"`
	Channels        []string `json:"channels,omitempty"`
}

type MaintenanceWindow struct {
	ID        string    `json:"id"`
	ScopeType string    `json:"scopeType"`
	ScopeID   string    `json:"scopeId,omitempty"`
	StartsAt  time.Time `json:"startsAt"`
	EndsAt    time.Time `json:"endsAt"`
	Reason    string    `json:"reason,omitempty"`
	CreatedBy string    `json:"createdBy,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

type StepRun struct {
	ID              string            `json:"id"`
	StepID          string            `json:"stepId"`
	StepName        string            `json:"stepName"`
	Type            string            `json:"type"`
	Status          MonitorStatus     `json:"status"`
	LatencyMS       int               `json:"latencyMs"`
	Timing          HTTPTiming        `json:"timing,omitempty"`
	RequestSummary  string            `json:"requestSummary"`
	RequestBody     string            `json:"requestBody,omitempty"`
	RequestHeaders  map[string]string `json:"requestHeaders,omitempty"`
	ResponseSummary string            `json:"responseSummary"`
	StatusCode      int               `json:"statusCode,omitempty"`
	ResponseBody    string            `json:"responseBody,omitempty"`
	ResponseHeaders map[string]string `json:"responseHeaders,omitempty"`
	Assertions      []Assertion       `json:"assertions"`
	Extractors      []Extractor       `json:"extractors"`
	ExtractedVars   map[string]string `json:"extractedVars,omitempty"`
	ErrorMessage    string            `json:"errorMessage,omitempty"`
	ConsoleOutput   []string          `json:"consoleOutput,omitempty"`
}

type HTTPTiming struct {
	DNSLookupMS       int `json:"dnsLookupMs,omitempty"`
	TCPConnectMS      int `json:"tcpConnectMs,omitempty"`
	TLSHandshakeMS    int `json:"tlsHandshakeMs,omitempty"`
	TimeToFirstByteMS int `json:"timeToFirstByteMs,omitempty"`
	DownloadMS        int `json:"downloadMs,omitempty"`
	TotalMS           int `json:"totalMs,omitempty"`
}

type SecretReference struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Alias        string    `json:"alias"`
	Provider     string    `json:"provider"`
	Description  string    `json:"description"`
	SecretPath   string    `json:"secretPath,omitempty"`
	SecretKey    string    `json:"secretKey,omitempty"`
	MaskedValue  string    `json:"value"`
	IsActive     bool      `json:"isActive"`
	LastTestedAt time.Time `json:"lastTestedAt"`
	RawValue     string    `json:"-"`
}
