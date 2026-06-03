# PRD: Minimal Synthetic API Monitoring Platform

## 1. Product Name

**Pulse**

Working title:

```text
Pulse - Synthetic API Monitoring
```

---

## 2. Objective

Build a lightweight synthetic monitoring application that allows users to configure and run API checks periodically.

The platform should support both:

```text
1. Simple endpoint monitoring
2. Multi-step API monitoring with prerequisites
```

The first version should focus on the core monitoring engine, not enterprise onboarding or advanced platform features.

---

## 3. Problem Statement

Many APIs cannot be monitored by simply calling a health endpoint.

Some APIs require prerequisite steps such as:

```text
Generate JWT
Fetch access token
Build dynamic request body
Generate timestamp
Generate HMAC signature
Use secrets
Call one API before another
Extract value from one response and use it in another request
```

The application should allow users to configure these flows dynamically, similar to how Postman supports pre-request scripts and chained API calls.

---

## 4. Goals

The application should allow users to:

```text
Create API monitors
Configure one or more request steps
Add prerequisite actions before a request
Use variables
Use secrets safely
Schedule monitors
Run monitors manually
Validate responses using assertions
Extract values from responses
View run history
View step-level execution details
Receive basic alerts
```

---

## 5. Non-Goals

The first version will not include:

```text
Team onboarding
Application onboarding
Approval workflow
Advanced RBAC
ServiceNow integration
AI features
k6 integration
Postman import
OpenAPI import
Complex dashboards
Multiple regions
Advanced incident management
Certificate monitoring
DNS/TCP monitoring
Load testing
```

---

## 6. Recommended Tech Stack

### Frontend

```text
Next.js
React
Tailwind CSS
shadcn/ui
React Hook Form
Zod
TanStack Table
Recharts
```

### Backend

```text
Go
Fiber or Chi
PostgreSQL
Redis
Go scheduler
Go worker
```

### Database

```text
PostgreSQL
```

### Queue

```text
Redis
```

### Secrets

Preferred:

```text
Vault / internal secret manager
```

Fallback for local/MVP:

```text
Encrypted database storage
```

### Deployment

```text
Docker
Kubernetes later
```

---

## 7. High-Level Architecture

```text
+---------------------+
|      Next.js UI     |
+----------+----------+
           |
           v
+---------------------+
|       Go API        |
+----------+----------+
           |
           v
+---------------------+
|     PostgreSQL      |
| Monitor Config      |
| Run History         |
+----------+----------+
           |
           v
+---------------------+
|   Scheduler Service |
+----------+----------+
           |
           v
+---------------------+
|      Redis Queue    |
+----------+----------+
           |
           v
+---------------------+
|     Go Worker       |
| Executes Monitors   |
+----------+----------+
           |
           v
+---------------------+
| External APIs       |
| Secret Provider     |
+---------------------+
```

---

## 8. Core User Flow

```text
User creates a monitor
        ↓
User adds one or more steps
        ↓
User configures variables and secrets
        ↓
User adds assertions
        ↓
User saves the monitor
        ↓
User runs it manually or enables schedule
        ↓
Worker executes the monitor
        ↓
Result is stored
        ↓
User views run history and failures
```

---

## 9. Core Features

### 9.1 Monitor Creation

A user should be able to create a monitor.

Fields:

```text
Monitor Name
Description
Schedule
Timeout
Retry Count
Failure Threshold
Is Active
```

Example:

```json
{
  "name": "Token API Health Check",
  "description": "Validates token generation and protected API access",
  "schedule": "*/5 * * * *",
  "timeoutMs": 30000,
  "retryCount": 1,
  "failureThreshold": 3,
  "isActive": true
}
```

Acceptance criteria:

```text
User can create a monitor.
User can edit a monitor.
User can disable a monitor.
User can delete a monitor.
User can manually run a monitor.
Scheduled monitors run automatically.
Disabled monitors do not run.
```

---

### 9.2 Multi-Step API Workflow

A monitor should support multiple steps.

Example:

```text
Step 1: Generate JWT
Step 2: Call token API
Step 3: Extract access token
Step 4: Call protected API
Step 5: Validate response
```

Each step should execute in order.

If a step fails, the monitor should either:

```text
Stop execution
Continue execution, if continueOnFailure is enabled
```

Step fields:

```text
Step Name
Step Order
Step Type
Configuration
Assertions
Extractors
Timeout
Retry Count
Continue on Failure
```

---

## 10. Step Types

For MVP, support these step types:

```text
HTTP Request Step
Pre-request Action Step
Delay Step - optional
```

---

### 10.1 HTTP Request Step

The HTTP step is used to call an API.

Supported methods:

```text
GET
POST
PUT
PATCH
DELETE
HEAD
OPTIONS
```

Supported request configuration:

```text
URL
Method
Headers
Query Parameters
Path Parameters
Body
Authentication
Timeout
Retry
```

Supported body types:

```text
None
JSON
Raw Text
Form URL Encoded
XML
```

Example:

```json
{
  "name": "Call Health API",
  "type": "http",
  "method": "GET",
  "url": "{{variables.baseUrl}}/health",
  "headers": {
    "Authorization": "Bearer {{steps.Get Token.output.accessToken}}",
    "X-Correlation-ID": "{{random.uuid}}"
  },
  "assertions": [
    {
      "type": "statusCode",
      "operator": "equals",
      "value": 200
    }
  ]
}
```

---

### 10.2 Pre-request Action Step

This is the equivalent of Postman pre-request logic, but safer.

Instead of allowing arbitrary JavaScript in the first version, provide controlled actions.

Supported pre-request actions:

```text
Set variable
Generate UUID
Generate timestamp
Base64 encode
Base64 decode
URL encode
URL decode
SHA256 hash
HMAC-SHA256 signature
Generate JWT
Set header value
Set body value
Read previous step output
```

Example:

```json
{
  "name": "Generate JWT",
  "type": "preRequest",
  "actions": [
    {
      "type": "generateJWT",
      "algorithm": "RS256",
      "claims": {
        "iss": "{{secrets.clientId}}",
        "sub": "{{secrets.clientId}}",
        "aud": "{{variables.audience}}",
        "iat": "{{timestamp.epochSeconds}}",
        "exp": "{{timestamp.epochSecondsPlus300}}"
      },
      "privateKey": "{{secrets.privateKey}}",
      "output": "jwt"
    }
  ]
}
```

Acceptance criteria:

```text
User can configure prerequisite logic without writing backend code.
Generated values can be used in later steps.
Secrets can be used in pre-request actions.
Pre-request output should be available to later steps.
Raw secrets should never appear in logs or UI.
```

---

## 11. Variables

The system should support variables so users can avoid hardcoding values.

Variable examples:

```text
baseUrl
tokenUrl
audience
clientId
scope
environment
```

Variable usage:

```text
{{variables.baseUrl}}
{{variables.tokenUrl}}
{{variables.audience}}
```

Example:

```json
{
  "variables": {
    "baseUrl": "https://api.example.com",
    "tokenUrl": "https://auth.example.com/token",
    "audience": "my-api"
  }
}
```

Supported variable scopes for MVP:

```text
Monitor-level variables
Run-time variables
Step output variables
Secret aliases
Generated variables
```

Template examples:

```text
{{variables.baseUrl}}
{{secrets.clientSecret}}
{{steps.Get Token.output.accessToken}}
{{random.uuid}}
{{timestamp.iso}}
{{timestamp.epochSeconds}}
```

Acceptance criteria:

```text
Variables should resolve at runtime.
Missing variables should fail clearly.
Variable values should be visible in run details unless marked sensitive.
Secret values should always be masked.
```

---

## 12. Secret Management

### 12.1 Requirement

The application should support secrets securely.

Secrets may include:

```text
Client ID
Client Secret
API Key
Private Key
Bearer Token
Basic Auth Password
JWT Signing Secret
HMAC Secret
```

---

### 12.2 Secret Management Principle

The application should follow this rule:

```text
Do not expose raw secrets in UI, logs, run history, or alerts.
```

Preferred production approach:

```text
Store only secret references.
Fetch actual secrets from Vault or an internal secret manager at runtime.
```

For local MVP, encrypted database storage can be used temporarily.

---

### 12.3 Secret Reference Model

Instead of storing this directly in monitor config:

```json
{
  "clientSecret": "actual-secret-value"
}
```

Store this:

```json
{
  "alias": "clientSecret",
  "provider": "vault",
  "path": "secret/data/pulse/demo",
  "key": "client_secret"
}
```

Monitor usage:

```text
{{secrets.clientSecret}}
```

---

### 12.4 Secret Providers

MVP should support at least one of the following.

#### Option 1: Vault / Internal Secret Manager

Recommended for production.

Fields:

```text
Secret Name
Alias
Provider
Path
Key
Description
```

Example:

```json
{
  "name": "Demo Client Secret",
  "alias": "clientSecret",
  "provider": "vault",
  "path": "secret/data/pulse/demo",
  "key": "client_secret"
}
```

---

#### Option 2: Encrypted Database Storage

Useful only for local MVP or early prototype.

Rules:

```text
Encrypt secret before storing.
Decrypt only during monitor execution.
Never return decrypted value to UI.
Mask value everywhere.
```

---

### 12.5 Secret Masking

The application should mask sensitive values in:

```text
Request headers
Request body
Query parameters
Response body
Extracted variables
Assertion results
Run logs
Worker logs
Alert messages
```

Sensitive keys to auto-mask:

```text
password
secret
client_secret
api_key
apikey
token
access_token
refresh_token
authorization
private_key
jwt
signature
assertion
```

Example masked output:

```text
Authorization: Bearer ********
client_secret: ********
private_key: ********
```

---

### 12.6 Secret Acceptance Criteria

```text
User can create a secret reference.
User can use secret aliases in monitor steps.
Worker can fetch secret at runtime.
Raw secret is never displayed.
Secret is masked in request and response history.
Secret access failures should fail the monitor clearly.
```

---

## 13. Extractors

Extractors allow values from one response to be used in later steps.

Supported extractors:

```text
JSONPath
Header
Cookie
Regex
Status Code
Response Time
```

Example response:

```json
{
  "access_token": "abc123",
  "expires_in": 300
}
```

Extractor config:

```json
{
  "name": "accessToken",
  "type": "jsonPath",
  "path": "$.access_token",
  "sensitive": true
}
```

Usage in later step:

```text
{{steps.Get Token.output.accessToken}}
```

Acceptance criteria:

```text
Extracted values should be available to later steps.
Extractor failure should fail the step unless marked optional.
Sensitive extracted values should be masked.
```

---

## 14. Assertions

Assertions determine whether a step passed or failed.

Supported assertion types for MVP:

```text
Status code
Response time
JSONPath value
Header value
Body contains
Body does not contain
Regex match
```

---

### 14.1 Status Code Assertion

```json
{
  "type": "statusCode",
  "operator": "equals",
  "value": 200
}
```

Supported operators:

```text
equals
notEquals
in
notIn
is2xx
is3xx
is4xx
is5xx
```

---

### 14.2 Response Time Assertion

```json
{
  "type": "responseTime",
  "operator": "lessThan",
  "value": 2000
}
```

---

### 14.3 JSONPath Assertion

```json
{
  "type": "jsonPath",
  "path": "$.status",
  "operator": "equals",
  "value": "SUCCESS"
}
```

Supported operators:

```text
equals
notEquals
contains
notContains
exists
notExists
greaterThan
lessThan
matchesRegex
```

---

### 14.4 Header Assertion

```json
{
  "type": "header",
  "headerName": "content-type",
  "operator": "contains",
  "value": "application/json"
}
```

Acceptance criteria:

```text
If a required assertion fails, the step should fail.
Assertion result should show expected and actual values.
Sensitive values should be masked.
Assertion results should be visible in run details.
```

---

## 15. Scheduler

The application should support scheduled monitor execution.

Supported schedule options:

```text
Manual only
Every 1 minute
Every 5 minutes
Every 10 minutes
Every 15 minutes
Every 30 minutes
Every 1 hour
Custom cron
```

MVP implementation:

```text
Go scheduler checks active monitors.
If monitor is due, scheduler creates a job.
Job is pushed to Redis queue.
Worker picks the job and executes the monitor.
```

Acceptance criteria:

```text
Scheduled monitor should run on time.
Disabled monitor should not run.
Manual run should work anytime.
Duplicate jobs should be avoided.
Scheduler failures should not corrupt monitor config.
```

---

## 16. Execution Engine

The worker should execute monitor steps in order.

Execution flow:

```text
Load monitor config
Resolve variables
Fetch secrets
Prepare runtime context
Execute step 1
Run extractors
Run assertions
Store step result
Execute next step
Calculate final monitor status
Store monitor run result
Trigger alert evaluation
```

Monitor status values:

```text
SUCCESS
FAILED
TIMEOUT
ERROR
SKIPPED
```

Step status values:

```text
SUCCESS
FAILED
TIMEOUT
ERROR
SKIPPED
```

Failure categories:

```text
DNS_FAILURE
CONNECTION_FAILURE
TLS_FAILURE
TIMEOUT
HTTP_ERROR
ASSERTION_FAILURE
AUTH_FAILURE
SECRET_FETCH_FAILURE
VARIABLE_RESOLUTION_FAILURE
PRE_REQUEST_FAILURE
UNKNOWN_ERROR
```

Acceptance criteria:

```text
Worker should execute all steps in order.
Worker should stop when a required step fails.
Worker should respect timeout.
Worker should respect retry count.
Worker should store step-level results.
Worker should mask secrets before storing results.
```

---

## 17. Alerts

MVP should support basic alerts.

Alert trigger options:

```text
Alert after N consecutive failures
Alert when monitor fails
Alert when response time exceeds threshold
```

Alert channels for MVP:

```text
Email
Slack webhook
```

Alert message should include:

```text
Monitor name
Status
Failed step
Failure reason
Failure category
Time of failure
Link to run details
```

Acceptance criteria:

```text
Alert should trigger only after configured threshold.
Alert should not expose secrets.
Alert should not repeatedly spam for the same ongoing failure.
Alert should auto-resolve when monitor succeeds again.
```

---

## 18. Run History

The user should be able to view monitor execution history.

Monitor run summary should show:

```text
Run ID
Monitor Name
Status
Started At
Ended At
Duration
Failure Reason
Triggered By
```

Step run details should show:

```text
Step Name
Step Type
Status
Request Summary
Response Summary
Assertions
Extractors
Latency
Error Message
```

Important:

```text
Request and response data should be masked before storing.
Large response bodies should be truncated.
Sensitive extracted values should be masked.
```

---

## 19. UI Pages

For the minimum version, create these pages:

```text
/dashboard
/monitors
/monitors/create
/monitors/[monitorId]
/monitors/[monitorId]/edit
/monitors/[monitorId]/runs
/runs/[runId]
/secrets
/settings
```

---

### 19.1 Dashboard Page

Show:

```text
Total monitors
Active monitors
Failing monitors
Last 24h success rate
Recent failures
Recent runs
Average response time
```

---

### 19.2 Monitors Page

Show table with:

```text
Monitor Name
Status
Schedule
Last Run
Last Duration
Active/Inactive
Actions
```

Actions:

```text
View
Edit
Run Now
Disable
Delete
```

---

### 19.3 Create Monitor Page

Sections:

```text
Basic Details
Variables
Secrets
Steps
Assertions
Schedule
Alert Settings
Review
```

---

### 19.4 Run Detail Page

Show:

```text
Final result
Timeline
Step-by-step execution
Request summary
Response summary
Assertion results
Extractor results
Failure reason
```

---

## 20. Minimal Database Schema

### 20.1 monitors

```sql
CREATE TABLE monitors (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    schedule_cron VARCHAR(100),
    timezone VARCHAR(100),
    timeout_ms INTEGER DEFAULT 30000,
    retry_count INTEGER DEFAULT 0,
    failure_threshold INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT TRUE,
    alert_enabled BOOLEAN DEFAULT FALSE,
    variables_json JSONB,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### 20.2 monitor_steps

```sql
CREATE TABLE monitor_steps (
    id UUID PRIMARY KEY,
    monitor_id UUID REFERENCES monitors(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    step_type VARCHAR(100) NOT NULL,
    config_json JSONB NOT NULL,
    pre_request_json JSONB,
    assertions_json JSONB,
    extractors_json JSONB,
    timeout_ms INTEGER,
    retry_count INTEGER DEFAULT 0,
    continue_on_failure BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### 20.3 secret_references

```sql
CREATE TABLE secret_references (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    alias VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    provider VARCHAR(50) NOT NULL,
    secret_path TEXT,
    secret_key VARCHAR(255),
    encrypted_value TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

Notes:

```text
secret_path and secret_key are used for Vault/internal secret manager.
encrypted_value is used only if encrypted DB storage is enabled.
Only one method should be active per secret.
```

---

### 20.4 monitor_secret_bindings

```sql
CREATE TABLE monitor_secret_bindings (
    id UUID PRIMARY KEY,
    monitor_id UUID REFERENCES monitors(id) ON DELETE CASCADE,
    secret_reference_id UUID REFERENCES secret_references(id),
    alias VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 20.5 monitor_runs

```sql
CREATE TABLE monitor_runs (
    id UUID PRIMARY KEY,
    monitor_id UUID REFERENCES monitors(id) ON DELETE CASCADE,
    status VARCHAR(50),
    failure_category VARCHAR(100),
    failure_reason TEXT,
    triggered_by VARCHAR(100),
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 20.6 monitor_step_runs

```sql
CREATE TABLE monitor_step_runs (
    id UUID PRIMARY KEY,
    monitor_run_id UUID REFERENCES monitor_runs(id) ON DELETE CASCADE,
    step_id UUID REFERENCES monitor_steps(id),
    step_order INTEGER,
    step_name VARCHAR(255),
    status VARCHAR(50),
    request_summary_json JSONB,
    response_summary_json JSONB,
    assertion_results_json JSONB,
    extractor_results_json JSONB,
    latency_ms INTEGER,
    error_message TEXT,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 20.7 alerts

```sql
CREATE TABLE alerts (
    id UUID PRIMARY KEY,
    monitor_id UUID REFERENCES monitors(id) ON DELETE CASCADE,
    status VARCHAR(50),
    severity VARCHAR(50),
    title VARCHAR(255),
    description TEXT,
    failure_category VARCHAR(100),
    first_triggered_at TIMESTAMP,
    last_triggered_at TIMESTAMP,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 21. Backend API Requirements

### Monitor APIs

```text
GET    /api/monitors
POST   /api/monitors
GET    /api/monitors/{monitorId}
PUT    /api/monitors/{monitorId}
DELETE /api/monitors/{monitorId}
POST   /api/monitors/{monitorId}/run
POST   /api/monitors/{monitorId}/enable
POST   /api/monitors/{monitorId}/disable
```

---

### Step APIs

```text
GET    /api/monitors/{monitorId}/steps
POST   /api/monitors/{monitorId}/steps
PUT    /api/steps/{stepId}
DELETE /api/steps/{stepId}
```

---

### Run APIs

```text
GET /api/monitors/{monitorId}/runs
GET /api/runs/{runId}
GET /api/runs/{runId}/steps
```

---

### Secret APIs

```text
GET    /api/secrets
POST   /api/secrets
GET    /api/secrets/{secretId}
PUT    /api/secrets/{secretId}
DELETE /api/secrets/{secretId}
POST   /api/secrets/{secretId}/test
```

Important:

```text
The test API should only confirm whether the secret can be accessed.
It should never return the raw secret value.
```

---

### Alert APIs

```text
GET  /api/alerts
GET  /api/alerts/{alertId}
POST /api/alerts/{alertId}/resolve
```

---

## 22. Backend Package Structure

Recommended Go structure:

```text
cmd/
  api/
  scheduler/
  worker/

internal/
  monitors/
  steps/
  runs/
  scheduler/
  worker/
  executor/
  prerequest/
  variables/
  secrets/
  assertions/
  extractors/
  alerts/
  masking/
  httpclient/
  storage/
  config/
```

---

## 23. Core Go Interfaces

### Executor Interface

```go
type StepExecutor interface {
    Execute(ctx context.Context, runCtx *RunContext, step MonitorStep) (*StepResult, error)
}
```

Implementations:

```text
HTTPExecutor
PreRequestExecutor
DelayExecutor
```

---

### Secret Provider Interface

```go
type SecretProvider interface {
    GetSecret(ctx context.Context, ref SecretReference) (string, error)
}
```

Implementations:

```text
VaultSecretProvider
EncryptedDBSecretProvider
MockSecretProvider
```

---

### Assertion Interface

```go
type Assertion interface {
    Evaluate(ctx context.Context, response StepResponse) (*AssertionResult, error)
}
```

Implementations:

```text
StatusCodeAssertion
ResponseTimeAssertion
JSONPathAssertion
HeaderAssertion
BodyContainsAssertion
RegexAssertion
```

---

### Extractor Interface

```go
type Extractor interface {
    Extract(ctx context.Context, response StepResponse) (*ExtractorResult, error)
}
```

Implementations:

```text
JSONPathExtractor
HeaderExtractor
CookieExtractor
RegexExtractor
```

---

## 24. MVP Example Monitor

```json
{
  "name": "Protected API Synthetic Check",
  "description": "Generates JWT, fetches access token, and calls protected API",
  "schedule": "*/5 * * * *",
  "timeoutMs": 30000,
  "retryCount": 1,
  "failureThreshold": 3,
  "variables": {
    "tokenUrl": "https://auth.example.com/oauth/token",
    "baseUrl": "https://api.example.com",
    "audience": "protected-api"
  },
  "secrets": [
    {
      "alias": "clientId",
      "secretReferenceId": "secret-client-id"
    },
    {
      "alias": "privateKey",
      "secretReferenceId": "secret-private-key"
    }
  ],
  "steps": [
    {
      "name": "Generate JWT",
      "type": "preRequest",
      "actions": [
        {
          "type": "generateJWT",
          "algorithm": "RS256",
          "claims": {
            "iss": "{{secrets.clientId}}",
            "sub": "{{secrets.clientId}}",
            "aud": "{{variables.audience}}",
            "iat": "{{timestamp.epochSeconds}}",
            "exp": "{{timestamp.epochSecondsPlus300}}"
          },
          "privateKey": "{{secrets.privateKey}}",
          "output": "jwt"
        }
      ]
    },
    {
      "name": "Get Token",
      "type": "http",
      "method": "POST",
      "url": "{{variables.tokenUrl}}",
      "headers": {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      "bodyType": "formUrlEncoded",
      "body": {
        "grant_type": "client_credentials",
        "client_assertion": "{{steps.Generate JWT.output.jwt}}"
      },
      "extractors": [
        {
          "name": "accessToken",
          "type": "jsonPath",
          "path": "$.access_token",
          "sensitive": true
        }
      ],
      "assertions": [
        {
          "type": "statusCode",
          "operator": "equals",
          "value": 200
        },
        {
          "type": "jsonPath",
          "path": "$.access_token",
          "operator": "exists"
        }
      ]
    },
    {
      "name": "Call Protected API",
      "type": "http",
      "method": "GET",
      "url": "{{variables.baseUrl}}/health",
      "headers": {
        "Authorization": "Bearer {{steps.Get Token.output.accessToken}}",
        "X-Correlation-ID": "{{random.uuid}}"
      },
      "assertions": [
        {
          "type": "statusCode",
          "operator": "equals",
          "value": 200
        },
        {
          "type": "responseTime",
          "operator": "lessThan",
          "value": 2000
        }
      ]
    }
  ]
}
```

---

## 25. MVP Delivery Phases

### Phase 1: Basic Monitor CRUD

Build:

```text
Monitor create/edit/delete
Step create/edit/delete
Variables
Basic UI
PostgreSQL schema
```

Outcome:

```text
User can define monitors and steps.
```

---

### Phase 2: Manual Execution

Build:

```text
HTTP executor
Manual run
Run history
Step run details
Status code assertion
Response time assertion
```

Outcome:

```text
User can manually run API checks and view results.
```

---

### Phase 3: Multi-Step Workflow

Build:

```text
Template engine
Step output extraction
JSONPath extractor
Header extractor
JSONPath assertions
Use previous step output in next request
```

Outcome:

```text
User can create chained API workflows.
```

---

### Phase 4: Pre-request Actions

Build:

```text
Generate UUID
Generate timestamp
Base64 encode/decode
SHA256
HMAC-SHA256
Generate JWT
Set variable
```

Outcome:

```text
User can handle prerequisite logic similar to Postman.
```

---

### Phase 5: Secrets

Build:

```text
Secret reference CRUD
Vault/internal secret provider support
Encrypted DB fallback
Runtime secret injection
Secret masking
Secret test API
```

Outcome:

```text
User can securely use secrets in monitor flows.
```

---

### Phase 6: Scheduling and Alerts

Build:

```text
Go scheduler
Redis queue
Go worker
Failure threshold
Email alert
Slack webhook alert
Alert auto-resolve
```

Outcome:

```text
Monitors run automatically and notify on failures.
```

---

## 26. MVP Success Criteria

The MVP is successful if:

```text
User can create a simple HTTP monitor.
User can create a multi-step monitor.
User can generate JWT before an API call.
User can extract token from one API response.
User can use that token in another API call.
User can use secrets without exposing them.
User can schedule the monitor.
User can view run history.
User can see why a monitor failed.
User can receive an alert after repeated failures.
```

---

## 27. Final MVP Scope

For the bare-minimum version, build only this:

```text
Monitor management
Step builder
HTTP execution
Pre-request action builder
Variables
Secret references
Extractors
Assertions
Manual run
Scheduled run
Run history
Basic alerts
```

Do **not** include team onboarding or application onboarding yet.

The core design should still be flexible enough so that later you can add:

```text
Teams
Applications
RBAC
AI
ServiceNow
Postman import
k6
Grafana integration
```

without rewriting the monitoring engine.
