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
	FailureAssertion FailureCategory = "ASSERTION_FAILURE"
	FailureUnknown   FailureCategory = "UNKNOWN_ERROR"
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

type Application struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	CarID       string    `json:"carId"`
	Description string    `json:"description,omitempty"`
	Owner       string    `json:"owner,omitempty"`
	Environment string    `json:"environment,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type ApplicationRunSummary struct {
	ApplicationID string   `json:"applicationId"`
	Queued        int      `json:"queued"`
	Skipped       int      `json:"skipped"`
	MonitorIDs    []string `json:"monitorIds"`
}

type AlertPolicy struct {
	Enabled         bool `json:"enabled"`
	Threshold       int  `json:"threshold"`
	ResponseTimeMS  int  `json:"responseTimeMs"`
	Email           bool `json:"email"`
	SlackWebhook    bool `json:"slackWebhook"`
	CooldownMinutes int  `json:"cooldownMinutes"`
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
	AlertStatusOpen       AlertStatus = "open"
	AlertStatusSuppressed AlertStatus = "suppressed"
	AlertStatusResolved   AlertStatus = "resolved"
)

type AlertDelivery struct {
	Channel string    `json:"channel"`
	Status  string    `json:"status"`
	Detail  string    `json:"detail,omitempty"`
	SentAt  time.Time `json:"sentAt,omitempty"`
}

type AlertEvent struct {
	ID               string          `json:"id"`
	MonitorID        string          `json:"monitorId"`
	RunID            string          `json:"runId,omitempty"`
	Status           AlertStatus     `json:"status"`
	Severity         string          `json:"severity"`
	Title            string          `json:"title"`
	Description      string          `json:"description"`
	FailureCategory  FailureCategory `json:"failureCategory,omitempty"`
	Channels         []string        `json:"channels"`
	Deliveries       []AlertDelivery `json:"deliveries"`
	FirstTriggeredAt time.Time       `json:"firstTriggeredAt"`
	LastTriggeredAt  time.Time       `json:"lastTriggeredAt"`
	LastDeliveredAt  *time.Time      `json:"lastDeliveredAt,omitempty"`
	ResolvedAt       *time.Time      `json:"resolvedAt,omitempty"`
	CreatedAt        time.Time       `json:"createdAt"`
	UpdatedAt        time.Time       `json:"updatedAt"`
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
