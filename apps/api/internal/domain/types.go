package domain

import "time"

type MonitorStatus string

const (
	StatusSuccess MonitorStatus = "SUCCESS"
	StatusFailed  MonitorStatus = "FAILED"
	StatusTimeout MonitorStatus = "TIMEOUT"
	StatusError   MonitorStatus = "ERROR"
	StatusSkipped MonitorStatus = "SKIPPED"
)

type FailureCategory string

const (
	FailureAssertion FailureCategory = "ASSERTION_FAILURE"
	FailureUnknown   FailureCategory = "UNKNOWN_ERROR"
)

type Monitor struct {
	ID                  string            `json:"id"`
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

type StepRun struct {
	ID              string        `json:"id"`
	StepID          string        `json:"stepId"`
	StepName        string        `json:"stepName"`
	Type            string        `json:"type"`
	Status          MonitorStatus `json:"status"`
	LatencyMS       int           `json:"latencyMs"`
	RequestSummary  string        `json:"requestSummary"`
	ResponseSummary string        `json:"responseSummary"`
	Assertions      []Assertion   `json:"assertions"`
	Extractors      []Extractor   `json:"extractors"`
	ErrorMessage    string        `json:"errorMessage,omitempty"`
	ConsoleOutput   []string      `json:"consoleOutput,omitempty"`
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
