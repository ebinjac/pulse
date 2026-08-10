# PRD: Rythm (Pulse) Console Rewrite with shadcn/ui

**Status:** Ready for implementation agent  
**Product name (UI):** Rythm  
**Codebase / platform name:** Pulse (ensemble-pulse)  
**Scope:** Frontend UI rewrite — HeroUI React v3 → shadcn/ui (**Base UI** + Tailwind; **not** Radix)  
**Backend:** Preserve existing Go API contracts; no intentional API redesign  
**Audience:** Implementation AI / engineering agent rebuilding or migrating the web console

---

## Problem Statement

The Rythm console (Pulse web app) is a synthetic API monitoring and deployment-validation product. Operators use it to define multi-step monitors, schedule checks, triage alerts, manage secrets/certificates, run deployment validation gates, and author ELF log queries.

Today the web UI is built primarily on **HeroUI React v3** (`@heroui/react` / `@heroui/styles`), with Tailwind and a thin shared `@workspace/ui` package. That creates friction:

1. **Component ownership** — Product UI is tightly coupled to HeroUI compound APIs (`Tabs.List`, `TextField` + `Label` + `Input`, `ToastQueue`, etc.). Customizing look-and-feel, accessibility patterns, and design tokens is harder than with owned, copy-in components.
2. **Ecosystem alignment** — The team wants the console rebuilt on **shadcn/ui with Base UI** (not Radix): copy-owned primitives under a shared UI package, Base UI accessibility primitives (`@base-ui/react`), Tailwind v4 tokens, and the standard shadcn composition model (`Button`, `Dialog`, `Sheet`, `Table`, `Form`, `Sidebar`, etc.).
3. **Rewrite clarity** — A greenfield or migration agent needs a single product spec: what Rythm *does*, which screens exist, which domain concepts must be preserved, and what “done” means for feature parity — not just “swap Button imports.”

Without this PRD, a rewrite risks dropping critical workflows (draft/publish, deployment validation phases, ELF workbench, masked secrets, import/export) or changing API contracts that the Go worker and scheduler already depend on.

---

## Solution

Rebuild the **Rythm web console** as a Next.js application whose visual and interaction layer is implemented exclusively with **shadcn/ui** components (and thin product wrappers), while preserving:

- Domain language from the Pulse glossary (Application, Monitor, Draft, Publish, MonitorRun, AlertEvent, DeploymentValidation, ElfQuery, SecretReference, CertificateProfile, etc.)
- Existing Go API behavior and Next.js BFF proxy routes (`PULSE_API_BASE_URL`)
- Operational workflows documented for end users (dashboard → monitors → builder → test → publish; deployments; alerts; secrets; ELF; settings)
- Light/dark theme (including keyboard toggle **D** when not typing in a field)
- Accessibility and keyboard use appropriate for a dense operations console

**Success looks like:** An SRE or API owner can complete every documented console workflow with no functional regression, using a UI that is visually coherent under shadcn + **Base UI** patterns (sidebar shell, data tables, forms, dialogs/sheets, toasts, charts), with HeroUI fully removed and **no Radix** packages in the web app dependency tree.

---

## Product overview (for agents)

### What Rythm is

Rythm is a **synthetic monitoring platform** for API and multi-step workflow checks, plus **deployment validation** (pre/post sampling and optional ELF OpenSearch log gates).

Users define **monitors** as ordered **steps** (HTTP and related types) with **assertions**, **extractors**, **variables**, **secret references**, schedules, and **alert policy**. They group monitors under **applications**, review **runs**, triage **alerts**, and optionally gate releases with **deployment validations**.

### Architecture (do not break)

| Layer | Role |
|-------|------|
| `apps/web` | Next.js UI + API route handlers that proxy to Go |
| `apps/api` | Go API, PostgreSQL, encrypted secrets, Redis queue, scheduler + worker |
| Domain types | Backend: Go domain types; Frontend mirror: shared TS types |

**Constraint:** Prefer UI-only changes. If a UI rewrite needs a backend change, treat it as out of scope unless required for parity bugs already present.

### Primary console navigation

| Route / area | Purpose |
|--------------|---------|
| Dashboard | Monitor health snapshot, recent failures, application signals |
| Applications | Create/manage logical groupings (CAR ID, schedules, members, elfAppId) |
| Deployments | Create/track deployment validation workflows |
| Monitors | Inventory; open builder to create/edit |
| Alerts | Open/historical alert events |
| Secrets | Encrypted aliases referenced by monitors |
| ELF Queries | Reusable OpenSearch query library + workbench |
| Settings | Notifications, certificates, maintenance windows, retention, ELF proxy |
| Documentation | In-app docs (`/docs`, Fumadocs) — keep available; style may remain Fumadocs |

### Console views (feature map)

- `dashboard`
- `applications` / `application-detail`
- `deployments` / deployment-check create & edit wizard / `deployment-validation` detail
- `monitors` / `builder` / `runs` / `run-detail`
- `alerts` / `alert-detail`
- `secrets`
- `elf-queries` / `elf-query-detail` (workbench)
- `settings`

---

## User Stories

### Shell, navigation, and theme

1. As an operator, I want a persistent left sidebar with Dashboard, Applications, Deployments, Monitors, Alerts, Secrets, ELF Queries, Settings, and Documentation, so that I can jump between operational areas quickly.
2. As an operator on a laptop, I want a responsive shell with a mobile drawer/sheet for navigation, so that I can use the console on smaller screens.
3. As an operator, I want clear active-route highlighting in the sidebar, so that I know where I am.
4. As an operator, I want to toggle light and dark mode (including pressing **D** when not focused in an input), so that I can match my environment preference.
5. As an operator, I want branded product identity (Rythm) in the shell header/sidebar, so that the console is recognizable as the monitoring product.
6. As an operator, I want page shells with consistent titles, descriptions, and primary actions, so that every view feels like one product.
7. As an operator, I want toast notifications for save/test/publish success and failure, so that I get non-blocking feedback.
8. As an operator, I want empty states when lists have no data, so that I know what to do next (create first monitor, etc.).
9. As an operator, I want loading and error states for API-backed views, so that I understand when data is fetching or the API is unavailable (`PULSE_API_REQUIRED` / 503).

### Dashboard

10. As an operator, I want a dashboard snapshot of monitor health and recent failures, so that I can spot regressions without opening each monitor.
11. As an operator, I want application-level status signals on the dashboard, so that I can prioritize by product/CAR.
12. As an operator, I want recent alert activity surfaced on the dashboard, so that open incidents are visible immediately.
13. As an operator, I want charts for run success/failure and latency trends where available, so that I can see patterns over time.
14. As an operator, I want to navigate from a dashboard card/row to the relevant monitor, run, alert, or application, so that triage is one click away.
15. As an operator, I want scheduler/system status indicators when available, so that I know if scheduled execution is healthy.

### Applications

16. As an application owner, I want to create an Application with a name and CAR ID, so that monitors are grouped under the correct product.
17. As an application owner, I want to edit application metadata (including schedule defaults and elfAppId), so that members inherit sensible defaults.
18. As an application owner, I want to list all applications, so that I can browse ownership boundaries.
19. As an application owner, I want an application detail view showing member monitors and key settings, so that I can manage one product in context.
20. As an application owner, I want to open or create monitors from an application, so that new checks are correctly associated.
21. As an application owner, I want to delete or archive an application only when safe (or with clear confirmation), so that I do not destroy groupings accidentally.

### Monitors inventory

22. As an SRE, I want a searchable/filterable monitors table, so that I can find checks by name, application, status, or schedule.
23. As an SRE, I want status chips for last-run outcome (success, failed, timeout, error, skipped), so that inventory health is scannable.
24. As an SRE, I want to create a new monitor from the inventory, so that I can start the builder quickly.
25. As an SRE, I want to open an existing monitor in the builder, so that I can edit draft or published configuration.
26. As an SRE, I want to trigger a manual run from the inventory or monitor context, so that I can verify production config on demand.
27. As an SRE, I want to import monitors from Postman Collection v2.1, OpenAPI 3 / Swagger 2, or Rythm JSON/YAML, so that I can bootstrap from existing API assets.
28. As an SRE, I want to export monitors as Rythm bundles, so that I can share configs across environments without exporting secret values.
29. As an SRE, I want bulk or row actions (where supported) for common operations, so that inventory management stays efficient.
30. As an SRE, I want filters for application, health, and schedule mode, so that large fleets remain manageable.

### Monitor builder (core)

31. As a monitor author, I want to set monitor name, owning application, and schedule (manual, every-N-minutes, hourly, custom cron), so that the check runs when needed.
32. As a monitor author, I want to add ordered steps of types including `http`, `preRequest`, `delay`, `dns`, `tcp`, and `tls`, so that I can model real workflows.
33. As a monitor author, I want HTTP step fields for method, URL, headers, body, auth, cookies, proxy, and mTLS, so that I can call secured APIs correctly.
34. As a monitor author, I want request auth types (none, API key, bearer, basic, JWT bearer), so that I can match common API auth patterns.
35. As a monitor author, I want to reference secret aliases in sensitive fields, so that credentials are not stored in cleartext in the monitor config.
36. As a monitor author, I want assertions (status code, response time, JSON path, header, body contains, regex, cert expiry, DNS records), so that pass/fail criteria are explicit.
37. As a monitor author, I want extractors (JSON path, header, cookie, regex, status code, response time), so that later steps can reuse values as `{{variables}}`.
38. As a monitor author, I want pre-request actions (set variable, UUID, timestamp, encode/decode, hashing, JWT, set header/body, read step output), so that I can prepare requests dynamically.
39. As a monitor author, I want to reorder, duplicate, and delete steps, so that I can iterate on multi-step flows.
40. As a monitor author, I want alert policy configuration (e.g. consecutive failures), so that alerts are not noisy on flaky endpoints.
41. As a monitor author, I want a form view and a raw JSON/YAML config view that stay in sync on save, so that advanced users can edit the full document.
42. As a monitor author, I want Monaco (or equivalent) script/JSON editing with readable formatting, so that large configs remain editable.
43. As a monitor author, I want template/variable insertion UX for `{{var}}` fields, so that chaining steps is discoverable.
44. As a monitor author, I want certificate profile selection for mTLS steps, so that client certs are reusable across monitors.

### Draft, test, publish, versions

45. As a monitor author, I want to save a **draft** without changing the published monitor, so that I can iterate safely.
46. As a monitor author, I want to run a **draft/test run** that does not affect scheduled production execution, so that I can validate before go-live.
47. As a monitor author, I want to review per-step results, timings, assertion outcomes, and masked sensitive output after a test, so that I can debug failures.
48. As a monitor author, I want to **publish** a draft to make it the live configuration and bump version, so that the scheduler uses the new definition.
49. As a monitor author, I want a clear warning that publish replaces live config immediately, so that I do not publish accidentally.
50. As a monitor author, I want to discard a draft and revert to the last published configuration, so that abandoned experiments do not linger.
51. As a monitor author, I want version history with diff between versions, so that I can see what changed.
52. As a monitor author, I want to rollback to a prior version, so that a bad publish can be undone quickly.
53. As a monitor author, I want visual distinction between draft and published state in the builder, so that I always know what I am editing.

### Runs and history

54. As an SRE, I want a runs list for a monitor (and/or global recent runs), so that I can inspect execution history.
55. As an SRE, I want run detail with step runs, status, duration, failure reason, and failure category, so that I can diagnose root cause.
56. As an SRE, I want to know whether a run was triggered by manual, schedule, draft, or test, so that I can interpret results correctly.
57. As an SRE, I want sensitive fields masked/truncated in run output, so that secrets do not leak in the UI.
58. As an SRE, I want charts of run outcomes and latency over time, so that I can spot flakiness and regressions.
59. As an SRE, I want pattern/observability findings when the product surfaces them, so that repeated failure modes are easier to spot.
60. As an SRE, I want to deep-link from an alert to the triggering run, so that incident response is fast.

### Alerts

61. As an on-call engineer, I want a list of alert events filterable by state (open, acknowledged, resolved, suppressed), so that I can triage the queue.
62. As an on-call engineer, I want alert detail with monitor context and linked run, so that I can investigate quickly.
63. As an on-call engineer, I want to acknowledge an alert, so that the team knows the incident is owned.
64. As an on-call engineer, I want to resolve an alert, so that closed incidents leave the open queue but remain in history.
65. As an on-call engineer, I want suppress/snooze options when available, so that planned work does not page the team.
66. As an on-call engineer, I want optional AI-assisted failure summaries / message drafts when available, so that I can start messaging faster (always verify against run detail).
67. As an on-call engineer, I want alert feed widgets reusable on dashboard and detail pages, so that alert signal is consistent.

### Secrets

68. As a security-conscious operator, I want to create secret references with named aliases, so that monitors can reference encrypted values.
69. As a security-conscious operator, I want secret values never shown again after save (only replaceable), so that the console does not become a secret browser.
70. As a security-conscious operator, I want to test a secret before using it in production monitors, so that misconfiguration is caught early.
71. As a security-conscious operator, I want to edit metadata / rotate values for existing secrets, so that credentials can be rotated safely.
72. As a security-conscious operator, I want clear labeling of secret provider (e.g. encrypted-db, vault) when applicable, so that I know where material lives.
73. As a monitor author, I want to pick secret aliases from the builder without seeing raw values, so that composition stays secure.

### Certificate profiles & mTLS

74. As an SRE, I want to create certificate profiles (PEM or PFX) bound to host/port with secret aliases for material, so that mTLS steps reuse profiles.
75. As an SRE, I want to edit, test, and delete certificate profiles from Settings, so that cert lifecycle is managed in-console.
76. As an SRE, I want upload/paste flows for cert material that store via secret aliases, so that PEMs/PFXs are not left in plain monitor JSON.

### Deployment validation

77. As a release engineer, I want to create a deployment validation that links selected monitors, so that I can gate a release.
78. As a release engineer, I want a multi-step wizard (what / monitors / logs / review) for creating or editing a validation, so that setup is guided.
79. As a release engineer, I want to run **pre-deploy sampling**, so that I capture a before snapshot.
80. As a release engineer, I want to mark/record the deploy phase (actual deploy happens outside Rythm), so that the timeline reflects the release.
81. As a release engineer, I want to run **post-deploy sampling**, so that I can compare after the release.
82. As a release engineer, I want optional **ELF log checks** after post-deploy sampling, so that log-based errors are caught even if synthetics pass.
83. As a release engineer, I want baseline window comparison against historical runs, so that latency/failure drift is visible.
84. As a release engineer, I want blocking vs advisory gate modes for monitors and ELF queries, so that teams can choose hard fail vs warn.
85. As a release engineer, I want a deployment detail view with overview, monitor samples, log checks, report, and timeline, so that stakeholders can review the gate.
86. As a release engineer, I want a deployments list of past/in-progress validations, so that I can resume or audit releases.
87. As a release engineer, I want clear status chips for validation phases and overall gate result, so that go/no-go is obvious.

### ELF queries and workbench

88. As an observability engineer, I want an ELF Queries library list, so that I can reuse OpenSearch checks across deployments.
89. As an observability engineer, I want to create/edit an ElfQuery with search body, gate mode (`blocking` | `advisory`), and pass criteria (`max_hits`, `min_hits`, `aggregation`), so that log gates are precise.
90. As an observability engineer, I want elfAppId inheritance from Application with per-query override, so that index targeting is correct.
91. As an observability engineer, I want an ELF query workbench to explore fields, build expressions, probe time ranges, and inspect responses, so that I can author queries interactively.
92. As an observability engineer, I want to test an ELF check and see pass/fail against criteria, so that I do not attach broken queries to a gate.
93. As an observability engineer, I want suggested checks / copilot-assisted panels when available, so that common log checks are faster to create.
94. As an observability engineer, I want metrics/visualization of probe results where available, so that hit volumes are understandable.
95. As a release engineer, I want to attach saved ELF queries to a deployment validation, so that post-deploy log gates run automatically when configured.

### Settings

96. As an admin, I want notification settings for Slack webhook and email/SMTP, so that alert events reach the team.
97. As an admin, I want to test notifications, so that delivery is verified before an incident.
98. As an admin, I want masked display of previously saved secrets in notification forms, so that credentials are not re-exposed.
99. As an admin, I want maintenance windows to schedule monitor blackouts, so that planned work does not create alert noise.
100. As an admin, I want retention settings for monitor runs and a purge action, so that storage can be managed.
101. As an admin, I want ELF proxy settings (base URL / defaults), so that log checks reach the correct proxy.
102. As an admin, I want Settings organized in tabs (Notifications, Certificates, Maintenance, System & Retention, ELF Proxy), so that configuration areas stay findable.

### Documentation

103. As a new user, I want in-app documentation for concepts and guides, so that I can learn workflows without leaving the product.
104. As a new user, I want docs search, so that I can find glossary terms and guides quickly.
105. As a writer/agent, I want docs to remain accurate to domain vocabulary even after the UI kit rewrite, so that training materials stay valid.

### Quality, a11y, and migration-specific

106. As an operator using a keyboard, I want focus rings, dialogs/sheets, and menus that are keyboard operable, so that dense forms remain accessible.
107. As an operator using a screen reader, I want labeled form controls and announced toasts/dialogs, so that critical actions are understandable.
108. As a developer, I want HeroUI fully removed from `apps/web` dependencies after migration, so that there is one UI system.
109. As a developer, I want shared shadcn primitives backed by **Base UI** (not Radix) in `@workspace/ui` (or equivalent), so that apps do not duplicate Button/Input implementations and do not depend on `@radix-ui/*`.
110. As a developer, I want design tokens (CSS variables) for light/dark that match a coherent Rythm theme, so that charts and status colors remain consistent.
111. As a developer, I want status colors for success/failed/timeout/error/skipped and alert states, so that semantics survive the redesign.
112. As a developer, I want no intentional change to Go API request/response shapes during the UI rewrite, so that workers and existing clients keep working.
113. As a QA engineer, I want feature parity with the documented user guides, so that the rewrite can be signed off without rediscovering product behavior.

---

## Implementation Decisions

### Product / UX decisions

1. **Parity-first rewrite** — Goal is feature-complete console parity under shadcn, not a product redesign. Layout may be cleaned up, but workflows and information architecture stay the same (sidebar areas above).
2. **Domain vocabulary is law** — Use glossary terms: Application, Monitor, Draft, Publish, Monitor version, MonitorRun, AlertEvent, DeploymentValidation, Pre/Post phase, Baseline window, ELF log check, ElfQuery, elfAppId, SecretReference, CertificateProfile, Scheduled/Manual/Draft/Test run.
3. **Brand** — UI product name is **Rythm**; codebase may still say Pulse. Prefer Rythm in user-visible strings; keep Pulse in API/env names (`PULSE_API_BASE_URL`) unless a separate rename PR exists.
4. **Docs app** — Keep Fumadocs documentation site. It does not need to be rebuilt in shadcn; only ensure shell links and theme do not break.
5. **Charts** — Continue using Recharts (or shadcn chart wrappers around Recharts). Preserve existing chart semantics (run outcomes, latency).
6. **Code editor** — Keep Monaco for JSON/YAML/script editing in builder and ELF bodies.
7. **Toasts** — Replace HeroUI `Toast` / `ToastQueue` with shadcn sonner (or equivalent shadcn toast pattern) behind a thin `notifyPulseToast` facade so call sites stay stable.
8. **Overlays** — Map HeroUI `Modal` → shadcn `Dialog`; `Drawer` → shadcn `Sheet`; `Dropdown` → shadcn `DropdownMenu`; `Disclosure` → shadcn `Collapsible` / `Accordion`.
9. **Forms** — Prefer shadcn `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Label`, `Form` patterns. Dense console forms may use controlled inputs without forcing React Hook Form everywhere; consistency matters more than one form library.
10. **Tables** — Prefer shadcn `Table` (and TanStack Table only if already needed for sorting/virtualization). Monitor inventory and alert lists must remain scannable with chips and row actions.
11. **Sidebar** — Prefer shadcn `Sidebar` pattern for desktop + mobile sheet behavior, matching current nav items and active states.
12. **Status presentation** — Use Badge/Chip equivalents with semantic variants; do not invent new status enums.
13. **Empty states** — Provide a simple EmptyState pattern (icon + title + description + CTA) as a product component built from shadcn primitives.
14. **Copilot/AI panels** — Preserve existing optional AI-assisted panels where present (builder/ELF/alerts); UI kit change only.

### Technical / architecture decisions

15. **Target stack**
    - Next.js (current major in repo) + React 19
    - Tailwind CSS v4
    - shadcn/ui on **Base UI** (`@base-ui/react` + `cn` + CSS variables) — **do not use Radix** (`@radix-ui/*`)
    - `lucide-react` icons
    - `next-themes` for theme
16. **Shared package** — Install/generate shadcn components into `@workspace/ui` (or `apps/web/components/ui` if monorepo tooling requires), exported for the web app. Prefer shared package so future apps reuse the same kit. Init with Base UI as the primitive library (default `npx shadcn@latest init`, or explicitly pin Base UI — never `-b radix`).
17. **Remove HeroUI** — Delete `@heroui/react` and `@heroui/styles` from `apps/web` once no imports remain. Remove HeroUI-specific AGENTS.md guidance after cutover (separate docs cleanup optional).
18. **Base UI only — no Radix** — Hard constraint for this rewrite:
    - Depend on `@base-ui/react` (via shadcn-generated components). Do **not** add `@radix-ui/react-*` packages.
    - Use Base UI composition APIs: prefer `render` prop over Radix `asChild`; follow Base UI Select/`items`, Accordion/`multiple`, ToggleGroup, and Positioner patterns from current shadcn Base UI docs.
    - When adding components via CLI, ensure registry/`components.json` is configured for **base** (not radix). Reject any PR that introduces Radix primitives “for convenience.”
    - Toasts may still use Sonner (or the shadcn toast pattern shipped for Base UI); do not pull Radix Toast to fill gaps.
19. **Keep BFF proxy** — Next.js `app/api/**` routes continue to proxy to Go; UI must handle `503` / `PULSE_API_REQUIRED` cleanly.
20. **Keep domain types module** — Frontend types remain the source of truth for UI models; do not fork parallel type systems during rewrite.
21. **Pure logic stays framework-agnostic** — Draft state machines, filter helpers, builders, and formatters should remain testable without mounting HeroUI/shadcn.
22. **Incremental migration is allowed** — Prefer vertical slices (shell → dashboard → monitors → builder → …) over a big-bang if safer; Definition of Done still requires HeroUI gone and parity complete.
23. **No API schema changes** for this PRD. UI adapters may reshape only for presentation.
24. **Env & deploy** — Do not change deployment topology (Postgres, Redis, API, worker). Web env still needs `PULSE_API_BASE_URL`.
25. **Component mapping (HeroUI → shadcn/Base UI)** — Use as migration cheat sheet:

| HeroUI usage (current) | shadcn + Base UI target |
|------------------------|-------------------------|
| Button | Button |
| Card | Card |
| Input / TextField / Label | Input + Label (+ FormItem) |
| TextArea | Textarea |
| Select / ListBox | Select (Base UI `items` API) or Combobox/Autocomplete for searchable |
| Checkbox / CheckboxGroup | Checkbox |
| Switch | Switch |
| Tabs | Tabs |
| Table | Table |
| Chip | Badge |
| Modal | Dialog (Base UI; use `render` on triggers, not `asChild`) |
| Drawer | Sheet |
| Dropdown | DropdownMenu |
| Disclosure | Collapsible / Accordion (Base UI `multiple` boolean, not Radix `type`) |
| SearchField | Input + search icon / Command |
| Alert | Alert |
| Spinner | Loader2 icon / Skeleton |
| Toast / ToastQueue | Sonner (or Base UI–compatible shadcn toast) |
| Calendar / DateField / DatePicker / TimeField | shadcn calendar + date picker patterns (react-day-picker) |
| EmptyState | Product EmptyState |
| Description | muted text / FormDescription |
| Separator | Separator |
| Tooltip | Tooltip |

26. **Theming** — Define CSS variables for background, foreground, muted, accent, primary, destructive, success, warning, border, ring. Map existing “status” colors into the token set. Avoid purple-default AI aesthetic; keep a professional ops-console look consistent with current Rythm branding where possible.
27. **Testing during rewrite** — Preserve Vitest unit tests for pure modules; update component tests only when behavior assertions remain valid.
28. **Import surface** — Product code imports from `@workspace/ui/components/*` (or `@/components/ui/*`), never from `@heroui/react` or `@radix-ui/*`.

### Interaction specifics to preserve

29. Builder: save draft → test/run draft → publish → version bump; discard draft; raw JSON sync.
30. Deployment wizard: what → monitors → logs → review; timeline of phases; detail tabs (overview, samples, log checks, report).
31. Secrets: create/test/rotate; never reveal stored value.
32. Settings tabs and test actions for notifications, certificates, retention purge confirmation, ELF proxy save.
33. Import/export dialog for monitors with format selection and clear messaging that secrets are not exported.
34. Keyboard **D** theme toggle when focus is not in editable fields.

---

## Testing Decisions

### What makes a good test

- Assert **external behavior** users and APIs care about: draft vs published isolation, filter results, status mapping, masked output, wizard step validity, gate blocking vs advisory presentation.
- Do **not** assert HeroUI/shadcn class names, compound slot structure, or internal component state.
- Prefer testing pure functions and view-model helpers at the highest seam that stays stable across UI kits.

### Preferred seams (highest first)

1. **Domain/helpers** — draft-state reducers, monitor filters, status utilities, deployment overview models, import/export parsers, ELF criteria evaluation helpers.
2. **Next.js API route handlers** — proxy behavior and error codes when `PULSE_API_BASE_URL` missing (existing patterns).
3. **Go API tests** — unchanged; UI rewrite must not require backend test rewrites.
4. **Component/integration tests** — only for critical flows that cannot be covered above (e.g. publish confirmation gating), using Testing Library with role/label queries, not UI-kit internals.
5. **Manual / exploratory QA checklist** — full path walkthrough against user stories 10–102.

### Modules expected to keep strong automated coverage

- Draft state / builder draft helpers
- Monitor filter tooling
- Test-lab / draft execution presentation helpers (if present)
- Import/export transformation utilities
- Status and failure-category display helpers
- Any ELF pass-criteria evaluation utilities on the client

### Prior art

- Existing Vitest suites under `apps/web` for draft-state, filters, and related pure logic
- Go tests under `apps/api` for domain/execution — treat as frozen contracts

### Suggested acceptance tests (manual or e2e if available)

1. Create application → create monitor → save draft → test run → publish → see scheduled/manual run.
2. Import Postman/OpenAPI → adjust → draft test.
3. Create secret → reference in monitor → confirm masked in run output.
4. Create deployment validation → pre sample → post sample → optional ELF → review report.
5. Open alert → acknowledge → resolve; verify notification settings test.
6. Theme toggle light/dark including **D** key.
7. Grep/CI confirms zero `@heroui` imports and package removed.

---

## Out of Scope

- Rewriting or replacing the Go API, worker, scheduler, Postgres schema, or Redis queue
- Changing authentication/SSO model (unless the current app already requires it; do not invent new auth)
- Renaming Pulse → Rythm across backend env vars and API paths
- Rebuilding the Fumadocs documentation content system in shadcn
- New product features not already in the console (new step types, new gate types, mobile native apps)
- Performance re-architecture (unless required to restore parity)
- Multi-tenant marketplace, billing, or RBAC expansion beyond what exists today
- Visual marketing site / landing page redesign
- OpenAPI redesign of public APIs
- Migrating charts away from Recharts unless shadcn chart wrappers require it (wrappers OK)

---

## Further Notes

### Agent briefing

You are migrating/rebuilding an **operations console**, not inventing a new monitoring product. Read:

- Domain glossary: `CONTEXT.md`
- End-user product docs under the web docs content tree (concepts + guides)
- Frontend types that mirror the backend domain model

When uncertain, **preserve behavior** and swap presentation.

### Definition of Done

- [ ] All sidebar areas reachable and functional with shadcn-based UI
- [ ] Builder draft/test/publish/version flows work end-to-end against the Go API
- [ ] Deployment validation wizard + detail parity
- [ ] ELF library + workbench parity
- [ ] Secrets, certificates, notifications, maintenance, retention, ELF proxy settings parity
- [ ] Import/export parity
- [ ] Light/dark theme + **D** toggle
- [ ] Toasts, dialogs, sheets, tables, forms use shadcn + **Base UI** patterns
- [ ] Zero `@heroui/react` / `@heroui/styles` usage; packages removed
- [ ] Zero `@radix-ui/*` usage; Base UI (`@base-ui/react`) is the only headless primitive layer
- [ ] `components.json` / shadcn registry pinned to **base** (not radix)
- [ ] Existing Vitest pure-logic tests pass; typecheck/lint clean for web
- [ ] User-visible copy still matches Rythm domain language

### Risks

- Dense builder forms may regress if compound HeroUI field layouts are naively flattened — preserve labeling and validation messaging.
- Date/time maintenance windows need careful shadcn calendar replacement.
- Toast facade call sites are widespread — keep a compatibility wrapper.
- Charts and status colors can clash with new tokens — map semantics explicitly.
- Incremental migration can leave mixed UI kits; enforce a hard cutover checklist.
- Agents trained on older shadcn examples may default to Radix `asChild` APIs — reject those and use Base UI `render` / current Base UI docs.

### Non-goals for “polish”

Do not expand scope into a full visual rebrand. A cleaner shadcn layout is welcome; net-new UX experiments are not part of this PRD.

### File produced for

Feeding an implementation AI. Prefer executing against this PRD + `CONTEXT.md` + existing API types rather than reverse-engineering HeroUI component APIs.

---

## Appendix A — Domain quick reference

- **Application** — Grouping of monitors; CAR ID; optional schedule defaults; elfAppId
- **Monitor** — Steps + schedule + variables + secrets + alert policy
- **Published vs Draft** — Live vs unpublished edit; publish promotes and versions
- **MonitorRun** — One execution with step results and failure reason
- **AlertEvent** — open | acknowledged | resolved | suppressed
- **DeploymentValidation** — Pre/post sampling + optional ELF checks + baseline comparison
- **ElfQuery** — OpenSearch body + gateMode + pass criteria
- **SecretReference** — Named encrypted alias; masked in output
- **CertificateProfile** — Host/port mTLS material via secret aliases

## Appendix B — Step / assertion enums (preserve)

- **StepType:** `http` | `preRequest` | `delay` | `dns` | `tcp` | `tls`
- **AssertionType:** `statusCode` | `responseTime` | `jsonPath` | `header` | `bodyContains` | `regex` | `certExpiryDays` | `dnsRecords`
- **ExtractorType:** `jsonPath` | `header` | `cookie` | `regex` | `statusCode` | `responseTime`
- **TriggeredBy:** `manual` | `schedule` | `draft` | `test`
- **MonitorStatus:** `success` | `failed` | `timeout` | `error` | `skipped`

## Appendix C — Settings tabs (preserve)

1. Notifications & Alerts (SMTP + Slack)
2. Client Certificates
3. Maintenance Windows
4. System & Retention
5. ELF Proxy
