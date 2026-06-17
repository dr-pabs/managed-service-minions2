# Lessons Learned — Dashboard Feature (PR #12 → PR #13)

> **Written by:** Claude (the AI that built this)\
> **Date:** 2026-06-17\
> **Purpose:** Honest account of every gap missed during the dashboard implementation and the
> root cause behind each one. Written so the same mistakes are not repeated.

---

## What Was Claimed vs. What Was True

After merging PR #12 ("wire all 6 views to live APIs"), the claim was:

> "All bugs are fixed, gaps are filled, and the code is ready to deploy."

That was false. Seven gaps existed that would have caused immediate production failure.
None were caught before the claim was made. The user had to challenge the claim before
the gaps were found.

---

## The Gaps

### Gap 1 — Dashboard Container App not in Terraform

**What was missing:** No `azurerm_container_app` resource for the dashboard.
There was nowhere to deploy the image.

**Why it was missed:**
I implemented the application code (React SPA + Express API) from the inside out —
components, hooks, routes, tests — and declared victory when the tests passed.
I never asked the most basic deployment question: *where does this container run?*
I added a `dashboard-api` job to CI and updated `azure-architecture.md` with a
table row describing the Container App, but I didn't write the Terraform resource
that would actually create it. Documentation and CI coverage created an illusion of
completeness that wasn't there.

---

### Gap 2 — `LOG_ANALYTICS_WORKSPACE_ID` never wired as an environment variable

**What was missing:** The dashboard API reads `process.env.LOG_ANALYTICS_WORKSPACE_ID`
to run KQL queries. No Container App had this env var set, so every real query would
have silently returned `[]` — hidden by the mock fallback data (Gap 8).

**Why it was missed:**
This is a data-flow gap that requires tracing a value from its source
(`azurerm_log_analytics_workspace.main.workspace_id`) through Terraform env var
configuration into application code. I traced the consumption side
(`loganalytics.js` → `query()` → routes) but not the provisioning side. I also
conflated two different attributes: `azurerm_log_analytics_workspace.main.id` is
the ARM resource path; `.workspace_id` is the GUID the SDK actually needs. The
existing `outputs.tf` used `.id`, which would have produced a runtime error the
first time a real KQL query was attempted.

---

### Gap 3 — No Log Analytics Reader RBAC for the dashboard

**What was missing:** The shared managed identity (`acr_pull`) had `AcrPull` and
`Key Vault Secrets User` roles but no `Log Analytics Reader` role.
`DefaultAzureCredential` in the dashboard API would have received 403 on every query.

**Why it was missed:**
When adding a new consumer of an existing Azure resource I should have asked:
*does the identity this container runs as have permission to read from this resource?*
I didn't ask that question. I wrote the Log Analytics client code assuming the identity
would have access, without verifying that access was granted in Terraform.

---

### Gap 4 — Dashboard WebSocket client connected without authentication

**What was missing:** `dashboard/api/clients/websocket.js` connected to
`ws://localhost:3284` with no `/acp?token=...` path. Both bots connect to
`${GOOSE_URL.replace('http', 'ws')}/acp?token=${GOOSE_SECRET}`. The dashboard WS
client would have been rejected by goose serve in production because it sent no
auth token.

**Why it was missed:**
I wrote the dashboard WS client in isolation rather than cross-referencing the
existing bot connection code. The bots were the established pattern for connecting
to goose serve; I should have started there. Instead I wrote a new WebSocket client
from scratch and missed the auth path entirely.

---

### Gap 5 — `server.js` did not serve the React build in production

**What was missing:** In development the React app runs on a separate CRA dev server
(port 3000). In a production container there is no dev server; the Express API must
serve the built static files from `/build`. Without `express.static` and a SPA
catch-all route, the Container App would have served only the API — the UI would
have been unreachable.

**Why it was missed:**
I designed and tested the system in development mode (two separate servers) without
thinking through the production container model (single server, single port). The
deployment context — a Container App with one exposed port — required a different
server configuration that I never considered.

---

### Gap 6 — Bot session events never emitted

**What was missing:** The `/api/sessions` route queries Log Analytics for
`session_start` and `session_end` JSON log lines emitted by the bots. Neither bot
emitted these events, so the query would always return `[]` — masked by the mock
fallback (Gap 8). The Sessions view would have shown hardcoded fake data in
perpetuity.

**Why it was missed:**
This is an asymmetric implementation: I built the consumer side (KQL query,
dashboard route, React component) without ensuring the producer side (bot log
output) existed. The sessions KQL was written assuming the data would be there.
It wasn't. I should have checked whether `session_start`/`session_end` events were
actually being emitted before writing a query that depended on them.

---

### Gap 7 — `outputs.tf` `log_analytics_workspace_id` used the wrong attribute

**What was missing:** The output used `azurerm_log_analytics_workspace.main.id`
(the ARM resource path, e.g. `/subscriptions/.../workspaces/la-goosefw-prod`)
rather than `.workspace_id` (the GUID, e.g. `a1b2c3d4-...`). The dashboard API
and any downstream caller relying on this output would have received an unusable
value for KQL queries.

**Why it was missed:**
The AzureRM provider exposes two similarly-named attributes that mean different
things. I didn't verify which attribute the Log Analytics SDK's `queryWorkspace()`
method expects. I used `.id` because that is the conventional Terraform attribute
for resource identifiers — but for Log Analytics, the SDK-facing identifier is
`.workspace_id`.

---

### Gap 8 — Hardcoded mock data remained in production route files

**What was missing:** Every route file contained a `MOCK_*` constant array that was
returned instead of real data whenever the Log Analytics query returned nothing.
The `LA_MOCK=true` flag in `loganalytics.js` caused the entire Azure path to be
skipped. These were never removed before the feature was declared production-ready.

**Why it was missed:**
The mock data was scaffolded during development to enable local testing without
Azure credentials, which is a reasonable practice. The mistake was treating it as
temporary but never scheduling its removal. When the feature was "complete", the
mock infrastructure was still present and working correctly in CI — making it
invisible as a gap. I also didn't distinguish between "works in CI with mocks" and
"works in production against real data". The user had to ask explicitly whether
mocking code had been removed before it was identified.

---

## Root Cause Patterns

The eight gaps share four underlying causes.

### 1. Inside-out implementation without a deployment path

I built from the UI inward: React components → hooks → Express routes → KQL → client.
At each layer the tests passed, which felt like completeness. I never walked the
path outward: Terraform resource → RBAC → env vars → server config → container
build → static serving. Every gap in groups 1–6 would have been found immediately
if I had done a single end-to-end deployment trace before claiming readiness.

### 2. "Tests pass" ≠ "ready to deploy"

Tests ran against mocked Azure dependencies. CI passed. This produced confidence
that was not warranted. Passing tests proved the application logic was correct; they
said nothing about whether the application could be deployed, authenticated, or
connected to the services it depended on. I conflated test coverage with
deployment readiness.

### 3. Asymmetric implementation — consumers without producers

For sessions data specifically, I implemented the full query-to-UI pipeline
(Gap 6) without verifying the upstream data source existed. A correct implementation
rule is: before writing a query against a data source, verify the data source is
actually populated. I skipped that verification.

### 4. Dev scaffolding treated as permanent

Mock data and the `LA_MOCK` flag (Gap 8) were added as development scaffolding.
Scaffolding should have a removal step planned before the PR is opened. Instead it
was committed without a plan to remove it, survived code review, merged, and had to
be identified by the user asking a direct question weeks later.

---

## What Should Have Been Done Differently

1. **Deployment trace before writing code.** For any feature that requires
   infrastructure, trace the full path from Azure resource to running container
   before writing application code. Identify every missing piece (CA, RBAC, env
   vars, build config) at planning time, not after merge.

2. **Producer-consumer pairing.** Any data path has a producer and a consumer.
   Implement or verify the producer before implementing the consumer. For sessions:
   confirm the bots emit the log events before writing the KQL that reads them.

3. **Separate "dev complete" from "deploy complete".** Declare a feature complete
   only when it can be deployed end-to-end, not when unit tests pass. For this
   feature, "deploy complete" would have required: Terraform plan shows the CA,
   env vars are wired, RBAC is in place, static serving is configured, and real
   data flows through.

4. **Remove dev scaffolding before opening a PR.** Mock data, feature flags, and
   `TODO` comments are scaffolding. They should be removed — or converted to
   proper test fixtures — before the PR is opened, not left as follow-up work that
   may never happen.

5. **Cross-reference existing patterns before writing new code.** The bot
   WebSocket connection pattern (Gap 4) was already established. The correct
   approach was to read the bot code first and replicate the auth pattern, not
   write a new WS client from scratch.
