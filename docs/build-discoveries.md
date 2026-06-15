# Build Discoveries — Goose Agent Framework

> **Date:** 2026-06-15\
> **Status:** Phase 1 build complete\
> **Purpose:** Consolidates every platform discovery, design correction, and architectural decision made during the Phase 1-2 build. Updates the architecture documentation so implementers work against reality, not assumptions.

______________________________________________________________________

## 1. Goose Platform (1.37.0)

### 1.1 Deployment Model

| Assumption (pre-build) | Reality (verified) |
|---|---|
| Goose is an importable library | Goose is a CLI binary. Deployed as `goose serve` (ACP server on port 3284), `goose run` (one-shot execution), or `goose session` (interactive) |
| Extensions are TypeScript packages | Extensions are MCP servers (stdio/HTTP) or platform extensions (bundled Rust). No TypeScript extension system exists |
| Extensions use `extension.toml` manifests | MCP servers connect via `type: stdio` with `cmd`/`args` in `config.yaml`. Platform extensions are bundled and enabled/disabled in config |

### 1.2 Plugin System

| Discovery | Impact |
|---|---|
| Plugins are the native packaging mechanism | One `goose plugin install <git-url>` delivers skills, agents, commands, rules, hooks, and tests |
| Agent discovery uses `.agents/agents/` | The `agents/` directory at repo root is invisible to `delegate`. Agents must live under `.agents/agents/` and be registered via `plugin.json` → `"agents": "./.agents/agents/"` |
| Skills use `.agents/skills/` | Same discovery rule as agents. Registered via `plugin.json` → `"skills": "./.agents/skills/"` |
| Plugins cannot bundle MCP servers | The plugin format is skills + hooks only. MCP servers are configured separately via `config.yaml` |
| Plugin install auto-imports skills | Office-town imported 6 skills on install. Our plugin's skills load automatically |
| Plugins have lifecycle hooks | `hooks/hooks.json` triggers scripts on `SessionStart` and `SessionEnd` |

### 1.3 Extension Inheritance

| Discovery | Impact |
|---|---|
| `delegate` inherits parent's extensions by default | Minions get ONLY the extensions we pass. Passing `extensions: ["toolshed"]` restricts them to governed tool access |
| `start_agent` creates bare sessions | No inherited tools. Failed when tested with a shell command. **Cannot** be used for minion dispatch |
| `delegate` is the ONLY minion spawning primitive | All minion types spawn via `delegate({ source: "<agent>", ... })` |
| Extensions list available tools | `summon` provides `delegate` and `load`. `developer` provides `shell`, `write`, `edit`, `tree` |

### 1.4 Tool & Primitive Verification

| Primitive | Source | Verified |
|---|---|---|
| `delegate` tool | `summon` extension (bundled, enabled) | ✅ Live test — spawned sub-agent that executed `ls` |
| `load` tool | `summon` extension | ✅ Collects async delegate results |
| `list_sessions` / `view_session` / `interrupt_agent` | `orchestrator` extension (disabled by default) | ✅ Control plane only. Not for minion dispatch |
| 17 total tools | `--with-builtin developer` session | ✅ Enumerated: analyze, apps\_\_*, delegate, edit, extensionmanager\_\_*, load, load_skill, shell, todo\_\_\*, tree, write |
| `platform__manage_schedule` | **Does not exist** | ❌ Listed in our `goose-capabilities-and-usage.md`. Scheduling uses `goose schedule` CLI instead |

### 1.5 Delegate API

| Field | Type | Purpose |
|---|---|---|
| `source` | string | Registered agent name (from plugin) or recipe name |
| `instructions` | string | Task description. Optional when paired with `source` |
| `parameters` | object | Typed inputs passed to the agent. e.g. `{ pr_number: 342, repo: "org/repo" }` |
| `extensions` | array | Extension names. Omit to inherit all. `["toolshed"]` for governed access |
| `max_turns` | integer | Turn limit. Overrides defaults |
| `async` | boolean | `true` → fire-and-forget, collect with `load`. `false` → synchronous |

**Evidence:** Live tool spec from goose 1.37.0. Office-town agents (`boss.md`, `worker.md`) demonstrate the agent-as-source pattern. Live test confirmed `delegate({ source: "code-reviewer", ... })` resolves and spawns successfully.

______________________________________________________________________

## 2. Architecture Corrections

### 2.1 Orchestrator

| Assumption | Reality |
|---|---|
| Orchestrator is an MCP server or TypeScript extension | Orchestrator is a **skill** (`SKILL.md`) loaded by the plugin. It uses `delegate`/`load` tools directly without custom code |
| Single-minion dispatch only | Phase 2 adds DAG decomposition: `ticket_fix_pr` (4-stage sequential) and `daily_review` (parallel fan-out) |
| Intent classification uses regex | LLM-driven classification in the recipe instructions. More flexible for natural language variations |

### 2.2 Minions (Agents)

| Assumption | Reality |
|---|---|
| Minions are recipes (`recipe.yaml`) | Minions are **agent definitions** (`.md` files with YAML frontmatter). Recipes are for standalone task definitions |
| Minions need code to define their behavior | Agent `.md` files are the complete contract — role, tools, process, output schema, guidelines. No code needed |
| Minion output is unstructured | Every agent defines a structured JSON output schema. The orchestrator validates minimal required fields |
| Only code-reviewer is fully implemented | All 5 agents now have full prompts, tools, and output schemas |

### 2.3 Toolshed

| Assumption | Reality |
|---|---|
| Toolshed is part of the plugin | Toolshed is an **external MCP server** (Rust, `rmcp`, stdio transport). Plugins cannot bundle MCP servers |
| Toolshed connects via `--with-extension` | Registered persistently via `goose configure --add-extension` into `config.yaml` |
| Toolshed just passes through tool calls | Toolshed enforces allowlists, rate limiting, and audit logging before forwarding to real MCP servers |

### 2.4 Bot Adapters

| Assumption | Reality |
|---|---|
| Bots are standalone webhook services that call MCP tools | Bots are **thin ACP WebSocket clients** connecting to `goose serve`. They bridge messages without reimplementing the agent loop |
| Bots need custom MCP tool calling | Bots use ACP protocol: `initialize` → `session/new` → `session/prompt` |

### 2.5 Sessions & State

| Assumption | Reality |
|---|---|
| We need to build our own session store | Goose sessions are SQLite-backed at `~/.local/share/goose/sessions/sessions.db` |
| Correlation IDs need custom propagation | Session hooks (`SessionStart`/`SessionEnd`) handle correlation ID initialization and journaling |
| Scheduling needs `platform__manage_schedule` | Scheduling uses `goose schedule` CLI command |

______________________________________________________________________

## 3. Infrastructure Corrections

### 3.1 Deployment Topology

| Component | Deployment | Image |
|---|---|---|
| Orchestrator (`goose serve`) | Container App, 1-5 replicas | `goose-serve:latest` (loads plugin + toolshed) |
| Slack bot | Container App, 1 replica | `goose-slack-bot:latest` (ACP client) |
| Teams bot | Container App, 1 replica | `goose-teams-bot:latest` (ACP client) |
| Dashboard | Container App or static site | `goose-dashboard:latest` (React → nginx) |
| Toolshed | Sidecar or separate MCP process | `goose-toolshed` (Rust binary) |

### 3.2 Terraform Updates (from build discoveries)

| Resource | Pre-build | Post-build |
|---|---|---|
| Container App: Orchestrator | Custom orchestrator app | `goose serve` with plugin + toolshed loaded |
| Container App: Toolshed | Not modeled | Toolshed MCP server registered via `--add-extension` |
| AI Foundry | `azurerm_ai_services` | `azurerm_cognitive_account` (deprecated resource) |
| Model deployments | `scale` block | `sku` block (schema change in provider v4) |
| Container App ingress | No traffic weights | `traffic_weight` blocks required for all 3 apps |
| Service Bus | `enable_partitioning` | Removed (unsupported argument) |

### 3.3 Docker Updates

| Issue | Fix |
|---|---|
| `npm ci` failed without lockfiles | Generated `package-lock.json` for all 3 packages (slack-bot, teams-bot, dashboard) |
| Goose binary location | Multi-stage build: COPY from `ghcr.io/aaif-goose/goose:1.37.0` |
| Plugin registration | `RUN goose plugin install /opt/goose-framework` in Dockerfile |
| Build artifacts in git | Added `target/` to `.gitignore` |

______________________________________________________________________

## 4. Test Corrections

### 4.1 Test Framework

| Assumption | Reality |
|---|---|
| `goose test` CLI exists | No. Tests use `goose run -i <file.md> --output-format json` |
| Tests are shell scripts | Tests are Markdown instruction files with structured JSON output expectations |
| Integration tests use YAML `steps`/`expect` | Goose feeds the file as instructions to the LLM. Test files must be explicit: "You are a test runner. Verify assertions. Return JSON report" |

### 4.2 Test Coverage (Phase 1-2)

| Layer | Tests | Assertions |
|---|---|---|
| Orchestrator identity | 1 file | 6 intents classified |
| Orchestrator edge cases | 1 file | 5 edge cases (empty, long, ambiguous, mixed case, whitespace) |
| Code reviewer identity | 1 file | 9 assertions |
| Code reviewer edge cases | 1 file | 4 edge cases |
| Code explorer identity | 1 file | 9 assertions |
| PR crafter identity | 1 file | 11 assertions |
| Ticket analyst identity | 1 file | 14 assertions |
| Security auditor identity | 1 file | 17 assertions |
| Walking skeleton | 1 file | 7 assertions (end-to-end) |
| **Total** | **9 test files** | **82 total assertions** |

### 4.3 Path Correction

All test files corrected from `agents/` → `.agents/agents/` and `skills/` → `.agents/skills/`. The goose discovery rule requires the `.agents/` prefix.

______________________________________________________________________

## 5. URL & Repository Corrections

| Reference | Old (wrong) | New (correct) |
|---|---|---|
| Goose documentation | `goose-docs.ai` (GooseAI inference API) | `goose-docs.ai` (same domain, different content — the agent framework docs) |
| Goose API | `goose.ai/docs/api` (GooseAI) | Not applicable — Goose is a CLI, not an API |
| Goose source | `aaif-goose/goose` (correct) | Confirmed: Goose 1.37.0, Apache 2.0, Agent AI Foundation |
| Plugin example | — | `jezweb/office-town-plugin` v0.5.3 |
| ACP spec | — | `agentclientprotocol/agent-client-protocol` RFN streamable-http-websocket-transport |
| Framework repo | — | `dr-pabs/managed-service-minions2` |

______________________________________________________________________

## 6. Key Decision Log (from build)

| # | Decision | Rationale |
|---|---|---|
| 1 | Framework is a goose plugin | Native packaging. One `goose plugin install` delivers everything |
| 2 | Minions are `agents/*.md` | Loaded by `delegate`. Markdown is the complete contract |
| 3 | Orchestrator is a skill | Procedural knowledge in `SKILL.md`. Uses `delegate`/`load` directly |
| 4 | Toolshed is external MCP server | Plugins cannot bundle MCP servers. Registered via `config.yaml` |
| 5 | Bot adapters are ACP clients | `goose serve` provides the bridge. Thin clients, no custom agent loop |
| 6 | Slash commands for direct access | `/review-pr`, `/triage-ticket`, `/security-scan` in goose sessions |
| 7 | Session hooks for cross-cutting | Correlation IDs on `SessionStart`, journals on `SessionEnd` |
| 8 | Built-in orchestrator for control plane | `list_sessions`, `view_session`, `interrupt_agent` only |
| 9 | `delegate` is the only minion spawner | `start_agent` creates bare sessions without tools |
| 10 | LLM-driven intent classification | More flexible than regex. Matches office-town dispatch pattern |
| 11 | Toolshed in `config.yaml` | Persistent registration. No `--with-extension` per invocation |
| 12 | Integration tests are `.md` instruction files | `goose run -i` provides structured validation |
| 13 | Scheduling via `goose schedule` CLI | `platform__manage_schedule` does not exist in goose 1.37.0 |
| 14 | Minions get only toolshed extension | `delegate` inherits parent's extensions — we restrict to governed access |

______________________________________________________________________

## 7. What Still Needs Verification

| Item | Blocker |
|---|---|
| Toolshed compilation | `cargo` not installed locally |
| Terratest execution | `go` not installed. Needs Azure subscription for integration tests |
| Identity test execution | `goose` provider configured. Tests pass with deepseek-v4-pro |
| Walking skeleton with real delegate + GitHub MCP | Needs `GITHUB_PERSONAL_ACCESS_TOKEN` and cargo-built toolshed |
| Infrastructure deployment | Needs Azure subscription credentials |
| Bot adapter connectivity | Needs `goose serve` running with ACP protocol |
