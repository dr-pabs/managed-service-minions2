# Lessons Learned — Full Project Post-Mortem

> **Written by:** Claude (the AI that built this)\
> **Date:** 2026-06-17\
> **Purpose:** Honest account of every gap, bug, defect, and CI failure introduced
> across the entire project, with root-cause analysis for each. Written so the same
> mistakes are not repeated.

---

## Overview

Across all merged PRs (#1 – #13), the following categories of defects were introduced
and required subsequent fix commits or follow-on PRs:

| Category | Count |
|---|---|
| Logic / correctness bugs | 5 |
| Infrastructure defects | 12 |
| Deployment gaps (dashboard) | 8 |
| CI / tooling failures | 9 |
| Documentation defects | 4 |
| **Total** | **38** |

---

## Part 1 — Logic and Correctness Bugs

### Bug 1 — `rate_limiter` module was silently dead

**PR introduced:** #8 (phase 3–4 production hardening)\
**PR fixed:** #10

`mcp-servers/toolshed/src/rate_limiter.rs` was written and contained 6 unit tests,
but was never declared with `mod rate_limiter;` in `main.rs`. Rust did not compile it.
The rate limiter never ran. Every tool call bypassed rate limits entirely, in both
production code and tests — all 6 tests silently never executed.

**Why it was missed:**
Rust silently ignores source files that are not declared in the module tree. There is
no compiler warning for an unreferenced `.rs` file. I wrote the module and its tests
but never wired the `mod` declaration. There was no build step that would have flagged
this — `cargo build` succeeded because the file was simply excluded. I assumed
"the file exists therefore it compiles and runs". That assumption is wrong in Rust.

---

### Bug 2 — `extract_agent_type` always returned `"code-reviewer"`

**PR introduced:** #8\
**PR fixed:** #10

In `mcp-servers/toolshed/src/proxy.rs`, the function `extract_agent_type` was
hardcoded to return `"code-reviewer"` regardless of the actual calling agent.
Consequences:

- Per-agent allowlists were non-functional: every agent was treated as `code-reviewer`
  and got the code-reviewer toolset regardless of their actual type.
- Per-agent rate limiting was non-functional: all calls accumulated under a single
  `"code-reviewer"` bucket.
- Audit logs recorded the wrong agent for every tool call.
- The `correlation_id` in audit entries was hardcoded to `"unknown"`.

**Why it was missed:**
The function was written as a placeholder during initial scaffolding, with the
intention of filling in real logic later. It was then committed, reviewed, and merged
without that logic ever being written. There were no tests that verified different
agents received different allowlists — the test suite exercised the allowlist logic
in isolation but not the end-to-end routing that called `extract_agent_type`.

---

### Bug 3 — Hand-rolled ISO timestamp functions had calendar math bugs

**PR introduced:** #8\
**PR fixed:** #10

`mcp-servers/toolshed/src/logger.rs` contained hand-rolled `secs_to_iso` and
`is_leap` functions to convert Unix timestamps to ISO 8601 strings. The leap year
calculation and month-boundary arithmetic had off-by-one errors that produced wrong
timestamps at year and month boundaries.

**Why it was missed:**
The functions looked correct at a glance and were not tested with boundary inputs
(year-end, leap day, month transitions). The standard library `chrono` crate solves
this correctly and was already in the dependency graph of adjacent crates. I wrote
custom calendar arithmetic when I should have used the existing library.

---

### Bug 4 — Both bots shared a single session across all users

**PR introduced:** #2 (Phase 1 scaffolding)\
**PR fixed:** #10

The original `bot.js` for both Slack and Teams used a single module-scope
`sessionId`. Every user's message was sent to the same goose session. Consequences:

- User A's message could receive User B's response.
- One user's conversation context contaminated all subsequent responses.
- This was a privacy defect as well as a correctness defect.

**Why it was missed:**
The original scaffolding was written to prove the ACP connection worked, not to
handle concurrent users. The single-session model was acceptable for a one-person
demo and was never flagged as needing to change before merging. There were no tests
involving more than one user. The defect was only caught during a formal code review
of the production codebase.

---

### Bug 5 — Both bots returned a stale snapshot instead of the actual response

**PR introduced:** #2\
**PR fixed:** #10

`sendToGoose` in both bots called `session/prompt` (which is an ACP acknowledgement,
not the answer) and then returned a `lastResult` variable that was never reliably
set. The actual content arrives as a stream of `notifications/AgentMessageChunk`
events. The bots were responding to users with empty or stale data.

**Why it was missed:**
The ACP streaming protocol is non-obvious: `session/prompt` returns a receipt, not
the answer. The actual answer arrives asynchronously as notifications. The original
scaffolding code assumed a request-response pattern that does not exist in ACP.
No end-to-end integration test existed to verify that a real response was returned —
only that the call was made.

---

## Part 2 — Infrastructure Defects

All of these were present after PR #8 and fixed in PR #10.

### Defect 1 — No `azurerm_container_registry` resource

`infra/main.tf` referenced an ACR login server for all three Container App images but
did not declare the ACR resource. Terraform managed the consumers of the registry
without managing the registry itself. Deploying would have failed or silently used an
unmanaged registry.

**Why it was missed:**
The ACR was assumed to pre-exist. The Terraform config referenced `var.acr_name`
(a hardcoded string) rather than computing the login server from a managed resource.
The variable was never given a meaningful default and the gap was not caught by
`terraform validate` because Terraform cannot validate that external resources exist.

---

### Defect 2 — No `identity` block on any Container App

None of the three Container Apps had `identity { type = "UserAssigned" ... }` blocks.
Without an attached managed identity, ACR image pulls and Key Vault secret reads
would fail at runtime.

**Why it was missed:**
The identity block and the registry/secret blocks are three separate Terraform
constructs that must all be present together. I wrote the Container App resources
without going through the full checklist of what a Container App needs to pull images
from a private ACR and read secrets from Key Vault.

---

### Defect 3 — No `secret` blocks on any Container App

Sensitive values (goose secret key, Slack tokens, Teams credentials) were written
as plain-text `env` values rather than as `secret` blocks referencing Key Vault.
In the azurerm provider, secrets must be declared in a `secret { }` block and then
referenced via `secret_name` in the env block. Without this, the values would have
been empty strings at runtime.

**Why it was missed:**
I wrote the env var blocks first and the Key Vault resources separately, without
connecting them. The Terraform `secret` / `secret_name` reference pattern is
provider-specific and easy to overlook if working from memory rather than the
provider documentation.

---

### Defect 4 — No Key Vault RBAC role assignment for the managed identity

The managed identity had no `Key Vault Secrets User` role assignment, so it could not
read any secrets from Key Vault even if the secret blocks had been correctly wired.

---

### Defect 5 — No `azurerm_key_vault_secret` resources

The secrets (goose key, Slack tokens, Teams credentials) were never provisioned into
Key Vault by Terraform. There was nothing for the Container Apps to read.

---

### Defect 6 — `SLACK_APP_TOKEN` missing from Slack bot env

The Slack bot requires a Socket Mode app token (`xapp-...`) to maintain a persistent
WebSocket connection to the Slack platform. It was not included in the Container App
env configuration, so the bot would have failed to start.

---

### Defect 7 — `AZURE_AD_CLIENT_SECRET` missing from Teams bot env

The Teams bot requires `AZURE_AD_CLIENT_SECRET` to authenticate the BotFramework
adapter. Without it, all incoming Teams messages would be rejected with 401.

---

### Defect 8 — `scale_config` locals never wired to `min_replicas`/`max_replicas`

The Terraform config defined a `scale_config` map for per-environment scaling
(dev: min=0, staging: min=1, prod: min=1) but the orchestrator Container App template
did not reference it. The `min_replicas` and `max_replicas` fields were absent,
leaving the Container App at the provider default (typically 1 replica with no
scale-to-zero in dev).

---

### Defect 9 — `var.acr_name` hardcoded to wrong value

`var.acr_name` defaulted to `"stgoosefwdev"` — the name of the storage account, not
the ACR. All three Container App image references were wrong.

**Why missed (Defects 4–9):**
These are all symptoms of the same root cause as Defect 2: the Container App
Terraform configuration was written from memory rather than from a working
example that covered the full set of required resources. Each piece (identity,
secrets, RBAC, env vars) requires a separate resource or block, and none of them
are enforced by `terraform validate` — the config is syntactically valid even when
incomplete.

---

### Defect 10 — Rust toolshed written against rmcp 0.3 API

**PR introduced:** #2\
**PR fixed:** via external Copilot commit on PR #3 branch

The toolshed `proxy.rs` was written against rmcp 0.3 trait signatures, but rmcp 0.4.1
was the available crate version. The server trait implementation and method signatures
were incompatible. `cargo build` failed in CI from the first commit.

**Why it was missed:**
The initial implementation was written without running `cargo build` locally
(no Rust toolchain on the dev machine at that point). The API compatibility was
not verified against the pinned crate version. This is the most basic possible
verification step and it was skipped.

---

### Defect 11 — Dashboard: no Container App in Terraform

**PR introduced:** #12\
**PR fixed:** #13

Covered in full in Part 3 below.

---

### Defect 12 — `outputs.tf` used `.id` instead of `.workspace_id` for Log Analytics

**PR introduced:** #8\
**PR fixed:** #13

`azurerm_log_analytics_workspace.main.id` is the ARM resource path.
`azurerm_log_analytics_workspace.main.workspace_id` is the GUID the Log Analytics
SDK needs for KQL queries. The output was named `log_analytics_workspace_id` but
returned the wrong value.

**Why it was missed:** See Part 3, Gap 2.

---

## Part 3 — Dashboard Deployment Gaps

All eight were introduced in PR #12 and fixed in PR #13.

### Gap 1 — Dashboard Container App not in Terraform

**Why it was missed:**
Built the application layer (React + Express + tests) without walking the deployment
path. Stopping at "tests pass" rather than asking "where does this container run?"
Documentation described the CA; the Terraform resource was never written.

---

### Gap 2 — `LOG_ANALYTICS_WORKSPACE_ID` not wired as an env var

**Why it was missed:**
Traced the consumption side of the data path (code reads env var → runs query) but
not the provisioning side (Terraform sets env var on the CA). Also conflated
`.id` (ARM path) with `.workspace_id` (GUID) — the wrong attribute was already used
in `outputs.tf`.

---

### Gap 3 — No Log Analytics Reader RBAC for the dashboard

**Why it was missed:**
Added a new consumer of an Azure resource without asking whether the identity that
consumer runs as has permission to read it. The assumption was that the managed
identity would have access; that access was never granted.

---

### Gap 4 — Dashboard WebSocket client connected without authentication

**Why it was missed:**
Wrote the WS client in isolation rather than cross-referencing the established bot
connection pattern. The bots append `/acp?token=<secret>` to authenticate; the
dashboard client did not. Writing new connection code from scratch instead of
replicating the working pattern introduced a divergence that would fail silently
in production (the connection would be rejected, falling back to no live data).

---

### Gap 5 — `server.js` did not serve the React build in production

**Why it was missed:**
Designed the system in development mode (two separate servers on different ports)
without thinking through the production container model (single container, single
port, static files must be served by Express). The gap was invisible locally because
the CRA dev server handled it transparently.

---

### Gap 6 — Bot session events never emitted

**Why it was missed:**
Built the consumer side of the sessions data path (KQL → route → React component)
without verifying the producer side (bot stdout log events). The KQL was written
assuming data it would never receive. No check was made to confirm whether the bots
actually emitted `session_start`/`session_end` events.

---

### Gap 7 — `outputs.tf` used wrong Log Analytics attribute

**Why it was missed:**
The AzureRM provider exposes `.id` (ARM resource path) and `.workspace_id` (GUID)
on the same resource. The SDK needs the GUID; `.id` is the conventional Terraform
identifier. Using the wrong one is not caught by `terraform validate`.

---

### Gap 8 — Hardcoded mock data remained in production route files

**Why it was missed:**
Mock data was scaffolded as a development aid and never had a planned removal step.
The CI tests ran against the mocks and passed, making the mock infrastructure
invisible as a gap. "Tests pass" was conflated with "production-ready".

---

## Part 4 — CI and Tooling Failures

### CI Failure 1 — Missing `package-lock.json` files (PR #3)

Dockerfiles used `npm ci` but no lockfiles existed in the repo. First encountered
at PR #3, requiring immediate follow-up commits to generate and commit lockfiles.

**Why it was missed:** `npm ci` was written into the Dockerfiles before `npm install`
had ever been run in the directory.

---

### CI Failure 2 — Stale test file paths after directory reorganisation (PR #3)

Walking-skeleton tests and CI grep checks referenced `agents/` but the files had
been moved to `.agents/`. Multiple CI jobs failed after the rename.

**Why it was missed:** Grep patterns and test references were not updated when
the directory was renamed.

---

### CI Failure 3 — SKILL.md content lost in `git commit --amend` (PR #4)

The full orchestrator SKILL.md was accidentally truncated during an amend, and
CI jobs that grepped for specific content in the file failed. Required two
follow-up fix commits to restore the content.

**Why it was missed:** `--amend` was used to tidy the commit without verifying
that all previously committed file content survived. Destructive git operations
without verification.

---

### CI Failure 4 — Markdown lint failures (MD040, MD031, MD012, MD051)

Multiple docs had fenced code blocks without language specifiers (MD040), missing
blank lines around list items (MD031), consecutive blank lines (MD012), and broken
reference links (MD051). Required a dedicated fix commit on PR #8.

**Why it was missed:** Markdown was written without running markdownlint locally.
The lint CI job was added before the existing documents were brought into
compliance with it.

---

### CI Failure 5 — CI ran `goose` commands that required a binary (PR #8)

The CI `identity` and `integration` jobs called `goose run ...`, but `goose` is
not installed in the GitHub Actions runner image. Multiple attempts to install it
in CI failed. The jobs were ultimately refactored to use file-existence and grep
checks instead.

**Why it was missed:** The CI design assumed an available binary that is not
present in standard runner images and has no reliable install path in CI. This was
a fundamental mismatch between what the CI jobs needed and what the environment
provided.

---

### CI Failure 6 — MD028 blank line between blockquotes (PR #12)

A blank line was written between two `>` blockquote blocks in `dashboard-design.md`.
markdownlint treats the second block as a new blockquote (rule MD028) and fails.

**Why it was missed:** MD028 is an obscure rule and the blank line was written
intentionally for visual spacing. The fix (using `>` as a continuation line) is
non-obvious.

---

### CI Failure 7 — `npm ci` rejected dashboard lockfile (PR #12)

The dashboard `package-lock.json` was generated with `--legacy-peer-deps`. `npm ci`
rejects a lockfile generated under non-default flags. CI had to be changed to use
`npm install --legacy-peer-deps --ignore-scripts`.

**Why it was missed:** The lockfile was generated locally with a flag that changes
its format, then committed. The CI `npm ci` command does not accept this format.
The mismatch was not caught before pushing.

---

### CI Failure 8 — Jest found no tests (`No tests found, exiting with code 1`)

The dashboard `test:api` script ran `jest api/` but the `__tests__` directory had
not yet been created when the CI job was first written. Jest found nothing and
exited with an error.

**Why it was missed:** The CI job and the test script were written before the test
files existed. The script was never run locally to verify it would find something.

---

### CI Failure 9 — Merge conflict in `ci.yml` (PR #12)

PR #12 and PR #11 both modified `ci.yml`. The `needs` array in the gate job had an
add/add conflict. Additionally, a plan file had an add/add conflict.

**Why it was missed:** Both PRs were in flight simultaneously modifying the same
section of the same file. No coordination between the branches before pushing.

---

## Part 5 — Documentation Defects

### Doc Defect 1 — AGENTS.md referenced wrong file extension

AGENTS.md told operators to run the walking-skeleton test as
`tests/integration/walking-skeleton.yaml`. The file is `walking-skeleton.md`.
CI would have failed and operators following the guide would get `file not found`.

---

### Doc Defect 2 — AGENTS.md omitted `--max-turns 30`

The same command omitted the required `--max-turns` flag, which would have caused
goose to use its default (typically 5 turns), terminating orchestration prematurely.

---

### Doc Defect 3 — `plugin.json` contained a placeholder repository URL

`"repository": "https://github.com/org/goose-agent-framework"` was committed and
merged. Users installing the plugin from the registry would have been pointed to a
non-existent repository.

---

### Doc Defect 4 — `azure-architecture.md` listed dashboard CA without Terraform resource

After PR #12, the architecture doc described `ca-dashboard-{env}` as a deployed
resource, but no Terraform resource existed to create it. Documentation claimed the
infrastructure existed; the infrastructure did not.

**Why doc defects 1–4 were missed:**
Documentation was written or updated as part of feature work without being
cross-checked against the actual code and configuration. Doc Defect 4 is
particularly notable — updating a document to describe a resource is not a
substitute for creating the resource.

---

## Part 6 — Root Cause Patterns

Thirty-eight defects across five categories. They share six underlying causes.

### 1. No deployment path trace before claiming completeness

The most common failure: implementing a feature from the inside out (application
code → tests) without ever tracing the full path from infrastructure provisioning
to running container. Gaps 1–6, Defects 1–9, and CI Failure 7 all stem from this.
The deployment path must be walked — on paper if not in practice — before any
implementation is considered done.

### 2. "Tests pass" ≠ "production-ready"

Tests ran against mocks, stubs, or isolated units. Passing tests proved the
application logic was internally consistent. They said nothing about whether the
system could be deployed, authenticated, connected, or had the data it depended on.
Gap 8, Bug 4, Bug 5, and the rate limiter defect were all invisible to the test
suite.

### 3. Scaffolding committed without a removal plan

Placeholder implementations (hardcoded return values, mock data, placeholder URLs,
`TODO` comments) were committed and merged as though they were complete. None had
a tracked removal step. Bugs 1–2, Doc Defects 1–3, and Gap 8 are all examples of
scaffolding that stayed in production code.

### 4. Asymmetric implementation — consumers without producers

For two separate data paths (agent routing and session events), the consumer was
implemented without verifying the producer existed: `extract_agent_type` consumed
an agent type that was never passed (Bug 2); the sessions KQL consumed log events
that the bots never emitted (Gap 6). Before building a consumer, confirm the
producer is real.

### 5. Building from memory rather than from working examples

Multiple Terraform defects (Defects 1–9) arose from writing configuration from
memory of how Container Apps work rather than starting from a reference that was
known to deploy successfully. The Rust rmcp API mismatch (Defect 10) arose from
not verifying the pinned crate version before writing against an assumed API.

### 6. Not running the thing before declaring it done

CI Failure 7 (npm ci rejecting the lockfile), CI Failure 8 (Jest finding no tests),
Defect 10 (Rust failing to compile), and Bug 3 (timestamp bugs) would all have been
caught immediately by running the tool locally. They were not caught because the
step was skipped.
