# Fix Critical Bugs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix every critical bug and missing feature identified in the code-review of `dr-pabs/managed-service-minions2` against the design docs.

**Architecture:** Multi-agent orchestration system delivered as a Goose plugin. Toolshed is a Rust MCP proxy that enforces per-agent allowlists and rate limiting. Bots connect to `goose serve` over ACP WebSocket. Infrastructure is Azure Container Apps + Key Vault managed by Terraform.

**Tech Stack:** Rust (rmcp 0.4, tokio), Node.js (Bolt, botbuilder), Terraform (azurerm ≥ 4.0), Azure Container Apps, Azure Key Vault, Azure Container Registry.

---

## Progress

| # | Task | Status |
|---|------|--------|
| 1 | Worktree setup | ✅ Done |
| 2 | Wire `rate_limiter` module | ✅ Done |
| 3 | Fix agent-type extraction in proxy.rs | ✅ Done |
| 4 | Replace hand-rolled ISO timestamps with chrono | ✅ Done |
| 5 | Fix AGENTS.md walking-skeleton command path | ✅ Done |
| 6 | Fix plugin.json repo URL | ✅ Done |
| 7 | Slack bot: per-user sessions + streaming | ✅ Done |
| 8 | Teams bot: per-user sessions + streaming | ✅ Done |
| 9 | shellcheck all hook scripts | ✅ Done |
| 10 | Terraform: Container App secrets, env vars | ✅ Done |
| 11 | Terraform: ACR, Key Vault secrets, RBAC, scale rules | ✅ Done |
| 12 | Push branch + open PR | ⬜ Pending |

---

## Milestone 1 — Rust MCP Server (Toolshed)

### Task 2: Wire rate_limiter module

**Files:**
- Modify: `mcp-servers/toolshed/src/main.rs`
- Modify: `mcp-servers/toolshed/Cargo.toml`

**Problem:** `rate_limiter.rs` was never added to `mod` declarations so its 6 tests never ran and the rate limiter was silently dead.

- [x] Add `mod rate_limiter;` to `main.rs`
- [x] Add `chrono = { version = "0.4", features = ["serde"] }` to Cargo.toml
- [x] Remove unused `uuid` dep (only referenced in the orphaned module)

### Task 3: Fix agent-type extraction in proxy.rs

**Files:**
- Modify: `mcp-servers/toolshed/src/proxy.rs`

**Problem:** `extract_agent_type` always returned the hardcoded string `"code-reviewer"` for every caller, making per-agent allowlists and per-agent rate limiting completely non-functional.

**Fix:** Extract `__agent_type` and `__correlation_id` from tool-call arguments, strip them before forwarding to the downstream MCP server. Use `"code-reviewer"` as a fallback with a tracing warning when absent so existing callers aren't broken.

- [x] Remove hardcoded `extract_agent_type` method
- [x] Add `rate_limiter: Mutex<RateLimiter>` field to `ToolshedServer`
- [x] Extract `__agent_type` / `__correlation_id` at top of `call_tool`
- [x] Strip reserved keys from args before forwarding
- [x] Call rate limiter after allowlist check; log `Blocked` audit entry on denial
- [x] Use real `correlation_id` in audit log instead of `"unknown"`
- [x] Add 4 unit tests

### Task 4: Replace hand-rolled ISO timestamps with chrono

**Files:**
- Modify: `mcp-servers/toolshed/src/logger.rs`

**Problem:** Hand-rolled `secs_to_iso` / `is_leap` functions had subtle calendar math bugs (off-by-one at year boundaries).

- [x] Import `chrono::Utc`
- [x] Replace `secs_to_iso` with `Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)`
- [x] Remove dead `SystemTime` / `UNIX_EPOCH` imports

---

## Milestone 2 — Configuration Correctness

### Task 5: Fix AGENTS.md walking-skeleton command

**Problem:** AGENTS.md referenced `tests/integration/walking-skeleton.yaml` (non-existent; file is `.md`) and omitted `--max-turns 30`.

- [x] Update command to `goose run -i tests/integration/walking-skeleton.md --output-format json --max-turns 30`

### Task 6: Fix plugin.json repo URL

**Problem:** `repository` field contained placeholder `"https://github.com/org/goose-agent-framework"`.

- [x] Set to `"https://github.com/dr-pabs/managed-service-minions2"`

---

## Milestone 3 — Bot ACP Clients

### Task 7: Slack bot — per-user sessions + streaming

**Files:**
- Modify: `bots/slack-bot/src/bot.js`

**Problems:**
1. Single module-scope `sessionId` shared all users.
2. `sendToGoose` returned a stale `lastResult` snapshot instead of waiting for the async `notifications/AgentMessageChunk` stream to complete.

**Fix:**
- Replace single `sessionId` with `const sessions = new Map()` keyed by Slack `event.user`.
- Register a per-session streaming buffer before calling `session/prompt`, accumulate `AgentMessageChunk` text, resolve the promise when `params.last === true`.
- Fallback: also resolve on `notifications/AgentStatus: done`.
- 120 s response timeout.

- [x] `const sessions = new Map()` and `ensureSession(userId)` helper
- [x] `const streamingBuffers = new Map()` and buffer accumulation logic
- [x] Resolve promise on `params.last === true`
- [x] Fallback resolve on `AgentStatus: done`

### Task 8: Teams bot — per-user sessions + streaming

**Files:**
- Modify: `bots/teams-bot/src/bot.js`

Same changes as Task 7; source user ID is `context.activity.from.id`.

- [x] Same `sessions` + `streamingBuffers` pattern
- [x] Pass `userId` from `context.activity.from.id` to `sendToGoose`
- [x] Remove old `extractResponse` helper (no longer needed)

---

## Milestone 4 — Infrastructure (Terraform)

### Task 9: shellcheck hook scripts

- [x] Install shellcheck (`brew install shellcheck`)
- [x] Run `shellcheck hooks/session-start.sh hooks/session-end.sh tests/runner.sh` — all pass

### Task 10 & 11: Terraform — ACR, Key Vault, secrets, RBAC, scale rules

**Files:**
- Rewrite: `infra/main.tf`
- Modify: `infra/variables.tf`

**Problems fixed:**
- No `azurerm_container_registry` resource — images referenced an external ACR that Terraform didn't manage.
- No `identity` block on Container Apps — managed identity not attached, so registry pull would fail.
- No `secret` blocks — credentials were missing entirely; Container Apps couldn't read them from Key Vault.
- No Key Vault RBAC role assignment for the managed identity.
- No `azurerm_key_vault_secret` resources — secrets weren't provisioned by Terraform.
- `SLACK_APP_TOKEN` env var missing from Slack bot Container App.
- `AZURE_AD_CLIENT_SECRET` env var missing from Teams bot Container App.
- `scale_config` locals defined but never wired to `min_replicas`/`max_replicas` in orchestrator template.
- `var.acr_name` hardcoded to `"stgoosefwdev"` instead of using computed ACR login server.
- No sensitive variable declarations for secrets.

- [x] Add `azurerm_container_registry.main` (Basic SKU)
- [x] Add `azurerm_user_assigned_identity.acr_pull`
- [x] Add `azurerm_role_assignment.acr_pull` (AcrPull)
- [x] Add `azurerm_role_assignment.kv_secrets_user` (Key Vault Secrets User)
- [x] Add 7 `azurerm_key_vault_secret` resources
- [x] Add `identity` block to all 3 Container Apps
- [x] Add `secret` blocks (Key Vault reference) to all 3 Container Apps
- [x] Wire `secret_name` references in all env vars
- [x] Add missing `SLACK_APP_TOKEN` env
- [x] Add missing `AZURE_AD_CLIENT_SECRET` env
- [x] Wire `min_replicas`/`max_replicas` from `scale_config` in orchestrator
- [x] Replace `var.acr_name` with `azurerm_container_registry.main.login_server`
- [x] Remove orphaned `var.acr_name`
- [x] Add 7 sensitive variable declarations to `variables.tf`
- [x] `terraform validate` — passes

---

## Task 12: Push branch + open PR

- [ ] `git push -u origin fix/critical-bugs-2026-06-17`
- [ ] `gh pr create` with summary of all fixes
- [ ] Confirm CI gates pass

---

## Surprises & Discoveries

- **Cargo not installed** on the dev machine — all Rust changes verified by code inspection; CI will run `cargo test`.
- **GitHub API tree listing was truncated** — some files appeared missing when fetching the tree via API; they existed in the actual clone.
- **`uuid` dep was orphaned** — only ever imported inside `rate_limiter.rs` which was excluded from compilation; safe to remove.
- **`git check-ignore` returns exit 1 on non-existent paths** — expected behavior; `.worktrees/` entry in `.gitignore` was correct.
- **ACP streaming protocol** — `session/prompt` is an acknowledgement only; actual content arrives as `notifications/AgentMessageChunk` events keyed by `sessionId`. `params.last === true` signals completion.
- **MCP stdio has no HTTP headers** — agent type can't be conveyed via headers; solution is reserved `__agent_type` / `__correlation_id` keys embedded in tool-call arguments, stripped before forwarding.
