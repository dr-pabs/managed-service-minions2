# Phase 1 — Foundation: Orchestrator, Toolshed, and Bot Ingress

This ExecPlan is a living document. The sections **Progress**, **Surprises & Discoveries**, **Decision Log**, and **Outcomes & Retrospective** must be kept up to date as work proceeds.

This document must be maintained in accordance with PLANS.md at `.agents/PLANS.md` in the repository root. The reader should treat this ExecPlan as the sole source of truth for the Phase 1 delivery — no prior context, memory, or external knowledge is assumed.

> **Revision 5** (2026-06-15): Corrected agent discovery path. Goose resolves agents from `.agents/agents/` (not `agents/`). `delegate({ source: "code-reviewer" })` confirmed working via live test. Plugin manifest corrected to `"agents": "./.agents/agents/"`. Test runner script (`tests/runner.sh`) executes all 4 gates in one command.

## Purpose / Big Picture

Before this change, the Goose Agent Framework exists only as design documentation. Nothing runs.

After Phase 1 is complete:

```bash
# One command to install the entire framework
goose plugin install https://github.com/org/goose-agent-framework

# Send work from chat platforms
# Slack: "Review PR #342"  →  threaded reply with structured review
# Teams: "Review PR #342"  →  Adaptive Card with structured review

# Or interact directly in a goose session
goose session
> /review-pr 342
```

The orchestrator skill classifies the intent, delegates to the Code Reviewer agent, collects the structured result, and responds. The toolshed MCP server enforces allowlists on every tool call. Session hooks propagate correlation IDs and write audit journals.

This is the "walking skeleton" — one end-to-end path that proves the architecture before committing to the full multi-minion framework of later phases.

## Progress

- [x] Scaffold the plugin skeleton: `.plugin/plugin.json`, directory structure.
- [x] Write `.agents/skills/orchestrator/SKILL.md` — orchestration skill (classify → delegate → collect).
- [x] Write `.agents/agents/code-reviewer.md` — Code Reviewer sub-agent definition.
- [x] Write skeleton agents for other minion types (`.agents/agents/`).
- [x] Write `commands/review-pr.yaml` — `/review-pr` slash command.
- [x] Write `hooks/hooks.json` + session lifecycle scripts (correlation ID, journal).
- [x] Scaffold the toolshed MCP server (`mcp-servers/toolshed/` — Rust, `rmcp`).
- [x] Write integration & identity tests + test runner (`tests/runner.sh`).
- [x] Validate orchestrator identity (6/6 intents correct).
- [x] Validate code-reviewer identity (9/9 assertions passed).
- [x] Validate delegate spawn (`source: "code-reviewer"` resolved via `.agents/agents/`).
- [x] Scaffold Terraform infrastructure (`infra/` — providers, main, variables, outputs, 3 envs).
- [x] Write Terratest validation (`infra/tests/infra_test.go` — 6 tests, 5 resource types).
- [x] Move all top-level .md files into `docs/` — update cross-reference links.
- [x] Scaffold dashboard web app (`dashboard/` — React, 6 views, dark theme, mock data).
- [x] Scaffold Slack bot ACP client (`bots/slack-bot/` — Node.js, Bolt, WebSocket).
- [x] Scaffold Teams bot ACP client (`bots/teams-bot/` — Node.js, BotBuilder, Adaptive Cards).
- [ ] Deploy infrastructure to dev environment (`terraform plan -var-file=environments/dev.tfvars`).
- [ ] Update architecture docs with build discoveries (plugin system, ACP, delegate tool, .agents/).

## Surprises & Discoveries

*Collected during CLI investigation and documentation review. Ordered by impact on architecture.*

### Goose platform discoveries

- **2026-06-14 — Plugins are the native packaging mechanism.** `goose plugin install` delivers skills, agents, commands, rules, hooks, and tests as a single unit. Verified against `jezweb/office-town-plugin` v0.5.3. Replaces every assumption about standalone file layouts, manual `mkdir`, and multi-tier installation.

- **2026-06-14 — `goose run` is the test/execution primitive.** `goose run -i` with instruction files, `goose run --recipe` with parameters, `goose run -t` for inline text. Provides structured, repeatable integration tests. A unified test runner (`tests/runner.sh`) executes all 4 gates in one command.

- **2026-06-14 — `goose serve` provides the HTTP/WebSocket bridge.** Starts goose as a persistent ACP server on `127.0.0.1:3284` by default. Bot adapters are thin ACP clients connecting over WebSocket, not standalone webhook servers with custom MCP tool calling.

- **2026-06-14 — Sub-agents are `agents/*.md` files, not recipes.** The `delegate` tool loads agent definitions from the plugin's `agents/` directory. Office-town has `boss.md`, `librarian.md`, `scout.md`, `worker.md` — each an identity/role definition. Recipes (`recipe.yaml`) are for standalone task definitions, not sub-agent identities.

- **2026-06-14 — `delegate` spawns sub-agents successfully.** Proven with a live test: `goose run --with-builtin developer -t "Use the delegate tool..."` spawned a sub-agent that executed `ls` and returned results. The primitives work.

- **2026-06-14 — `goose info` confirms `summon` is bundled and enabled by default.** The `delegate` and `load` tools are always available — no configuration needed.

- **2026-06-14 — Sessions are SQLite-backed.** At `~/.local/share/goose/sessions/sessions.db`. Our session store design (correlation IDs in SQLite) aligns with the platform's native persistence.

- **2026-06-14 — Goose 1.37.0 is the target version.** Verified via `goose info`. Provider is Anthropic Claude Sonnet 4.6 in the current config, but the framework targets Azure AI Foundry for production deployment.

- **2026-06-14 — `goose plugin install` auto-imports skills.** Office-town imported 6 skills on install (`build`, `curate`, `dispatch`, `extract`, `scan`, `workflows`). Our plugins skills will load automatically.

- **2026-06-14 — Plugins have lifecycle hooks.** `hooks/hooks.json` triggers scripts on `SessionStart` and `SessionEnd`. This is how we inject correlation IDs and write audit journals — no custom code needed.

- **2026-06-14 — Goose 1.37.0 has a built-in `orchestrator` extension (disabled by default).** Provides 5 tools: `list_sessions`, `view_session`, `start_agent`, `send_message`, `interrupt_agent`. **Critical finding:** `start_agent` creates bare sessions with NO inherited tools — it failed when tested with a shell command. `delegate` (summon) is the correct primitive for spawning minions because it inherits the parent's extensions. Value of built-in orchestrator is the **control plane**: `list_sessions` (monitor running delegates), `view_session` (inspect results), `interrupt_agent` (cancel runaway delegates). NOT for minion dispatch.

- **2026-06-14 — Plugins cannot bundle MCP servers (Goose 1.37.0).** The plugin format is skills + hooks only. MCP extensions live in `config.yaml` or are passed via `--with-extension`. This validates our architecture: the toolshed is an external MCP server, connected persistently via `goose configure` (adds to `config.yaml`) rather than per-invocation `--with-extension`.

- **2026-06-14 — `platform__manage_schedule` does NOT exist as a tool in goose 1.37.0.** Listed in our `goose-capabilities-and-usage.md` as a cron scheduling primitive for Phase 4. Verified by listing all 17 available tools — absent. Scheduling is the `goose schedule` CLI command instead. Phase 4 must use the CLI, not a tool.

- **2026-06-14 — `apps__create_app` and `extensionmanager__*` tools are available.** The Apps extension provides dashboard scaffolding (`create_app`, `delete_app`, `iterate_app`, `list_apps`). Extension Manager provides `manage_extensions`, `search_available_extensions`, `list_resources`, `read_resource`. Both relevant for Phase 4 but available now.

- **2026-06-14 — Goose discovers agent sources from `.agents/agents/`, not `agents/`.** `delegate({ source: "code-reviewer" })` failed with `Source 'code-reviewer' not found` until agents were copied to `.agents/agents/`. The plugin must register `"agents": "./.agents/agents/"` in `plugin.json`. The `agents/` directory at repo root is invisible to delegate.

### Design corrections (from real goose source)

- **2026-06-14 — Extensions are MCP servers and platform extensions, not TypeScript packages.** The `aaif-goose/goose` source has no TypeScript extension system. MCP servers connect via stdio/HTTP. Platform extensions (`summon`, `developer`) are bundled Rust. Our `extension.toml` assumption was incorrect.

- **2026-06-14 — `delegate` is a tool, not an importable function.** Called as a tool within a goose session, provided by the `summon` platform extension. Our documentation incorrectly assumed it was an importable function.

- **2026-06-14 — Recipes use `type: stdio` for extensions, not `type: mcp`.** The recipe reference shows `{type: stdio, name: github-mcp, cmd: github-mcp-server, args: [], env_keys: [GITHUB_PERSONAL_ACCESS_TOKEN]}`. Our recipe templates needed this correction.

- **2026-06-14 — The URLs `goose-docs.ai` and `goose.ai` point to different products.** `goose.ai/docs/api` is GooseAI (inference API). `goose-docs.ai` is the correct documentation site for the Goose Agent Framework. The GitHub repo is `aaif-goose/goose` (formerly `block/goose`).

## Decision Log

| # | Date | Decision | Rationale |
|---|---|---|---|
| 1 | 2026-06-14 | Framework delivered as a goose plugin | Native packaging: `goose plugin install` delivers skills, agents, commands, rules, hooks. Matches `jezweb/office-town-plugin` pattern. |
| 2 | 2026-06-14 | Minions are `agents/*.md`, not recipes | goose sub-agents are defined as markdown files in the plugin's `agents/` directory. The `delegate` tool loads them. Recipes (`recipe.yaml`) are for standalone task definitions, not sub-agent identities. |
| 3 | 2026-06-14 | Orchestrator is a skill (`skills/orchestrator/SKILL.md`) | Skills teach goose how to route work. The orchestrator is a skill that classifies intents and delegates to the correct agent. |
| 4 | 2026-06-14 | Toolshed is an external MCP server, not part of the plugin | The toolshed must intercept tool calls at the MCP protocol level. Plugins cannot do this — they provide skills, not MCP-level proxies. Registered persistently via `goose configure --add-extension` into `config.yaml`. |
| 5 | 2026-06-14 | Bot adapters are external ACP clients | Persistent network services connecting to `goose serve`. Not includable in a plugin. |
| 6 | 2026-06-14 | Slash commands for direct access | `/review-pr 342` in a goose session invokes the orchestrator skill directly, no bot needed. |
| 7 | 2026-06-14 | Session hooks for correlation ID + journaling | `hooks/session-start.sh` initializes correlation IDs. `hooks/session-end.sh` writes audit journals to SQLite. |
| 8 | 2026-06-14 | Use built-in `orchestrator` extension for the control plane only | `start_agent` creates bare sessions with NO inherited tools — tested and failed. `delegate` is the only minion spawning primitive. Built-in orchestrator's value: `list_sessions` (monitor), `view_session` (inspect), `interrupt_agent` (cancel). |
| 9 | 2026-06-14 | `delegate` is the ONLY minion spawning primitive | `start_agent` rejected after live test — creates bare sessions without inherited tools. All minions spawn via `delegate(async: true)`. `load` collects results. Only `toolshed` extension is passed. |
| 10 | 2026-06-14 | Orchestrator classification is LLM-driven, not regex | Recipe instructions tell the LLM to classify user messages. More flexible (handles "check PR 342", "review pull request 342", "can you look at PR #342"). Matches office-town `dispatch` skill pattern. |
| 11 | 2026-06-14 | Toolshed registered via `config.yaml`, not `--with-extension` per invocation | `goose configure` adds the toolshed as a persistent MCP server entry. Eliminates `--with-extension "cargo run..."` on every command. |
| 12 | 2026-06-14 | Integration tests are YAML instruction files, not shell scripts | `goose run -i tests/integration/walking-skeleton.yaml --output-format json`. Matches office-town `tests/integration/*.yaml` pattern. |
| 13 | 2026-06-14 | Phase 4 scheduling uses `goose schedule` CLI | `platform__manage_schedule` does NOT exist in goose 1.37.0 (verified by listing all 17 tools). `goose schedule` CLI provides equivalent cron capability. |
| 14 | 2026-06-14 | Minions receive ONLY the `toolshed` extension via `delegate` | `delegate` inherits parent's extensions — we pass only `["toolshed"]`. Minions have no shell, file write, or edit access. All tool calls go through allowlist enforcement. |

## Outcomes & Retrospective

*Populated at completion.*

## Context and Orientation

### What we are building

The Goose Agent Framework is a multi-agent orchestration system delivered as a **goose plugin**. One `goose plugin install` deploys the orchestrator skill, five specialist agent definitions, slash commands, governance rules, session hooks, and integration tests.

The system ingests work from Slack/Teams (via ACP bot clients) or directly in goose sessions (via slash commands), classifies intent, delegates to specialist sub-agents, and returns structured results.

### The real goose plugin system

Verified against `jezweb/office-town-plugin` v0.5.3 and `goose info` output:

**Plugin manifest** (`.plugin/plugin.json` or `plugin.json`):

```json
{
    "name": "goose-agent-framework",
    "version": "0.1.0",
    "description": "Multi-agent orchestration framework for the Goose platform",
    "agents": "./.agents/agents/",
    "skills": "./.agents/skills/",
    "commands": "./commands/",
    "rules": "./rules/",
    "hooks": "./hooks/hooks.json"
}
```

**Plugin structure:**

| Directory | Purpose | Example |
|---|---|---|
| `skills/<name>/SKILL.md` | Teaches goose a workflow/procedure | `skills/orchestrator/SKILL.md` — classifies intents, delegates to agents |
| `agents/<name>.md` | Sub-agent identity/role definition | `agents/code-reviewer.md` — loaded by `delegate` tool |
| `commands/<name>.yaml` | Slash commands in goose sessions | `commands/review-pr.yaml` — `/review-pr 342` |
| `rules/` | Standing orders for the session | `rules/allowlist-rules.md` — governance constraints |
| `hooks/hooks.json` | Lifecycle trigger scripts | `session-start.sh` (correlation ID), `session-end.sh` (journal) |
| `tests/` | Integration and identity tests | `tests/integration/walking-skeleton.yaml` |

### Architecture overview

```
  Slack / Teams                         Goose Session
      │                                      │
      ▼                                      ▼
  Bot ACP Client  ──WS──▶  goose serve      /review-pr 342
      │                      │                  │
      │  sends message       │  plugin loaded   │  slash command
      ▼                      ▼                  ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  goose-agent-framework plugin (installed via install)        │
  │                                                              │
  │  hooks/session-start.sh                                      │
  │    └── Initialize correlation ID, set up session store       │
  │                                                              │
  │  skills/orchestrator/SKILL.md                                │
  │    └── Classify intent → delegate to agent → collect result  │
  │                                                              │
  │  agents/code-reviewer.md                                     │
  │    └── Sub-agent: "You are a code reviewer..."               │
  │    └── Extensions: [toolshed]  ← only toolshed               │
  │                                                              │
  │  agents/{code-explorer,pr-crafter,ticket-analyst,            │
  │          security-auditor}.md                                │
  │    └── Skeleton definitions for Phase 2-3                    │
  │                                                              │
  │  commands/review-pr.yaml                                     │
  │    └── /review-pr <number> → orchestrator skill              │
  │                                                              │
  │  hooks/session-end.sh                                        │
  │    └── Write session journal to SQLite                       │
  └──────────────────────┬──────────────────────────────────────┘
                         │  delegate spawns agent with
                         │  extensions: [toolshed]
                         ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  Toolshed MCP server (mcp-servers/toolshed/)                 │
  │                                                              │
  │  Wraps GitHub MCP with:                                     │
  │    ├── Allowlist check (per agent type)                      │
  │    ├── Rate limit check (token bucket)                       │
  │    ├── Pre-call log (stdout JSON)                            │
  │    ├── Forward to real MCP server                            │
  │    └── Post-call log (duration, result)                      │
  └─────────────────────────────────────────────────────────────┘
```

### Current state of the repository

Documentation only. No implementation code. The plugin repository would be a new Git repo (or a subdirectory of this workspace).

### What goose provides (we don't build)

| Primitive | Purpose |
|---|---|
| `delegate` tool (summon extension) | Spawns sub-agents from `agents/*.md` definitions. Inherits parent's extensions. The ONLY minion spawning primitive. |
| `load` tool (summon extension) | Collects async delegate results |
| `list_sessions` / `view_session` / `interrupt_agent` (orchestrator extension) | **Control plane only.** Monitor running delegates, inspect results, cancel runaway delegates. NOT for spawning. |
| Plugin system (`goose plugin install`) | Delivers skills, agents, commands, rules, hooks |
| `goose serve` | Persistent HTTP/WebSocket server for bot ingress |
| `goose run -i` | Non-interactive instruction execution (tests) |
| Sessions (SQLite) | Persistent conversation state |
| Slash commands | `/review-pr 342` invokes orchestrator skill |

### What we build

| Component | Type | Purpose |
|---|---|---|
| Plugin skeleton | `.plugin/plugin.json` + directory tree | Delivery unit |
| Orchestrator skill | `skills/orchestrator/SKILL.md` | Classify intent → delegate → collect |
| Agent definitions | `agents/*.md` (5 files) | Minion identities and system prompts |
| Slash commands | `commands/*.yaml` | Direct session access |
| Governance rules | `rules/` | Standing orders for allowlist behavior |
| Session hooks | `hooks/` | Correlation ID, journaling |
| Toolshed MCP server | `mcp-servers/toolshed/` (Rust) | Allowlist enforcement |
| Bot ACP clients | `bots/` (Node.js) | Slack/Teams bridge |
| Integration tests | `tests/` | Walking skeleton validation |

## Plan of Work

Seven steps. Every step produces runnable, testable output.

### Step 1: Scaffold the plugin skeleton

Create the plugin directory structure and manifest. This is the delivery unit.

**Files:**
- `.plugin/plugin.json` — Manifest with `name`, `version`, `agents`, `skills`, `commands`, `rules`, `hooks` paths
- `README.md` — Plugin documentation

**Directories:**
- `skills/`, `agents/`, `commands/`, `rules/`, `hooks/`, `tests/`, `tests/integration/`, `tests/roles/`

**Validation:** `goose plugin install /path/to/plugin` succeeds and lists the plugin as installed. No skills load yet (they're empty), but the manifest is valid.

### Step 2: Write the Code Reviewer agent

The first sub-agent definition. This is what `delegate` loads when the orchestrator spawns a code review minion.

**File:** `agents/code-reviewer.md`

**Content:** Role identity, system prompt, available tools, output format:
- **Role:** Code Reviewer — analyzes PR diffs for bugs, style, performance, security
- **Tools:** GitHub MCP (via toolshed proxy) — `get_pr_diff`, `create_review_comment`, `get_pr_comments`
- **Output:** Structured JSON: `{ pr_id, summary, issues: [{file, line, severity, category, description, suggestion}], approved }`

**Validation:** Identity test (`tests/roles/code-reviewer-identity.yaml`) — confirms the agent loads with correct role description.

### Step 3: Write the Orchestrator skill

The orchestrator is a skill — it teaches goose how to route work.

**File:** `skills/orchestrator/SKILL.md`

**Content:**
- **Intent classification:** Map user messages to intent types (`code_review`, `ticket_lookup`, `ticket_fix_pr`, `security_audit`, `code_explore`, `unknown`)
- **Delegation table:** Which agent to spawn for each intent, with parameters to extract
- **Result collection:** Poll `load(taskId)`, validate JSON schema, return structured response
- **Error handling:** Unknown intent → clarification message. Agent failure → retry (max 3, exponential backoff). Agent timeout → escalate.

**Frontmatter:**
```yaml
---
name: orchestrator
description: Classify user intents, delegate to specialist agents, collect structured results.
---
```

**Validation:** Identity test (`tests/roles/orchestrator-identity.yaml`) — confirms the skill loads and responds to classification prompts.

### Step 4: Write slash commands

Slash commands provide direct session access to the orchestrator without a bot.

**File:** `commands/review-pr.yaml`

```yaml
name: review-pr
description: Review a pull request
arguments:
  - name: pr_number
    type: integer
    required: true
    description: PR number to review
```

Invokes the orchestrator skill with the PR number.

**Additional commands (skeleton):**
- `commands/triage-ticket.yaml` — `/triage-ticket <id>`
- `commands/security-scan.yaml` — `/security-scan <target>`

**Validation:** In a goose session with the plugin loaded: `/review-pr 342` invokes the orchestrator skill.

### Step 5: Write session hooks

Lifecycle hooks handle cross-cutting concerns: correlation ID initialization and session journaling.

**Files:**

- `hooks/hooks.json` — Declares hook triggers:
  ```json
  {
    "hooks": [
      {
        "event": "SessionStart",
        "actions": [
          {"type": "command", "command": "bash ${plugin_root}/hooks/session-start.sh",
           "description": "Initialize correlation ID for this session"}
        ]
      },
      {
        "event": "SessionEnd",
        "actions": [
          {"type": "command", "command": "bash ${plugin_root}/hooks/session-end.sh",
           "description": "Write session journal entry"}
        ]
      }
    ]
  }
  ```

- `hooks/session-start.sh` — Generates a `corr_<uuid>` correlation ID, writes it to a known file or env var, creates a session record in SQLite.
- `hooks/session-end.sh` — Writes a journal entry: session duration, minions spawned, tools called, result status.

**Validation:** Start a goose session with the plugin loaded. Verify `session-start.sh` ran (check SQLite for a new session record). End the session and verify the journal entry was written.

### Step 6: Scaffold the toolshed MCP server

The toolshed is an external MCP server (not part of the plugin) that wraps GitHub MCP with allowlist enforcement.

**Technology:** Rust, `rmcp` crate, stdio transport.

**Files:**
- `mcp-servers/toolshed/Cargo.toml`
- `mcp-servers/toolshed/src/main.rs` — Bootstrap: `rmcp::service::serve_directly(ToolshedServer, rmcp::transport::stdio(), None)`
- `mcp-servers/toolshed/src/allowlist.rs` — `AllowlistManager`: per-agent allowlist map
- `mcp-servers/toolshed/src/proxy.rs` — Proxy: allowlist check → rate limit → log → forward to GitHub MCP → log → return
- `mcp-servers/toolshed/src/logger.rs` — JSON audit log to stdout

**Allowlists:**

| Agent | Allowed tools (via toolshed → GitHub MCP) |
|---|---|
| code-reviewer | `get_pr_diff`, `create_review_comment`, `get_pr_comments` |
| code-explorer | `list_directory`, `read_file` |
| pr-crafter | `create_branch`, `commit`, `create_pr` |
| ticket-analyst | (Phase 3) |
| security-auditor | `get_advisories`, `read_file` |

**Validation:** `cargo build` succeeds. Register the toolshed in goose config: `goose configure --add-extension toolshed --type stdio --cmd "mcp-servers/toolshed/target/release/goose-toolshed"`. Then `goose run -t "List available tools"` confirms the toolshed registers.

### Step 7: Wire the walking skeleton

**Integration test:** `tests/integration/walking-skeleton.yaml`

```yaml
name: walking-skeleton
description: Phase 1 end-to-end test — classify intent, delegate to code-reviewer, collect result
steps:
  - input: "Review PR #342 in org/test-repo"
  - expect:
      intent: code_review
      minion_status: completed
      result:
        pr_id: "342"
        approved: boolean
        issues: array
```

**Run:**
```bash
goose run \
  -i tests/integration/walking-skeleton.yaml \
  --output-format json
```

**Verification:**
1. Intent correctly classified as `code_review`.
2. `delegate` spawned the code-reviewer agent.
3. The code-reviewer agent called tools through the toolshed.
4. The toolshed logged each tool call with correlation ID.
5. The result contains valid JSON with `pr_id`, `summary`, `issues`, `approved`.

## Concrete Steps

All commands run from the plugin root directory.

### Step 1: Plugin skeleton

```sh
mkdir -p .plugin skills/orchestrator agents commands rules hooks
mkdir -p tests/integration tests/roles

# Create .plugin/plugin.json (see Artifacts)
# Create README.md

# Validate
goose plugin install .
goose plugin list | grep goose-agent-framework
# Expected: shows the plugin as installed
```

### Step 2: Code Reviewer agent

```sh
# Create .agents/agents/code-reviewer.md (see Artifacts)
# Create skeleton agents
# Create .agents/agents/code-explorer.md .agents/agents/pr-crafter.md
# Create .agents/agents/ticket-analyst.md .agents/agents/security-auditor.md
# Each with placeholder role descriptions
```

### Step 3: Orchestrator skill

```sh
# Create .agents/skills/orchestrator/SKILL.md (see Artifacts)
```

### Step 4: Slash commands

```sh
# Create commands/review-pr.yaml (see Artifacts)
# Create commands/triage-ticket.yaml commands/security-scan.yaml (skeleton)
```

### Step 5: Session hooks

```sh
# Create hooks/hooks.json (see Artifacts)
# Create hooks/session-start.sh
# Create hooks/session-end.sh
chmod +x hooks/session-start.sh hooks/session-end.sh
```

### Step 6: Build and register the toolshed

```sh
cargo init mcp-servers/toolshed --name goose-toolshed
cd mcp-servers/toolshed
cargo add rmcp serde serde_json tokio tracing tracing-subscriber uuid
cd ../..

# Create mcp-servers/toolshed/src/main.rs, allowlist.rs, proxy.rs, logger.rs
cargo build --release --manifest-path mcp-servers/toolshed/Cargo.toml
# Expected: Finished release [optimized]

# Register toolshed persistently in goose config
goose configure --add-extension toolshed \
  --type stdio \
  --cmd "$PWD/mcp-servers/toolshed/target/release/goose-toolshed"
# Expected: toolshed added to ~/.config/goose/config.yaml
```

### Step 7: Walking skeleton

```sh
# Create tests/integration/walking-skeleton.yaml (see Artifacts)

goose run \
  -i tests/integration/walking-skeleton.yaml \
  --output-format json

# Expected: exit 0, JSON with intent=code_review, minion_status=completed
```

## Validation and Acceptance

### ⚠️ Coverage Mandate

**100% test coverage required. No code without tests. No merge without passing tests. No deployment without coverage gates.**

The **Ralph Wiggum loop** is enforced: if a test fails, the code goes back to the developer, gets fixed, tested again, and this repeats until ALL tests pass. There is no skip button, no override, no "merge anyway."

### What "done" looks like

1. **Plugin installs.** `goose plugin install .` succeeds.
2. **Agents load.** Identity tests confirm code-reviewer and orchestrator identities.
3. **Slash commands work.** `/review-pr 342` in a goose session invokes the orchestrator.
4. **Session hooks fire.** `session-start.sh` creates correlation IDs. `session-end.sh` writes journals.
5. **Toolshed builds and runs.** `cargo build` succeeds. Toolshed registers as an MCP server.
6. **Walking skeleton passes.** `goose run -i tests/integration/walking-skeleton.yaml --output-format json` exits 0 with a completed minion result.

### How to verify

```sh
# 1. Plugin installs
goose plugin install . && echo "PASS: plugin installs"

# 2. Build toolshed
cargo build --manifest-path mcp-servers/toolshed/Cargo.toml && echo "PASS: toolshed builds"

# 3. Walking skeleton
goose run \
  -i tests/integration/walking-skeleton.yaml \
  --output-format json \
  --max-turns 30
# Expected: exit 0, JSON with intent=code_review, minion_status=completed

# 4. Check session store
sqlite3 ~/.local/share/goose/sessions/sessions.db \
  "SELECT correlation_id, status FROM sessions ORDER BY created_at DESC LIMIT 1;"
# Expected: One row with correlation_id and status='completed'
```

## Idempotence and Recovery

### Idempotence
- `goose plugin install`: Idempotent — re-running installs the same plugin again.
- `cargo init`: Fails if `Cargo.toml` exists. Use only on first run. `cargo build` is idempotent.
- `goose run -i`: Idempotent — each run creates a new session.

### Recovery
- **Plugin parse error:** Fix `plugin.json` syntax. `goose plugin install` validates JSON on install.
- **Skill not loading:** Verify SKILL.md frontmatter has `name` and `description`.
- **Delegate spawn failure:** Verify `summon` extension is enabled (`goose info` confirms it's bundled).
- **Toolshed connection failure:** Verify GitHub MCP is installed and `GITHUB_PERSONAL_ACCESS_TOKEN` is set.
- **Bot connection failure:** Verify `goose serve` is running on the expected port.

### Rollback

```sh
# Remove plugin
rm -rf ~/.agents/plugins/goose-agent-framework

# Remove toolshed
rm -rf mcp-servers/

# Remove bots
rm -rf bots/
```

## Artifacts and Notes

### `.plugin/plugin.json`

```json
{
    "name": "goose-agent-framework",
    "version": "0.1.0",
    "description": "Multi-agent orchestration framework for the Goose platform. Classifies intents, delegates to specialist agents, enforces tool governance.",
    "author": {
        "name": "Goose Agent Framework Team"
    },
    "repository": "https://github.com/org/goose-agent-framework",
    "license": "Apache-2.0",
    "agents": "./.agents/agents/",
    "skills": "./.agents/skills/",
    "commands": "./commands/",
    "rules": "./rules/",
    "hooks": "./hooks/hooks.json"
}
```

### `skills/orchestrator/SKILL.md`

```markdown
---
name: orchestrator
description: Classify user intents, delegate to specialist agents, collect structured results.
---

# Orchestrator

You are the Goose Agent Framework orchestrator. Your job: receive user requests, determine intent, delegate to the right specialist agent, collect the result, and return it.

## Intent Classification

Classify the user's message into one of:

| Intent | Pattern |
|---|---|
| `code_review` | User wants a PR reviewed ("review PR 342", "review pull request") |
| `ticket_lookup` | User asks about ticket/incident status |
| `ticket_fix_pr` | User wants a ticket fixed and a PR created |
| `security_audit` | User asks about security/vulnerabilities |
| `code_explore` | User wants to find or explore code |
| `unknown` | Doesn't match any pattern |

## Delegation

## Delegation

Use the `delegate` tool (summon extension) to spawn agents. Agents are registered by the plugin and referenced by `source` name. Typed parameters are passed via the `parameters` field.

```
delegate({
  source: "<agent name>",
  parameters: { <extracted from user message> },
  extensions: ["toolshed"],
  max_turns: <from registry>,
  async: true
})
```

For each intent:

| Intent | Agent (`source`) | Parameters |
|---|---|---|
| `code_review` | `code-reviewer` | `pr_number` (integer), `repo` (string) |
| `code_explore` | `code-explorer` | `query` (string) |
| `security_audit` | `security-auditor` | `target` (string) |
| `ticket_lookup` | `ticket-analyst` | `ticket_id` (string) |
| `ticket_fix_pr` | `pr-crafter` | `ticket_id` (string), `repo` (string) |
| `unknown` | (none) | Return clarification message |

**Concrete example — code review:**
```
delegate({
  source: "code-reviewer",
  parameters: {
    pr_number: 342,
    repo: "org/repo"
  },
  extensions: ["toolshed"],
  max_turns: 20,
  async: true
})
```

Use the built-in `orchestrator` extension for the **control plane**:
- `list_sessions` — monitor running delegates
- `view_session` — inspect delegate results
- `interrupt_agent` — cancel runaway delegates

All agents use `extensions: ["toolshed"]` — they have no direct access to GitHub or filesystem MCP servers.

Agent timeouts:
- code-reviewer: 10 minutes (max_turns: 20)
- ticket-analyst: 5 minutes (max_turns: 10)
- pr-crafter: 15 minutes (max_turns: 30)
- security-auditor: 10 minutes (max_turns: 20)
- code-explorer: 5 minutes (max_turns: 10)

## Result Collection

1. After spawning, use `load({ source: taskId })` to wait for the agent to complete.
2. Validate the result matches the expected JSON schema for that agent type.
3. If the agent fails: retry once. If it fails again: return an error with details.
4. Return the structured result.

## Response Format

```json
{
  "intent": "code_review",
  "agent": "code-reviewer",
  "status": "completed",
  "result": { ... agent output ... }
}
```
```

### `agents/code-reviewer.md`

```markdown
# Code Reviewer

You are a code reviewer. Your job is to analyze pull request diffs and return a structured review.

## Tools available

You have access to GitHub tools through the toolshed. Use them to:
- `get_pr_diff` — Get the diff for a pull request
- `get_pr_comments` — Get existing comments on the PR
- `create_review_comment` — Post a review comment

## Process

1. Get the PR diff for the given PR number and repository.
2. Analyze each changed file for:
   - **Bugs**: Logic errors, null dereferences, race conditions
   - **Style**: Violations of coding conventions
   - **Performance**: Inefficient algorithms, unnecessary allocations
   - **Security**: Injection risks, missing validation, exposed secrets
   - **Documentation**: Missing or outdated comments
3. Classify each issue by severity and category.

## Output format

You MUST return your review as valid JSON matching this schema:

```json
{
  "pr_id": "string (the PR number)",
  "summary": "string (1-3 sentences summarizing the review)",
  "issues": [
    {
      "file": "string (path to the file)",
      "line": "integer or null",
      "severity": "critical | high | medium | low | info",
      "category": "bug | style | performance | security | documentation",
      "description": "string (concise description)",
      "suggestion": "string or null (how to fix)"
    }
  ],
  "approved": "boolean (true if no critical or high severity issues)"
}
```

Return ONLY the JSON. No preamble, no explanation outside the JSON.
```

### `commands/review-pr.yaml`

```yaml
name: review-pr
description: Review a pull request
arguments:
  - name: pr_number
    type: integer
    required: true
    description: Pull request number to review
  - name: repo
    type: string
    required: false
    description: Repository in org/repo format (defaults to configured default repo)
```

### `hooks/hooks.json`

```json
{
  "hooks": [
    {
      "event": "SessionStart",
      "actions": [
        {
          "type": "command",
          "command": "bash ${plugin_root}/hooks/session-start.sh",
          "description": "Initialize correlation ID and session record"
        }
      ]
    },
    {
      "event": "SessionEnd",
      "actions": [
        {
          "type": "command",
          "command": "bash ${plugin_root}/hooks/session-end.sh",
          "description": "Write session journal entry"
        }
      ]
    }
  ]
}
```

### `hooks/session-start.sh`

```bash
#!/bin/bash
# Initialize correlation ID for this session
CORR_ID="corr_$(uuidgen | tr '[:upper:]' '[:lower:]')"
export GOOSE_CORRELATION_ID="$CORR_ID"

# Write session start record
sqlite3 ~/.local/share/goose/sessions/sessions.db "
  INSERT INTO sessions (id, correlation_id, status, created_at)
  VALUES ('$(goose session-id 2>/dev/null || echo "session_$(date +%s)")', '$CORR_ID', 'active', datetime('now'));
" 2>/dev/null || true

echo "[goose-agent-framework] Session started with correlation ID: $CORR_ID"
```

### `hooks/session-end.sh`

```bash
#!/bin/bash
# Write session journal entry
CORR_ID="${GOOSE_CORRELATION_ID:-unknown}"

sqlite3 ~/.local/share/goose/sessions/sessions.db "
  UPDATE sessions SET status = 'completed', completed_at = datetime('now')
  WHERE correlation_id = '$CORR_ID';
" 2>/dev/null || true

echo "[goose-agent-framework] Session ended: $CORR_ID"
```

### `tests/integration/walking-skeleton.yaml`

```yaml
name: walking-skeleton
description: Phase 1 end-to-end test — classify, delegate, collect
steps:
  - input: "Review PR #1 in goose-agent-framework/test-repo"
  - expect:
      intent: code_review
      agent: code-reviewer
      status: completed
      result:
        pr_id: string
        summary: string
        issues: array
        approved: boolean
```

### File system layout at completion

```
goose-agent-framework/                  ← Plugin root (git repo)
├── .plugin/
│   └── plugin.json                     ← Manifest
├── .agents/
│   ├── skills/
│   │   └── orchestrator/
│   │       └── SKILL.md                ← Orchestrator skill
│   └── agents/
│       ├── code-reviewer.md            ← Code Reviewer agent
│       ├── code-explorer.md            ← Code Explorer (skeleton)
│       ├── pr-crafter.md               ← PR Crafter (skeleton)
│       ├── ticket-analyst.md           ← Ticket Analyst (skeleton)
│       └── security-auditor.md         ← Security Auditor (skeleton)
├── commands/
│   ├── review-pr.yaml                  ← /review-pr slash command
│   ├── triage-ticket.yaml              ← /triage-ticket (skeleton)
│   └── security-scan.yaml              ← /security-scan (skeleton)
├── rules/
│   └── allowlist-rules.md              ← Standing orders
├── hooks/
│   ├── hooks.json                      ← Lifecycle config
│   ├── session-start.sh                ← Correlation ID init
│   └── session-end.sh                  ← Journal write
├── tests/
│   ├── integration/
│   │   └── walking-skeleton.yaml       ← Integration test
│   └── roles/
│       ├── code-reviewer-identity.yaml ← Identity test
│       └── orchestrator-identity.yaml  ← Identity test
├── README.md
└── LICENSE

External components (not in plugin):
├── mcp-servers/toolshed/               ← Standalone Rust MCP server
│   ├── Cargo.toml
│   └── src/ (main.rs, allowlist.rs, proxy.rs, logger.rs)
└── bots/
    ├── slack-bot/                      ← ACP client (Node.js)
    └── teams-bot/                      ← ACP client (Node.js)
```

## Interfaces and Dependencies

### Goose platform

| Primitive | Source |
|---|---|
| `delegate` tool | `summon` extension (bundled, enabled by default) |
| `load` tool | `summon` extension |
| `start_agent` / `send_message` / `interrupt_agent` / `list_sessions` / `view_session` | `orchestrator` extension (bundled, must be enabled) |
| Plugin system | `goose plugin install` |
| `goose serve` | CLI command (ACP over HTTP/WebSocket) |
| `goose run -i` | CLI command (non-interactive execution) |
| Sessions (SQLite) | `~/.local/share/goose/sessions/sessions.db` |

### External MCP servers

| Server | Phase 1 | Connection |
|---|---|---|
| GitHub MCP | **Required** | PAT in `GITHUB_PERSONAL_ACCESS_TOKEN` |
| Toolshed (ours) | **Required** | stdio MCP server (`cargo run`) |

### NPM (bot adapters)

| Package | Purpose |
|---|---|
| `@slack/bolt` | Slack bot framework |
| `@microsoft/agents-hosting` | Teams bot framework |

### Rust (toolshed)

| Crate | Purpose |
|---|---|
| `rmcp` | MCP server framework |
| `serde` / `serde_json` | Serialization |
| `tokio` | Async runtime |
| `tracing` | Structured logging |
| `uuid` | Correlation ID generation |
