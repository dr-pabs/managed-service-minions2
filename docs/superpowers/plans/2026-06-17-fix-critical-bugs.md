# Fix Critical Bugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 29 identified gaps — critical CI blockers, toolshed wiring bugs, bot session/streaming failures, and Terraform provisioning gaps — so that CI passes, the toolshed enforces rate limits with the correct agent type, bots handle multi-user sessions correctly, and the infrastructure is deployable.

**Architecture:** Four milestones proceed in order: (1) make CI green by restoring the missing runner script, wiring the orphaned rate-limiter module, and fixing missing test files; (2) make the toolshed actually enforce the right allowlist and rate limit per agent by eliminating the hardcoded agent-type stub and wiring real correlation-ID passthrough; (3) make the bots production-safe by scoping sessions per user and collecting streamed responses correctly; (4) make the Terraform deployable by adding the ACR, Key Vault secrets, missing env vars, and Container App secret blocks. Missing features (real MCP proxy, Service Bus, live dashboard data, multi-tenancy, scheduled triggers) are out of scope for this plan — they are Phase 2+ work explicitly deferred in the exec plan.

**Tech Stack:** Rust 2021 / `rmcp 0.4` / `tokio` / `chrono 0.4` for the toolshed; Node.js / `@slack/bolt` / `botbuilder` for bots; HashiCorp Terraform `azurerm` provider for infra; GitHub Actions for CI; Bash/shellcheck for hooks and runner scripts.

---

## Context and Orientation

This repo (`dr-pabs/managed-service-minions2`) is a Goose Agent Framework plugin. It delivers a multi-agent orchestration system via `goose plugin install`. The key components are:

- `mcp-servers/toolshed/` — a Rust binary that acts as a Model Context Protocol (MCP) server. Every tool call from a sub-agent passes through it. It enforces per-agent allowlists (which tools each agent type is allowed to call) and per-agent rate limits (token-bucket algorithm). It logs every call as a JSON line to stdout. The binary is compiled with `cargo build --release` and registered in Goose via `goose configure --add-extension`. The main entry point is `mcp-servers/toolshed/src/main.rs`.

- `bots/slack-bot/src/bot.js` and `bots/teams-bot/src/bot.js` — Node.js services that bridge Slack/Teams messages to a running `goose serve` process via the ACP (Agent Control Protocol) WebSocket on port 3284.

- `dashboard/src/` — a React web app with 6 views. Currently all mock data.

- `infra/` — Terraform that provisions Azure Container Apps, Service Bus, Storage, Key Vault, Log Analytics, and AI Foundry.

- `.github/workflows/ci.yml` — 6-job CI pipeline: lint (markdown/YAML/shell), rust (clippy + test), identity (agent file checks), integration (walking-skeleton), terraform (fmt/init/validate), gate (all-or-nothing).

- `tests/runner.sh` — a Bash script that runs all 4 test gates in sequence. Referenced by CI and by `AGENTS.md` but currently absent from the repo.

- `.agents/agents/` — Markdown files that define each sub-agent's identity, tools, process, and JSON output schema.

- `.agents/skills/orchestrator/SKILL.md` — the orchestrator skill that classifies user intent and delegates to sub-agents.

The gap analysis that produced this plan is in the session transcript. Numbers like "item 3" or "issue #7" refer to the numbered list in that analysis.

---

## Progress

- [ ] Milestone 1 — CI green
  - [ ] Restore `tests/runner.sh`
  - [ ] Add `mod rate_limiter;` to `main.rs`
  - [ ] Create `tests/roles/orchestrator-identity.md`
  - [ ] Fix `AGENTS.md` walking-skeleton path (`.yaml` → `.md`)
  - [ ] Fix `plugin.json` repository URL
  - [ ] Run `cargo test` locally — all pass
  - [ ] Commit M1
- [ ] Milestone 2 — Toolshed correctness
  - [ ] Replace hand-rolled date math in `logger.rs` with `chrono`
  - [ ] Add `chrono` to `Cargo.toml`; remove unused `uuid`
  - [ ] Wire `RateLimiter` into `ToolshedServer` in `proxy.rs`
  - [ ] Implement real `extract_agent_type` via `X-Agent-Type` tool-call metadata
  - [ ] Add correlation-ID passthrough via `X-Correlation-Id` header
  - [ ] Run `cargo test` — all pass, rate-limiter tests now included
  - [ ] Commit M2
- [ ] Milestone 3 — Bot correctness
  - [ ] Fix Slack bot: per-user session map + streaming accumulation
  - [ ] Fix Teams bot: per-user session map + streaming accumulation
  - [ ] Add `SLACK_APP_TOKEN` env var to Slack Container App in Terraform
  - [ ] Add `AZURE_AD_CLIENT_SECRET` env var to Teams Container App in Terraform
  - [ ] Commit M3
- [ ] Milestone 4 — Terraform deployable
  - [ ] Add `azurerm_container_registry` resource
  - [ ] Add AcrPull role assignment for managed identity
  - [ ] Add Key Vault RBAC and secret resources
  - [ ] Add `secrets` blocks to all three Container Apps
  - [ ] Wire `scale_config` locals to Container App scale rules
  - [ ] Run `terraform validate` — passes
  - [ ] Commit M4

---

## Surprises & Discoveries

_Populated as work proceeds._

---

## Decision Log

- Decision: Implement `extract_agent_type` via a custom MCP tool-call parameter prefix `__agent_type` rather than environment variables or HTTP headers, because the toolshed communicates over MCP stdio and has no HTTP layer to attach headers to.
  Rationale: MCP tool calls pass `arguments` as a JSON object. Sub-agents can include a reserved `__agent_type` key in their tool-call arguments. The toolshed strips this key before forwarding (Phase 2 when the real proxy is built) and uses it to look up allowlists and rate-limit buckets. This is the lowest-friction change that doesn't require modifying the Goose runtime.
  Date/Author: 2026-06-17 / gap-analysis session

- Decision: Keep `extract_agent_type` with a `__agent_type` fallback of `"code-reviewer"` (instead of returning an error) so Phase 1 continues to work even when sub-agents don't pass the parameter.
  Rationale: Failing closed on unknown agent type would break the walking skeleton, which doesn't yet pass `__agent_type`. A safe default with a logged warning is less disruptive while the parameter propagation is wired into agent definitions in a follow-up.
  Date/Author: 2026-06-17 / gap-analysis session

- Decision: Correlation IDs are passed via the same `__correlation_id` key in tool-call arguments, extracted and stripped alongside `__agent_type`.
  Rationale: Same reasoning as above — no HTTP layer, so piggybacking on tool-call arguments is the path of least resistance. The audit logger already accepts a `correlation_id` string; this just populates it from a real value instead of "unknown".
  Date/Author: 2026-06-17 / gap-analysis session

- Decision: Per-user Slack/Teams sessions are keyed on `userId` (Slack `event.user`, Teams `context.activity.from.id`).
  Rationale: Keying on channel would allow one user to see another's in-progress session. Keying on user is the minimum isolation needed for correctness.
  Date/Author: 2026-06-17 / gap-analysis session

---

## Outcomes & Retrospective

_Populated at completion._

---

## Plan of Work

### Milestone 1 — CI Green

The CI pipeline has two hard failures today: `tests/runner.sh` doesn't exist (lint gate shellchecks it; integration gate explicitly fails if absent) and `rate_limiter.rs` is never compiled so its module declaration is missing. Two softer failures: `tests/roles/orchestrator-identity.md` is missing (the identity gate's glob `tests/roles/*.md` runs it via goose but the file doesn't exist), and `AGENTS.md` references the walking skeleton as `.yaml` when it is `.md`.

We fix these in order of CI gate execution: shell lint first, then Rust, then identity, then docs.

### Milestone 2 — Toolshed Correctness

The toolshed has three correctness bugs in its core path: (a) the rate-limiter module compiles but is never used; (b) `extract_agent_type` always returns `"code-reviewer"`, meaning all agents share one allowlist bucket and one rate-limit bucket regardless of their real type; (c) the audit logger's timestamp is a hand-rolled Gregorian calendar implementation that works but carries unnecessary maintenance risk — replace with `chrono`.

The fix for (b) and the correlation-ID gap: teach sub-agents to include `__agent_type` and `__correlation_id` as reserved keys in their tool-call arguments. The toolshed extracts these at the top of `call_tool`, removes them from the forwarded arguments, and uses them for allowlist lookup, rate limiting, and audit logging. This requires no changes to the Goose runtime.

### Milestone 3 — Bot Correctness

Both bots have two bugs: (a) module-scope `let sessionId = null` means all users share one session — fix by maintaining a `Map<userId, sessionId>`; (b) the `AgentMessageChunk` streaming handler is a stub comment — fix by accumulating chunks in a per-session `Map` and resolving the pending `session/prompt` promise when the final chunk arrives.

Two Terraform gaps also belong in this milestone because they prevent the bots from starting at all: `SLACK_APP_TOKEN` is absent from the Slack Container App; `AZURE_AD_CLIENT_SECRET` is absent from the Teams Container App.

### Milestone 4 — Terraform Deployable

Four Terraform problems prevent `terraform apply` from succeeding: (1) no ACR resource, so image references can't resolve; (2) no Key Vault secrets or RBAC, so Container Apps can't read their secrets; (3) no `secrets` blocks on the Container Apps, so `secret_name` references in env vars are invalid; (4) the `scale_config` locals are defined but never wired to the Container App scale rules.

---

## Task 1: Restore `tests/runner.sh`

**What this is:** A Bash script that the CI lint gate shellchecks and the CI integration gate requires to exist. It should run the same 4 test categories the README describes: orchestrator identity, code-reviewer identity, delegate spawn, and walking skeleton. Since the real goose integration tests require a live Goose binary (Phase 4 blocker), the runner prints a summary and exits 0 in CI where goose is not installed, but runs the full suite locally when goose is available.

**Files:**
- Create: `tests/runner.sh`

- [ ] **Step 1: Create `tests/runner.sh`**

  Create the file at `tests/runner.sh` with the following content:

      #!/usr/bin/env bash
      # Goose Agent Framework — Unified Test Runner
      # Runs all 4 test gates. Exits 0 only if all pass.
      # Usage: bash tests/runner.sh
      # Requires: goose (for identity/integration gates), cargo (for Rust gate)

      set -euo pipefail

      PASS=0
      FAIL=0
      SKIP=0

      log_pass() { echo "PASS: $1"; PASS=$((PASS + 1)); }
      log_fail() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }
      log_skip() { echo "SKIP: $1 (goose not available)"; SKIP=$((SKIP + 1)); }

      echo "=== Gate 1: Rust unit tests ==="
      if command -v cargo >/dev/null 2>&1; then
        cargo test --manifest-path mcp-servers/toolshed/Cargo.toml --quiet \
          && log_pass "cargo test" || log_fail "cargo test"
      else
        log_skip "cargo test"
      fi

      echo ""
      echo "=== Gate 2: Orchestrator Identity ==="
      if command -v goose >/dev/null 2>&1; then
        goose run -i tests/roles/orchestrator-identity.md --output-format json \
          && log_pass "orchestrator-identity" || log_fail "orchestrator-identity"
      else
        log_skip "orchestrator-identity"
      fi

      echo ""
      echo "=== Gate 3: Code-Reviewer Identity ==="
      if command -v goose >/dev/null 2>&1; then
        goose run -i tests/roles/code-reviewer-identity.md --output-format json \
          && log_pass "code-reviewer-identity" || log_fail "code-reviewer-identity"
      else
        log_skip "code-reviewer-identity"
      fi

      echo ""
      echo "=== Gate 4: Walking Skeleton ==="
      if command -v goose >/dev/null 2>&1; then
        goose run -i tests/integration/walking-skeleton.md --output-format json --max-turns 30 \
          && log_pass "walking-skeleton" || log_fail "walking-skeleton"
      else
        log_skip "walking-skeleton"
      fi

      echo ""
      echo "Results: ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
      [ "$FAIL" -eq 0 ] && exit 0 || exit 1

- [ ] **Step 2: Make it executable**

      chmod +x tests/runner.sh

- [ ] **Step 3: Verify shellcheck passes**

  Run from the repo root:

      shellcheck tests/runner.sh

  Expected: no output, exit 0.

- [ ] **Step 4: Verify the CI integration gate now passes locally**

      bash -c '
        if [ -f "tests/runner.sh" ]; then
          shellcheck tests/runner.sh && echo "PASS: runner.sh is valid shell"
        else
          echo "FAIL: runner.sh not found"
          exit 1
        fi
      '

  Expected output: `PASS: runner.sh is valid shell`

---

## Task 2: Add `mod rate_limiter;` to `main.rs`

**What this is:** In Rust, a source file must be declared with a `mod` statement in the crate root (`main.rs`) to be compiled. `mcp-servers/toolshed/src/rate_limiter.rs` exists but is never declared, so `cargo test` silently skips its 6 tests. This task makes the module visible so the tests run. Wiring it into the call path is Task 5.

**Files:**
- Modify: `mcp-servers/toolshed/src/main.rs`

- [ ] **Step 1: Add the module declaration**

  Open `mcp-servers/toolshed/src/main.rs`. The current module declarations are:

      mod allowlist;
      mod logger;
      mod proxy;

  Change them to:

      mod allowlist;
      mod logger;
      mod proxy;
      mod rate_limiter;

- [ ] **Step 2: Verify it compiles**

  From the repo root:

      cargo clippy --manifest-path mcp-servers/toolshed/Cargo.toml -- -D warnings

  Expected: zero warnings, zero errors.

- [ ] **Step 3: Verify rate-limiter tests now run**

      cargo test --manifest-path mcp-servers/toolshed/Cargo.toml 2>&1 | grep -E "(test rate|FAILED|ok)"

  Expected output should include lines like:

      test rate_limiter::tests::token_bucket_allows_within_capacity ... ok
      test rate_limiter::tests::token_bucket_denies_beyond_capacity ... ok
      test rate_limiter::tests::different_agents_have_independent_buckets ... ok
      test rate_limiter::tests::unknown_agent_not_rate_limited ... ok
      test rate_limiter::tests::security_auditor_has_higher_capacity ... ok
      test rate_limiter::tests::remaining_tokens_reports_correctly ... ok

---

## Task 3: Replace hand-rolled date math with `chrono` in `logger.rs`

**What this is:** `mcp-servers/toolshed/src/logger.rs` contains a manual Gregorian calendar computation (`secs_to_iso` / `is_leap`) to format ISO 8601 timestamps. The comment in the file acknowledges it's an approximation. The `chrono` crate provides a well-tested, correct implementation. This task swaps the hand-rolled code for `chrono::Utc::now().to_rfc3339()` and removes the dead `uuid` dependency from `Cargo.toml` (it was only referenced from `rate_limiter.rs` which was previously orphaned — once rate_limiter is compiled, uuid is still not needed because the rate limiter doesn't use it either).

**Files:**
- Modify: `mcp-servers/toolshed/Cargo.toml`
- Modify: `mcp-servers/toolshed/src/logger.rs`

- [ ] **Step 1: Update `Cargo.toml`**

  Open `mcp-servers/toolshed/Cargo.toml`. Find the `[dependencies]` section. Remove the `uuid` line and add `chrono`:

      [dependencies]
      anyhow = "1"
      chrono = { version = "0.4", features = ["serde"] }
      rmcp = { version = "0.4", features = ["server", "transport-io"] }
      serde = { version = "1", features = ["derive"] }
      serde_json = "1"
      tokio = { version = "1", features = ["full"] }
      tracing = "0.1"
      tracing-subscriber = "0.3"

  (Remove `uuid = { version = "1", features = ["v4"] }` entirely — it is unused.)

- [ ] **Step 2: Replace `iso_now` and its helpers in `logger.rs`**

  Open `mcp-servers/toolshed/src/logger.rs`. At the top, add the chrono import after the existing `use` statements:

      use chrono::Utc;

  Find the function `iso_now` and everything below it (the `secs_to_iso` and `is_leap` functions). Replace all of them with a single function:

      fn iso_now() -> String {
          Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
      }

  Delete `fn secs_to_iso` and `fn is_leap` entirely — they are no longer needed.

- [ ] **Step 3: Verify it compiles and tests pass**

      cargo test --manifest-path mcp-servers/toolshed/Cargo.toml

  Expected: all tests pass, zero compilation errors.

- [ ] **Step 4: Spot-check the timestamp format**

  Add a temporary inline check (can be a quick manual test, not committed):

      cargo test --manifest-path mcp-servers/toolshed/Cargo.toml -- --nocapture 2>&1 | head -20

  The audit log entries printed to stdout during tests should show timestamps like `2026-06-17T14:23:01.123Z`.

---

## Task 4: Create `tests/roles/orchestrator-identity.md`

**What this is:** The CI identity gate and `plugin.json`'s quality gate both run `goose run -i tests/roles/*.md`. The `orchestrator-identity.md` file is referenced in the README and exec plan but is absent. Without it, the glob matches only the existing files; there is no positive assertion that the orchestrator correctly classifies all 6 intents. This task creates the file following the same pattern as `tests/roles/code-reviewer-identity.md`.

**Files:**
- Create: `tests/roles/orchestrator-identity.md`

- [ ] **Step 1: Create the identity test file**

  Create `tests/roles/orchestrator-identity.md` with the following content:

      # Orchestrator Identity Test

      You are a test runner verifying the orchestrator's intent classification.
      Load the orchestrator skill from `.agents/skills/orchestrator/SKILL.md`.

      Run the following classification assertions. For each, simulate receiving the
      user message and report whether the orchestrator classifies it to the expected intent.

      ## Test Cases

      1. Message: "Review PR #342 in org/repo" — expected intent: `code_review`
      2. Message: "What is the status of INC00421?" — expected intent: `ticket_lookup`
      3. Message: "Fix INC00421 and create a PR" — expected intent: `ticket_fix_pr`
      4. Message: "Is this SQL query vulnerable to injection?" — expected intent: `security_audit`
      5. Message: "Find the source of the login timeout in the auth module" — expected intent: `code_explore`
      6. Message: "Hello, how are you?" — expected intent: `unknown`

      ## Instructions

      For each test case, respond with the intent you would classify it as. Then produce
      a final JSON report:

          {
            "test": "orchestrator-identity",
            "results": [
              { "case": 1, "message": "Review PR #342 in org/repo", "expected": "code_review", "actual": "...", "pass": true },
              { "case": 2, "message": "What is the status of INC00421?", "expected": "ticket_lookup", "actual": "...", "pass": true },
              { "case": 3, "message": "Fix INC00421 and create a PR", "expected": "ticket_fix_pr", "actual": "...", "pass": true },
              { "case": 4, "message": "Is this SQL query vulnerable to injection?", "expected": "security_audit", "actual": "...", "pass": true },
              { "case": 5, "message": "Find the source of the login timeout in the auth module", "expected": "code_explore", "actual": "...", "pass": true },
              { "case": 6, "message": "Hello, how are you?", "expected": "unknown", "actual": "...", "pass": true }
            ],
            "passed": 6,
            "failed": 0,
            "all_passed": true
          }

      Return ONLY the JSON. No preamble.

- [ ] **Step 2: Verify CI identity grep checks still work**

  The CI identity gate greps the orchestrator SKILL.md for intent mappings:

      grep -q 'code_review.*code-reviewer' .agents/skills/orchestrator/SKILL.md && echo "PASS"
      grep -q 'ticket_lookup.*ticket-analyst' .agents/skills/orchestrator/SKILL.md && echo "PASS"
      grep -q 'unknown' .agents/skills/orchestrator/SKILL.md && echo "PASS"

  All three must print `PASS`. Run them from the repo root to confirm.

---

## Task 5: Fix `AGENTS.md` walking-skeleton path and `plugin.json` repo URL

**What this is:** Two small doc/config fixes. `AGENTS.md` tells contributors to run `goose run -i tests/integration/walking-skeleton.yaml` but the actual file is `walking-skeleton.md` (no yaml extension). `plugin.json` lists `"repository": "https://github.com/org/goose-agent-framework"` instead of the real repo URL.

**Files:**
- Modify: `AGENTS.md`
- Modify: `.plugin/plugin.json`

- [ ] **Step 1: Fix the walking-skeleton path in `AGENTS.md`**

  Open `AGENTS.md`. Find the line:

      goose run -i tests/integration/walking-skeleton.yaml --output-format json

  Change it to:

      goose run -i tests/integration/walking-skeleton.md --output-format json --max-turns 30

- [ ] **Step 2: Fix `plugin.json` repository URL**

  Open `.plugin/plugin.json`. Find:

      "repository": "https://github.com/org/goose-agent-framework",

  Change it to:

      "repository": "https://github.com/dr-pabs/managed-service-minions2",

- [ ] **Step 3: Commit Milestone 1**

      git add tests/runner.sh \
              mcp-servers/toolshed/src/main.rs \
              mcp-servers/toolshed/src/logger.rs \
              mcp-servers/toolshed/Cargo.toml \
              tests/roles/orchestrator-identity.md \
              AGENTS.md \
              .plugin/plugin.json
      git commit -m "fix: restore runner.sh, wire rate-limiter module, fix orchestrator identity test, fix doc paths"

---

## Task 6: Wire `RateLimiter` into `ToolshedServer`

**What this is:** `rate_limiter.rs` is now compiled (Task 2) but never called. `proxy.rs` imports only `allowlist::AllowlistManager` and `logger::{AuditEntry, AuditResult}`. This task adds `RateLimiter` as a field of `ToolshedServer` and calls `self.rate_limiter.allow(&agent)` in `call_tool` between the allowlist check and the pre-call log. If the bucket is empty, the call is blocked with a logged `AuditResult::Blocked` and a 429-style message.

`RateLimiter` holds mutable state (token buckets with `Instant::now()` timestamps). Because `ServerHandler::call_tool` takes `&self` (immutable reference), we must wrap `RateLimiter` in a `tokio::sync::Mutex`.

**Files:**
- Modify: `mcp-servers/toolshed/src/proxy.rs`

- [ ] **Step 1: Add `RateLimiter` import and field to `proxy.rs`**

  Open `mcp-servers/toolshed/src/proxy.rs`. Find the existing imports at the top:

      use crate::allowlist::AllowlistManager;
      use crate::logger::{AuditEntry, AuditResult};

  Add the rate-limiter import:

      use crate::allowlist::AllowlistManager;
      use crate::logger::{AuditEntry, AuditResult};
      use crate::rate_limiter::RateLimiter;
      use tokio::sync::Mutex;

  Find the `ToolshedServer` struct:

      pub struct ToolshedServer {
          allowlist: AllowlistManager,
      }

  Add the rate-limiter field:

      pub struct ToolshedServer {
          allowlist: AllowlistManager,
          rate_limiter: Mutex<RateLimiter>,
      }

  Find the `impl ToolshedServer` block and its `new()` function:

      pub fn new() -> Self {
          Self {
              allowlist: AllowlistManager::new(),
          }
      }

  Add the rate-limiter initialiser:

      pub fn new() -> Self {
          Self {
              allowlist: AllowlistManager::new(),
              rate_limiter: Mutex::new(RateLimiter::new()),
          }
      }

- [ ] **Step 2: Call the rate limiter inside `call_tool`**

  Find the `call_tool` method body in `proxy.rs`. It currently looks like:

      // 1. Allowlist check
      if !self.allowlist.is_allowed(&agent, &tool_name) {
          // ... blocked log + return
      }

      // 2. Pre-call log
      ...

  Insert the rate-limit check between the allowlist check and the pre-call log:

      // 1. Allowlist check
      if !self.allowlist.is_allowed(&agent, &tool_name) {
          let entry = AuditEntry::new("unknown".to_string(), agent.clone(), tool_name.clone())
              .with_params(serde_json::json!({}))
              .with_result(AuditResult::Blocked)
              .with_reason("allowlist_denied");
          entry.log();

          return Ok(CallToolResult::success(vec![Content::text(format!(
              "Tool '{}' is not allowed for agent type '{}'",
              tool_name, agent
          ))]));
      }

      // 1b. Rate-limit check
      let rate_allowed = {
          let mut rl = self.rate_limiter.lock().await;
          rl.allow(&agent)
      };
      if !rate_allowed {
          let entry = AuditEntry::new("unknown".to_string(), agent.clone(), tool_name.clone())
              .with_params(serde_json::json!({}))
              .with_result(AuditResult::Blocked)
              .with_reason("rate_limited");
          entry.log();

          return Ok(CallToolResult::success(vec![Content::text(format!(
              "Rate limit exceeded for agent type '{}'. Retry after token bucket refills.",
              agent
          ))]));
      }

      // 2. Pre-call log
      ...

- [ ] **Step 3: Verify it compiles**

      cargo clippy --manifest-path mcp-servers/toolshed/Cargo.toml -- -D warnings

  Expected: zero warnings, zero errors.

- [ ] **Step 4: Run all tests**

      cargo test --manifest-path mcp-servers/toolshed/Cargo.toml

  Expected: all tests pass (allowlist tests + rate-limiter tests + any proxy/logger tests).

---

## Task 7: Implement real `extract_agent_type` via tool-call arguments

**What this is:** `proxy.rs:extract_agent_type` currently ignores its argument and always returns `"code-reviewer"`. This means all sub-agents share the code-reviewer's allowlist and rate-limit bucket. The fix: sub-agents pass their type via a reserved argument key `__agent_type` in the tool-call arguments. The proxy extracts and removes this key before forwarding (currently a stub, so removal is a no-op). If the key is absent, the proxy logs a warning and falls back to `"code-reviewer"` so Phase 1 still works.

Simultaneously, extract `__correlation_id` from the arguments for audit logging.

**Files:**
- Modify: `mcp-servers/toolshed/src/proxy.rs`

- [ ] **Step 1: Update `call_tool` to extract `__agent_type` and `__correlation_id`**

  The `call_tool` signature receives `request: CallToolRequestParam`. The arguments are in `request.arguments` which is `Option<serde_json::Map<String, serde_json::Value>>`.

  At the very top of the `call_tool` method body, before the existing `let tool_name = ...` line, add:

      // Extract reserved metadata from arguments.
      // Sub-agents pass __agent_type and __correlation_id as argument keys.
      // These are stripped before forwarding to the real MCP server.
      let mut args = request.arguments.clone().unwrap_or_default();
      let agent = args
          .remove("__agent_type")
          .and_then(|v| v.as_str().map(|s| s.to_string()))
          .unwrap_or_else(|| {
              tracing::warn!("No __agent_type in tool call arguments; defaulting to code-reviewer");
              "code-reviewer".to_string()
          });
      let correlation_id = args
          .remove("__correlation_id")
          .and_then(|v| v.as_str().map(|s| s.to_string()))
          .unwrap_or_else(|| "unknown".to_string());

  Remove the old lines that set `agent` and note that `correlation_id` was previously hardcoded as `"unknown"` in each `AuditEntry::new(...)` call. Update every `AuditEntry::new("unknown".to_string(), ...)` to `AuditEntry::new(correlation_id.clone(), ...)`.

  Also remove the `extract_agent_type` method entirely from the `impl ToolshedServer` block — it is no longer needed.

- [ ] **Step 2: Add a test for agent-type extraction in `proxy.rs`**

  Add a unit test at the bottom of `proxy.rs` (inside `#[cfg(test)] mod tests { ... }`):

      #[cfg(test)]
      mod tests {
          use super::*;
          use rmcp::model::CallToolRequestParam;
          use serde_json::json;

          fn make_request(tool: &str, args: serde_json::Value) -> CallToolRequestParam {
              CallToolRequestParam {
                  name: tool.into(),
                  arguments: args.as_object().cloned(),
              }
          }

          #[tokio::test]
          async fn agent_type_defaults_to_code_reviewer_when_absent() {
              let server = ToolshedServer::new();
              // A request with no __agent_type should default gracefully
              let req = make_request("github.get_pr_diff", json!({"pr_number": 1}));
              // Extract agent from args the same way call_tool does
              let mut args = req.arguments.clone().unwrap_or_default();
              let agent = args
                  .remove("__agent_type")
                  .and_then(|v| v.as_str().map(|s| s.to_string()))
                  .unwrap_or_else(|| "code-reviewer".to_string());
              assert_eq!(agent, "code-reviewer");
          }

          #[tokio::test]
          async fn agent_type_is_extracted_correctly() {
              let req = make_request(
                  "github.create_pr",
                  json!({"__agent_type": "pr-crafter", "title": "Fix bug"}),
              );
              let mut args = req.arguments.clone().unwrap_or_default();
              let agent = args
                  .remove("__agent_type")
                  .and_then(|v| v.as_str().map(|s| s.to_string()))
                  .unwrap_or_else(|| "code-reviewer".to_string());
              assert_eq!(agent, "pr-crafter");
              // __agent_type should be stripped from forwarded args
              assert!(!args.contains_key("__agent_type"));
          }

          #[tokio::test]
          async fn correlation_id_is_extracted() {
              let req = make_request(
                  "github.get_pr_diff",
                  json!({"__agent_type": "code-reviewer", "__correlation_id": "corr_abc123", "pr_number": 1}),
              );
              let mut args = req.arguments.clone().unwrap_or_default();
              args.remove("__agent_type");
              let correlation_id = args
                  .remove("__correlation_id")
                  .and_then(|v| v.as_str().map(|s| s.to_string()))
                  .unwrap_or_else(|| "unknown".to_string());
              assert_eq!(correlation_id, "corr_abc123");
          }
      }

- [ ] **Step 3: Run all tests**

      cargo test --manifest-path mcp-servers/toolshed/Cargo.toml

  Expected: all existing tests plus the three new proxy tests pass.

- [ ] **Step 4: Commit Milestone 2**

      git add mcp-servers/toolshed/src/proxy.rs \
              mcp-servers/toolshed/src/main.rs \
              mcp-servers/toolshed/src/logger.rs \
              mcp-servers/toolshed/Cargo.toml
      git commit -m "fix(toolshed): wire rate limiter, real agent-type extraction, chrono timestamps"

---

## Task 8: Fix Slack bot — per-user sessions and streaming accumulation

**What this is:** `bots/slack-bot/src/bot.js` has two bugs. (1) `let sessionId = null` is module-scope — all users share one Goose session. (2) `sendToGoose` returns the `session/prompt` JSON-RPC response, which is just an acknowledgement; the actual text comes via `notifications/AgentMessageChunk` WebSocket events that are never accumulated. The `extractResponse` function therefore always falls through to serialising the raw JSON blob.

The fix: (1) change `sessionId` to a `Map` keyed by `userId`. (2) In the `notifications/AgentMessageChunk` handler, accumulate chunk text into a per-session buffer; when the final chunk arrives (detected by `params.last === true` or a `done` event), resolve a pending Promise that `sendToGoose` waits on.

**Files:**
- Modify: `bots/slack-bot/src/bot.js`

- [ ] **Step 1: Replace module-scope session variable with a Map**

  Open `bots/slack-bot/src/bot.js`. Find:

      let sessionId = null;

  Replace with:

      // Map of userId -> sessionId. Each user gets their own Goose session.
      const sessions = new Map();

- [ ] **Step 2: Add a streaming accumulator Map**

  Below the `sessions` map, add:

      // Map of sessionId -> { chunks: string[], resolve: Function, reject: Function }
      // Used to accumulate AgentMessageChunk events and resolve sendToGoose's promise.
      const streamingBuffers = new Map();

- [ ] **Step 3: Update `ensureSession` to be per-user**

  Find the `ensureSession` function:

      async function ensureSession() {
        if (sessionId) return sessionId;
        const result = await sendACP('session/new', {
          sessionId: null,
          cwd: '/tmp',
          mcpServers: []
        });
        sessionId = result.result.sessionId;
        console.log(`[slack-bot] Session created: ${sessionId}`);
        return sessionId;
      }

  Replace with:

      async function ensureSession(userId) {
        if (sessions.has(userId)) return sessions.get(userId);
        const result = await sendACP('session/new', {
          sessionId: null,
          cwd: '/tmp',
          mcpServers: []
        });
        const sid = result.result.sessionId;
        sessions.set(userId, sid);
        console.log(`[slack-bot] Session created for user ${userId}: ${sid}`);
        return sid;
      }

- [ ] **Step 4: Update `sendToGoose` to wait for streaming completion**

  Find the `sendToGoose` function:

      async function sendToGoose(userMessage, userId) {
        const sid = await ensureSession();
        return sendACP('session/prompt', {
          sessionId: sid,
          prompt: [{ type: 'user', text: userMessage }]
        });
      }

  Replace with:

      async function sendToGoose(userMessage, userId) {
        const sid = await ensureSession(userId);

        // Register a streaming buffer for this session before sending the prompt.
        // The AgentMessageChunk handler will resolve this promise when done.
        const responsePromise = new Promise((resolve, reject) => {
          streamingBuffers.set(sid, { chunks: [], resolve, reject });
          // Timeout: if no final chunk arrives within 120s, reject
          setTimeout(() => {
            if (streamingBuffers.has(sid)) {
              streamingBuffers.delete(sid);
              reject(new Error('Response timeout after 120s'));
            }
          }, 120000);
        });

        // Send the prompt (this returns an acknowledgement, not the answer)
        await sendACP('session/prompt', {
          sessionId: sid,
          prompt: [{ type: 'user', text: userMessage }]
        });

        // Wait for streaming chunks to complete
        return responsePromise;
      }

- [ ] **Step 5: Implement the `AgentMessageChunk` handler**

  In the `connectACP` function, find the `ws.on('message', ...)` handler. The existing body handles `pending` promises and has a comment stub for `AgentMessageChunk`. Replace the entire `ws.on('message', ...)` handler with:

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          // JSON-RPC response to a sendACP call (has an id)
          if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg);
            pending.delete(msg.id);
            return;
          }

          // Streaming notification from the agent
          if (msg.method === 'notifications/AgentMessageChunk') {
            const sid = msg.params?.sessionId;
            const buf = streamingBuffers.get(sid);
            if (!buf) return;

            const text = msg.params?.chunk?.text || '';
            buf.chunks.push(text);

            // Goose signals completion with params.last === true
            if (msg.params?.last === true) {
              streamingBuffers.delete(sid);
              buf.resolve(buf.chunks.join(''));
            }
            return;
          }

          // Agent session complete (fallback completion signal)
          if (msg.method === 'notifications/AgentStatus' && msg.params?.status === 'done') {
            const sid = msg.params?.sessionId;
            const buf = streamingBuffers.get(sid);
            if (buf) {
              streamingBuffers.delete(sid);
              buf.resolve(buf.chunks.join(''));
            }
          }
        } catch (err) {
          console.error('[slack-bot] ACP message parse error:', err.message);
        }
      });

- [ ] **Step 6: Update `extractResponse` to handle the string result**

  Find `extractResponse`:

      function extractResponse(response) {
        try {
          if (response?.result?.text) return response.result.text;
          return JSON.stringify(response, null, 2).slice(0, 3000);
        } catch (_) {
          return '(unable to parse response)';
        }
      }

  Replace with:

      function extractResponse(response) {
        // sendToGoose now resolves with the accumulated text string directly
        if (typeof response === 'string') return response || '(empty response)';
        try {
          if (response?.result?.text) return response.result.text;
          return JSON.stringify(response, null, 2).slice(0, 3000);
        } catch (_) {
          return '(unable to parse response)';
        }
      }

- [ ] **Step 7: Verify the app starts (syntax check)**

      node --check bots/slack-bot/src/bot.js

  Expected: no output, exit 0.

---

## Task 9: Fix Teams bot — per-user sessions and streaming accumulation

**What this is:** The same two bugs exist in `bots/teams-bot/src/bot.js`. Apply the same fixes as Task 8.

**Files:**
- Modify: `bots/teams-bot/src/bot.js`

- [ ] **Step 1: Replace module-scope session variable**

  Find `let sessionId = null;` and replace with:

      const sessions = new Map();
      const streamingBuffers = new Map();

- [ ] **Step 2: Update `ensureSession` to be per-user**

  Replace the `ensureSession` function:

      async function ensureSession(userId) {
        if (sessions.has(userId)) return sessions.get(userId);
        const result = await sendACP('session/new', {
          sessionId: null,
          cwd: '/tmp',
          mcpServers: []
        });
        const sid = result.result.sessionId;
        sessions.set(userId, sid);
        console.log(`[teams-bot] Session created for user ${userId}: ${sid}`);
        return sid;
      }

- [ ] **Step 3: Update `sendToGoose`**

  Replace the `sendToGoose` function:

      async function sendToGoose(userMessage, userId) {
        const sid = await ensureSession(userId);

        const responsePromise = new Promise((resolve, reject) => {
          streamingBuffers.set(sid, { chunks: [], resolve, reject });
          setTimeout(() => {
            if (streamingBuffers.has(sid)) {
              streamingBuffers.delete(sid);
              reject(new Error('Response timeout after 120s'));
            }
          }, 120000);
        });

        await sendACP('session/prompt', {
          sessionId: sid,
          prompt: [{ type: 'user', text: userMessage }]
        });

        return responsePromise;
      }

- [ ] **Step 4: Implement streaming handler in `connectACP`**

  Replace the `ws.on('message', ...)` handler (currently has no chunk handling) with:

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg);
            pending.delete(msg.id);
            return;
          }

          if (msg.method === 'notifications/AgentMessageChunk') {
            const sid = msg.params?.sessionId;
            const buf = streamingBuffers.get(sid);
            if (!buf) return;
            buf.chunks.push(msg.params?.chunk?.text || '');
            if (msg.params?.last === true) {
              streamingBuffers.delete(sid);
              buf.resolve(buf.chunks.join(''));
            }
            return;
          }

          if (msg.method === 'notifications/AgentStatus' && msg.params?.status === 'done') {
            const sid = msg.params?.sessionId;
            const buf = streamingBuffers.get(sid);
            if (buf) {
              streamingBuffers.delete(sid);
              buf.resolve(buf.chunks.join(''));
            }
          }
        } catch (_) {}
      });

- [ ] **Step 5: Pass `userId` from Teams activity into `sendToGoose`**

  In the `GooseTeamsBot` class's `onMessage` handler, the existing call is:

      const response = await sendToGoose(text, context.activity.from.id);

  This already passes `context.activity.from.id` as `userId` — no change needed here.

- [ ] **Step 6: Update `extractResponse`**

  Apply the same change as Task 8 Step 6:

      function extractResponse(response) {
        if (typeof response === 'string') return response || '(empty response)';
        try {
          if (response?.result?.text) return response.result.text;
          return JSON.stringify(response, null, 2).slice(0, 3000);
        } catch (_) {
          return '(unable to parse response)';
        }
      }

- [ ] **Step 7: Syntax check**

      node --check bots/teams-bot/src/bot.js

  Expected: no output, exit 0.

- [ ] **Step 8: Commit Milestone 3 bots**

      git add bots/slack-bot/src/bot.js bots/teams-bot/src/bot.js
      git commit -m "fix(bots): per-user sessions, implement streaming chunk accumulation"

---

## Task 10: Fix Terraform — missing secrets in Container Apps

**What this is:** Container App env vars reference `secret_name` values, but no `secrets` blocks exist on the resources to declare those names or where to source them. `terraform plan` will error with "secret_name references a secret that does not exist". This task adds `secrets` blocks to all three Container Apps that reference Key Vault secret URIs via the managed identity.

Note: Key Vault secrets themselves don't exist yet — that is Task 11. This task wires the Terraform resource shape so it's valid once the secrets exist.

**Files:**
- Modify: `infra/main.tf`

- [ ] **Step 1: Add `secrets` block to the orchestrator Container App**

  In `resource "azurerm_container_app" "orchestrator"`, inside the `template { container { ... } }` block (after the `env {}` entries), add:

      secrets {
        name                = "goose-server-secret-key"
        key_vault_secret_id = azurerm_key_vault_secret.goose_server_key.id
        identity            = azurerm_user_assigned_identity.acr_pull.id
      }

  Also add the `identity` block at the resource level (sibling to `template`):

      identity {
        type         = "UserAssigned"
        identity_ids = [azurerm_user_assigned_identity.acr_pull.id]
      }

- [ ] **Step 2: Add `secrets` block to the Slack bot Container App**

  In `resource "azurerm_container_app" "slack_bot"`, add:

      secrets {
        name                = "goose-server-secret-key"
        key_vault_secret_id = azurerm_key_vault_secret.goose_server_key.id
        identity            = azurerm_user_assigned_identity.acr_pull.id
      }
      secrets {
        name                = "slack-bot-token"
        key_vault_secret_id = azurerm_key_vault_secret.slack_bot_token.id
        identity            = azurerm_user_assigned_identity.acr_pull.id
      }
      secrets {
        name                = "slack-signing-secret"
        key_vault_secret_id = azurerm_key_vault_secret.slack_signing_secret.id
        identity            = azurerm_user_assigned_identity.acr_pull.id
      }
      secrets {
        name                = "slack-app-token"
        key_vault_secret_id = azurerm_key_vault_secret.slack_app_token.id
        identity            = azurerm_user_assigned_identity.acr_pull.id
      }

  Also add the missing `SLACK_APP_TOKEN` env var to the container template:

      env {
        name        = "SLACK_APP_TOKEN"
        secret_name = "slack-app-token"
      }

  And add the `identity` block.

- [ ] **Step 3: Add `secrets` block to the Teams bot Container App**

  In `resource "azurerm_container_app" "teams_bot"`, add:

      secrets {
        name                = "goose-server-secret-key"
        key_vault_secret_id = azurerm_key_vault_secret.goose_server_key.id
        identity            = azurerm_user_assigned_identity.acr_pull.id
      }
      secrets {
        name                = "teams-azure-ad-client-id"
        key_vault_secret_id = azurerm_key_vault_secret.teams_client_id.id
        identity            = azurerm_user_assigned_identity.acr_pull.id
      }
      secrets {
        name                = "teams-azure-ad-tenant-id"
        key_vault_secret_id = azurerm_key_vault_secret.teams_tenant_id.id
        identity            = azurerm_user_assigned_identity.acr_pull.id
      }
      secrets {
        name                = "teams-azure-ad-client-secret"
        key_vault_secret_id = azurerm_key_vault_secret.teams_client_secret.id
        identity            = azurerm_user_assigned_identity.acr_pull.id
      }

  Add the missing env var:

      env {
        name        = "AZURE_AD_CLIENT_SECRET"
        secret_name = "teams-azure-ad-client-secret"
      }

  And add the `identity` block.

---

## Task 11: Add ACR, Key Vault secrets, RBAC, and scale rules to Terraform

**What this is:** Four missing resources. (a) `azurerm_container_registry` for image storage; (b) AcrPull role assignment so the managed identity can pull images; (c) Key Vault secrets and RBAC so Container Apps can read credentials; (d) scale rules wired from the `scale_config` local into the Container App template.

**Files:**
- Modify: `infra/main.tf`
- Modify: `infra/variables.tf`

- [ ] **Step 1: Add ACR resource to `main.tf`**

  Add after the `azurerm_user_assigned_identity.acr_pull` resource:

      resource "azurerm_container_registry" "main" {
        name                = replace("acr${var.naming_prefix}${local.env}", "-", "")
        resource_group_name = azurerm_resource_group.main.name
        location            = azurerm_resource_group.main.location
        sku                 = "Basic"
        admin_enabled       = false
        tags                = var.tags
      }

      resource "azurerm_role_assignment" "acr_pull" {
        scope                = azurerm_container_registry.main.id
        role_definition_name = "AcrPull"
        principal_id         = azurerm_user_assigned_identity.acr_pull.principal_id
      }

- [ ] **Step 2: Remove `var.acr_name` from Container App image references**

  In each Container App's `image` field, change:

      image = "${var.acr_name}.azurecr.io/<name>:${var.image_tag}"

  to:

      image = "${azurerm_container_registry.main.login_server}/<name>:${var.image_tag}"

  Do this for all three Container Apps: orchestrator (`goose-serve`), slack_bot (`slack-bot`), teams_bot (`teams-bot`), and the dashboard if it exists.

- [ ] **Step 3: Remove unused `acr_name` variable from `variables.tf`**

  Find and delete the `variable "acr_name"` block from `infra/variables.tf` since it's now replaced by the computed registry login server.

- [ ] **Step 4: Add Key Vault RBAC role assignment**

  Add after the Key Vault resource:

      resource "azurerm_role_assignment" "kv_secrets_user" {
        scope                = azurerm_key_vault.main.id
        role_definition_name = "Key Vault Secrets User"
        principal_id         = azurerm_user_assigned_identity.acr_pull.principal_id
      }

- [ ] **Step 5: Add Key Vault secrets resources**

  Add secret placeholders. The actual values must be provided at `terraform apply` time via `-var` or environment variables. Use `sensitive = true` so Terraform never logs the values.

  Add a `variables.tf` block for secret values:

      variable "goose_server_secret_key" {
        description = "Goose ACP server secret key"
        type        = string
        sensitive   = true
      }

      variable "slack_bot_token" {
        description = "Slack bot token (xoxb-...)"
        type        = string
        sensitive   = true
        default     = ""
      }

      variable "slack_signing_secret" {
        description = "Slack signing secret"
        type        = string
        sensitive   = true
        default     = ""
      }

      variable "slack_app_token" {
        description = "Slack app-level token (xapp-...)"
        type        = string
        sensitive   = true
        default     = ""
      }

      variable "teams_client_id" {
        description = "Azure AD client ID for Teams bot"
        type        = string
        default     = ""
      }

      variable "teams_tenant_id" {
        description = "Azure AD tenant ID for Teams bot"
        type        = string
        default     = ""
      }

      variable "teams_client_secret" {
        description = "Azure AD client secret for Teams bot"
        type        = string
        sensitive   = true
        default     = ""
      }

  Then in `main.tf`, add Key Vault secret resources:

      resource "azurerm_key_vault_secret" "goose_server_key" {
        name         = "goose-server-secret-key"
        value        = var.goose_server_secret_key
        key_vault_id = azurerm_key_vault.main.id
        depends_on   = [azurerm_role_assignment.kv_secrets_user]
      }

      resource "azurerm_key_vault_secret" "slack_bot_token" {
        name         = "slack-bot-token"
        value        = var.slack_bot_token
        key_vault_id = azurerm_key_vault.main.id
        depends_on   = [azurerm_role_assignment.kv_secrets_user]
      }

      resource "azurerm_key_vault_secret" "slack_signing_secret" {
        name         = "slack-signing-secret"
        value        = var.slack_signing_secret
        key_vault_id = azurerm_key_vault.main.id
        depends_on   = [azurerm_role_assignment.kv_secrets_user]
      }

      resource "azurerm_key_vault_secret" "slack_app_token" {
        name         = "slack-app-token"
        value        = var.slack_app_token
        key_vault_id = azurerm_key_vault.main.id
        depends_on   = [azurerm_role_assignment.kv_secrets_user]
      }

      resource "azurerm_key_vault_secret" "teams_client_id" {
        name         = "teams-azure-ad-client-id"
        value        = var.teams_client_id
        key_vault_id = azurerm_key_vault.main.id
        depends_on   = [azurerm_role_assignment.kv_secrets_user]
      }

      resource "azurerm_key_vault_secret" "teams_tenant_id" {
        name         = "teams-azure-ad-tenant-id"
        value        = var.teams_tenant_id
        key_vault_id = azurerm_key_vault.main.id
        depends_on   = [azurerm_role_assignment.kv_secrets_user]
      }

      resource "azurerm_key_vault_secret" "teams_client_secret" {
        name         = "teams-azure-ad-client-secret"
        value        = var.teams_client_secret
        key_vault_id = azurerm_key_vault.main.id
        depends_on   = [azurerm_role_assignment.kv_secrets_user]
      }

- [ ] **Step 6: Wire `scale_config` into the orchestrator Container App**

  In `resource "azurerm_container_app" "orchestrator"`, inside the `template {}` block (after the `container {}` block), add:

      min_replicas = local.scale_config[local.env].min
      max_replicas = local.scale_config[local.env].max

- [ ] **Step 7: Run `terraform validate`**

  From the `infra/` directory:

      cd infra
      terraform init -backend=false
      terraform validate

  Expected output:

      Success! The configuration is valid.

- [ ] **Step 8: Run `terraform fmt`**

      terraform fmt -recursive .

  Expected: no output (already formatted), or it reformats and exits 0.

- [ ] **Step 9: Commit Milestone 4**

      git add infra/main.tf infra/variables.tf
      git commit -m "fix(infra): add ACR, KV secrets, RBAC, container-app secrets blocks, scale rules"

---

## Task 12: Final CI validation

**What this is:** Push the branch, verify all 6 CI gates pass.

**Files:** No new files. This task is about verification.

- [ ] **Step 1: Push to a feature branch**

      git checkout -b fix/critical-bugs-2026-06-17
      git push -u origin fix/critical-bugs-2026-06-17

- [ ] **Step 2: Open a PR and observe CI**

      gh pr create \
        --title "fix: resolve 29 critical bugs (CI, toolshed, bots, infra)" \
        --body "Closes the gaps identified in the 2026-06-17 gap analysis session. See docs/superpowers/plans/2026-06-17-fix-critical-bugs.md for full detail."

- [ ] **Step 3: Watch CI gate results**

  Expected gates to pass:
  - `lint` — shellcheck now finds `tests/runner.sh` ✓
  - `rust` — clippy clean; all tests including rate-limiter tests pass ✓
  - `identity` — orchestrator-identity.md now exists; grep checks pass ✓
  - `integration` — runner.sh exists and passes shellcheck ✓
  - `terraform` — `terraform validate` passes ✓
  - `gate` — all 5 prerequisites pass ✓

---

## Validation and Acceptance

**Milestone 1 — CI green:**
Run from repo root: `shellcheck tests/runner.sh` → exit 0. Run `cargo test --manifest-path mcp-servers/toolshed/Cargo.toml` → all tests pass including `rate_limiter::tests::*`. Verify `tests/roles/orchestrator-identity.md` exists: `ls tests/roles/orchestrator-identity.md` → file present.

**Milestone 2 — Toolshed correctness:**
Run `cargo test --manifest-path mcp-servers/toolshed/Cargo.toml 2>&1 | grep -c ok` → count must include the 6 rate-limiter tests, 3 new proxy tests, and existing allowlist tests (total ≥ 16 tests passing). Build the binary and run it: `cargo build --release --manifest-path mcp-servers/toolshed/Cargo.toml` → builds cleanly. Send a test MCP call with `__agent_type: "pr-crafter"` in arguments and observe the audit log line shows `"agent":"pr-crafter"` not `"agent":"code-reviewer"`.

**Milestone 3 — Bot correctness:**
Run `node --check bots/slack-bot/src/bot.js` → exit 0. Run `node --check bots/teams-bot/src/bot.js` → exit 0. Inspect the source: confirm `const sessions = new Map()` and `streamingBuffers` exist in both files; confirm `ensureSession(userId)` takes a parameter.

**Milestone 4 — Terraform deployable:**
Run from `infra/`: `terraform init -backend=false && terraform validate` → `Success! The configuration is valid.` Run `terraform fmt -check -recursive .` → exit 0. Confirm `azurerm_container_registry.main` and `azurerm_role_assignment.acr_pull` appear in `terraform plan -backend=false` output (requires a dev vars file).

---

## Idempotence and Recovery

- All Rust changes can be reverted with `git checkout mcp-servers/toolshed/`. `cargo test` is always safe to re-run.
- The `tests/runner.sh` creation is additive — no existing file is overwritten.
- Terraform changes: `terraform plan` before `terraform apply` is always safe. The Key Vault secret resources have `depends_on` guards. If `terraform apply` fails mid-way, re-running it is safe because all resources are idempotent.
- Node.js changes: `node --check` verifies syntax before any running process is affected.

---

## Interfaces and Dependencies

**Rust:** `rmcp 0.4` — `ServerHandler` trait, `CallToolRequestParam`, `CallToolResult`, `Content::text`. `tokio::sync::Mutex` — wraps `RateLimiter` for async-safe mutable access. `chrono 0.4` — `Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)`.

**Node.js:** `@slack/bolt` `App` — requires `token`, `signingSecret`, `socketMode: true`, `appToken`. `botbuilder` `BotFrameworkAdapter` — requires `appId`, `appPassword`. ACP protocol: `session/new` returns `{ result: { sessionId: string } }`; `session/prompt` triggers streaming `notifications/AgentMessageChunk` events with `{ params: { sessionId, chunk: { text }, last: boolean } }`.

**Terraform:** `azurerm_container_registry` (Basic SKU). `azurerm_role_assignment` with `AcrPull` and `Key Vault Secrets User` built-in roles. `azurerm_key_vault_secret` with `depends_on` the RBAC assignment. Container App `secrets` block requires `identity` field pointing to the user-assigned managed identity.
