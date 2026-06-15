# Goose Agent Framework — Low-Level Design

**Version:** 1.0  
**Target Goose:** 1.37.0 (`aaif-goose/goose`)  
**Date:** 2026-06-14  
**Status:** Draft — Phase 1 scope  

> This document describes how the Goose Agent Framework extends the Goose platform to create a governed multi-agent orchestration system. It assumes familiarity with the high-level architecture in `high-level-design.md` and the delivery plan in `delivery-specification.md`.

---

## 1. Goose Platform Primitives

Goose 1.37.0 provides the runtime substrate. Everything below is verified against live `goose info` output and CLI testing. The framework does **not** reimplement these — it composes them.

### 1.1 Extension Taxonomy

Goose has three extension types:

| Type | Loading | Examples | What it provides |
|---|---|---|---|
| **Platform** | Bundled, enabled/disabled in `config.yaml` | `summon`, `developer`, `orchestrator`, `apps`, `skills` | Tools registered in the agent's tool set |
| **MCP (stdio)** | `--with-extension <cmd>` or `config.yaml` entry | GitHub MCP, Filesystem MCP, **Toolshed (ours)** | External tools via Model Context Protocol over stdio |
| **MCP (HTTP)** | `--with-streamable-http-extension <URL>` | Remote MCP servers | External tools via HTTP/SSE transport |

**Evidence:** `goose info` lists extensions by type. `cat ~/.config/goose/config.yaml` shows enabled/disabled state with `type: platform` entries.

### 1.2 The `summon` Extension — `delegate` and `load`

The `summon` platform extension is the core sub-agent primitive. It is **bundled and enabled by default**.

| Tool | Signature (conceptual) | Behavior |
|---|---|---|
| `delegate` | `{ source?, instructions?, parameters?, extensions?, max_turns?, async? }` → `TaskHandle` | Spawns a sub-agent. Three modes: (1) `source` only — loads a registered agent from a plugin's `agents/` directory; (2) `instructions` only — ad-hoc sub-agent with custom tasks; (3) `source` + `instructions` — agent identity plus specific task. If `extensions` is specified, the sub-agent gets ONLY those extensions. `parameters` passes typed inputs to the agent. Returns `TaskHandle` with `taskId`. |
| `load` | `{ source }` → `TaskResult` | Collects the result of an async delegate. `source` is the `taskId` from the `TaskHandle`. Blocks until completion or timeout. Returns the sub-agent's final response. |

**Critical behaviors verified via live test:**

- `delegate` with `async: false` runs synchronously and returns the result immediately.
- `delegate` with `async: true` returns a `TaskHandle` immediately; the sub-agent runs in the background.
- `source: "code-reviewer"` loads the registered agent definition from the plugin's `agents/` directory. Parameters are passed via `parameters: { pr_number: 342 }` — typed and validated.
- The sub-agent **inherits the parent's extensions** by default. We restrict minions by passing `extensions: ["toolshed"]` so the minion has ONLY governed tool access.
- `load({ source: taskId })` blocks until the delegate completes or times out.

**Evidence:** Live tool spec shows `source` (agent/recipe name), `parameters` (typed inputs), `instructions` (task description), `extensions` (restriction list), `max_turns`, `async`. Office-town agents (`boss.md`, `worker.md`) demonstrate the agent-as-source pattern with YAML frontmatter. Live test — `goose run --with-builtin developer -t "Use the delegate tool..."` spawned a sub-agent that ran `ls` and returned results.

### 1.3 The `orchestrator` Extension — Control Plane

The `orchestrator` platform extension is **bundled but disabled by default**. It provides session management tools:

| Tool | Behavior |
|---|---|
| `list_sessions` | Lists recent sessions with status (idle/busy), message count, timestamps |
| `view_session` | Inspects a session — first/last message or LLM-summarized |
| `start_agent` | Launches a new agent session with custom working directory |
| `send_message` | Sends a message to an existing agent session |
| `interrupt_agent` | Cancels a busy agent's current operation |

**Critical finding:** `start_agent` creates **bare sessions with NO inherited tools**. When tested, a `start_agent` session failed to execute `ls` because it had no shell access. The `delegate` tool from `summon` is the **only** mechanism for spawning tool-equipped sub-agents.

**Our usage:** We enable `orchestrator` for the **control plane only** — `list_sessions` to monitor, `view_session` to inspect, `interrupt_agent` to cancel runaway delegates. We do NOT use `start_agent`/`send_message` for minion dispatch.

**Evidence:** Live test — `start_agent` + `send_message` with a shell command failed. `delegate` with the same command succeeded because it inherited the parent's `developer` extension.

### 1.4 Sessions

Goose sessions are SQLite-backed at `~/.local/share/goose/sessions/sessions.db`. Each session is a persistent conversation with:

- A session ID (timestamp-based, e.g. `20260614_2`)
- Message history
- Tool call records
- Extension state
- A unique correlation namespace

**Our usage:** We extend the session model with correlation IDs and audit journals via `hooks/` (see §4).

**Evidence:** `goose info` output confirms `Sessions DB (sqlite)` path.

### 1.5 Plugins

Plugins are the native packaging and distribution mechanism. One `goose plugin install <git-url>` delivers:

| Component | Path convention | Purpose |
|---|---|---|
| **Skills** | `.agents/skills/<name>/SKILL.md` | Procedural knowledge — teaches goose a workflow. Registered via plugin.json. |
| **Agents** | `.agents/agents/<name>.md` | Sub-agent identity/role definitions loaded by `delegate`. Registered via plugin.json. |
| **Commands** | `commands/<name>.yaml` | Slash commands invoked in goose sessions |
| **Rules** | `rules/` | Standing orders governing behavior |
| **Hooks** | `hooks/hooks.json` → shell scripts | Lifecycle triggers (SessionStart, SessionEnd) |
| **Tests** | `tests/` | Integration and identity tests |

**Manifest:** `.plugin/plugin.json` (or `plugin.json` at repo root):

**Agent discovery:** Goose resolves agent sources from `.agents/agents/` (project-level) and `~/.agents/agents/` (global). Agents must be registered via `plugin.json` → `"agents": "./.agents/agents/"`. The `agents/` directory at repo root is not discoverable by `delegate`.

```json
{
    "name": "goose-agent-framework",
    "version": "0.1.0",
    "description": "Multi-agent orchestration framework",
    "agents": "./agents/",
    "skills": "./skills/",
    "commands": "./commands/",
    "rules": "./rules/",
    "hooks": "./hooks/hooks.json"
}
```

**What plugins CANNOT bundle:** MCP servers. The plugin format is skills + hooks only. MCP servers are configured separately via `config.yaml` or `--with-extension` CLI flags.

**Evidence:** `jezweb/office-town-plugin` v0.5.3 installed via `goose plugin install`. Imported 6 skills automatically. Tree shows `skills/`, `agents/`, `commands/`, `hooks/`, `tests/`. Plugin docs confirm "skills and hooks only" scope.

### 1.6 Recipes

Recipes are YAML task definitions — standalone, parameterized, and runnable. They are distinct from agents:

| Concept | Format | Purpose | Runner |
|---|---|---|---|
| **Agent** | `agents/<name>.md` | Sub-agent identity (system prompt, role, tools) | `delegate` tool loads it |
| **Recipe** | `recipe.yaml` | Standalone task (instructions, parameters, extensions) | `goose run --recipe` or `delegate` with recipe path |

Recipes support:
- `parameters`: Typed inputs with `input_type` (string, integer, select) and `requirement` (required/optional)
- `extensions`: Array of MCP/builtin extensions with `type`, `name`, `cmd`, `args`, `env_keys`
- `sub_recipes`: Composition of multiple recipes into a DAG (Phase 2)

**Our usage:** Minions are **agents** (`.md` files), not recipes. The orchestrator calls `delegate` with an agent file path. Recipes could be used for standalone tasks (e.g., scheduled jobs) but are not used for minion dispatch.

**Evidence:** `goose recipe --help` shows `validate`, `deeplink`, `open`, `list`. Office-town ships recipes under `commands/` (not discoverable by `goose recipe list` but runnable by path).

### 1.7 ACP and `goose serve`

ACP (Agent Communication Protocol) is the HTTP/WebSocket protocol that `goose serve` exposes:

```bash
goose serve --host 127.0.0.1 --port 3284
```

External clients (bot adapters, dashboards) connect via WebSocket, create sessions, send messages, and receive responses. This is how Slack/Teams bots bridge into goose sessions without reimplementing the agent loop.

**Evidence:** `goose serve --help` output confirms HTTP/WebSocket server on port 3284 with `--with-builtin` flag for extension loading.

### 1.8 Slash Commands

Slash commands are YAML files that register as `/command` triggers in goose sessions. When a user types `/review-pr 342`, goose:

1. Looks up the command definition in the plugin's `commands/` directory.
2. Parses arguments.
3. Invokes the associated skill or behavior.

**Evidence:** Office-town ships `commands/knowledge-graduation.yaml`, `commands/triage-inbox.yaml`, etc. Format matches our `commands/review-pr.yaml`.

---

## 2. Framework Architecture

### 2.1 Component Map

```
┌─────────────────────────────────────────────────────────────┐
│                    GOOSE PLATFORM (1.37.0)                   │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ summon   │  │ orchestr.│  │ developer│  │  skills    │  │
│  │ (builtin)│  │ (enable) │  │ (builtin)│  │ (builtin)  │  │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └────────────┘  │
│       │ delegate     │ list/view/interrupt                   │
│       │ load         │                                       │
└───────┼──────────────┼───────────────────────────────────────┘
        │              │
        ▼              ▼
┌──────────────────────────────────────────────────────────────┐
│              GOOSE AGENT FRAMEWORK (our plugin)               │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  orchestrator skill (.agents/skills/orchestrator/)    │    │
│  │                                                       │    │
│  │  ┌─────────────┐  ┌──────────┐  ┌────────────────┐   │    │
│  │  │ Intent       │  │ Delegate │  │ Result         │   │    │
│  │  │ Classifier   │──▶ Router   │──▶ Collector      │   │    │
│  │  │ (LLM-driven) │  │          │  │ (load + schema │   │    │
│  │  └─────────────┘  └────┬─────┘  │  validation)   │   │    │
│  │                        │        └────────────────┘   │    │
│  └────────────────────────┼─────────────────────────────┘    │
│                           │ spawn via delegate                │
│                           ▼                                   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Agent Pool (agents/*.md)                             │    │
│  │                                                       │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │    │
│  │  │ code-        │ │ code-        │ │ pr-          │  │    │
│  │  │ reviewer.md  │ │ explorer.md  │ │ crafter.md   │  │    │
│  │  └──────┬───────┘ └──────────────┘ └──────────────┘  │    │
│  │         │                                              │    │
│  │  ┌──────────────┐ ┌──────────────┐                   │    │
│  │  │ ticket-      │ │ security-    │                   │    │
│  │  │ analyst.md   │ │ auditor.md   │                   │    │
│  │  └──────────────┘ └──────────────┘                   │    │
│  └───────────────────────┬──────────────────────────────┘    │
│                          │ extensions: ["toolshed"]          │
│                          ▼                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Commands (commands/*.yaml)                           │    │
│  │  /review-pr, /triage-ticket, /security-scan          │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Hooks (hooks/)                                        │    │
│  │  SessionStart → correlation ID                         │    │
│  │  SessionEnd   → audit journal                         │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Rules (rules/)                                        │    │
│  │  Allowlist policy, retry limits, escalation paths     │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                  EXTERNAL COMPONENTS                           │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐                   │
│  │  Slack Bot       │  │  Teams Bot       │                   │
│  │  (ACP client)    │  │  (ACP client)    │                   │
│  │  @slack/bolt     │  │  @microsoft/     │                   │
│  │                  │  │  agents-hosting  │                   │
│  └────────┬─────────┘  └────────┬─────────┘                   │
│           │ WebSocket           │ WebSocket                   │
│           ▼                     ▼                             │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  goose serve (ACP server, localhost:3284)             │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Toolshed MCP Server (mcp-servers/toolshed/)          │    │
│  │  Rust, rmcp, stdio transport                          │    │
│  │                                                       │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │    │
│  │  │Allowlist │  │ Rate     │  │ Audit    │           │    │
│  │  │Check     │──▶ Limiter  │──▶ Logger   │           │    │
│  │  └──────────┘  └──────────┘  └────┬─────┘           │    │
│  │                                   │ forward           │    │
│  │                                   ▼                   │    │
│  │                          ┌──────────────┐            │    │
│  │                          │ GitHub MCP   │            │    │
│  │                          │ (external)   │            │    │
│  │                          └──────────────┘            │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Extension Inheritance Model

This is the most critical architectural constraint:

```
                   Parent Goose Session
                   ┌──────────────────┐
                   │ Extensions:      │
                   │  • summon        │  ← delegate/load
                   │  • developer      │  ← shell, edit, write
                   │  • skills         │  ← load_skill
                   │  • orchestrator   │  ← list/view/interrupt
                   │  • toolshed (MCP) │  ← governed GitHub access
                   └────────┬─────────┘
                            │
              delegate({ source: "<agent>", extensions: ["toolshed"] })
                            │
                            ▼
                   Minion (sub-agent)
                   ┌──────────────────┐
                   │ Extensions:      │
                   │  • toolshed ONLY │  ← NOTHING else
                   │                  │
                   │ ❌ no shell      │
                   │ ❌ no edit       │
                   │ ❌ no write      │
                   │ ❌ no developer  │
                   │ ❌ no summon     │  ← minion can't spawn more minions
                   └──────────────────┘
```

Every tool call from the minion hits the toolshed first. The toolshed checks the allowlist, rate limits, logs, and only then forwards to the real MCP server.

---

## 3. Minion Lifecycle

### 3.1 End-to-End Flow

```
SLACK/TEAMS                    GOOSE SERVE                  FRAMEWORK PLUGIN
    │                              │                              │
    │  "Review PR #342"            │                              │
    │─────────────────────────────▶│                              │
    │                              │  message event              │
    │                              │─────────────────────────────▶│
    │                              │                              │
    │                              │         ┌────────────────────┤
    │                              │         │ Orchestrator Skill │
    │                              │         │                    │
    │                              │         │ 1. Classify Intent │
    │                              │         │    → code_review   │
    │                              │         │                    │
    │                              │         │ 2. Select Agent    │
    │                              │         │    → code-reviewer │
    │                              │         │                    │
    │                              │         │ 3. delegate({       │
    │                              │         │      source:        │
    │                              │         │        "code-       │
    │                              │         │        reviewer",   │
    │                              │         │      parameters: {  │
    │                              │         │        pr_number:   │
    │                              │         │          342,       │
    │                              │         │        repo: "org/  │
    │                              │         │              repo"  │
    │                              │         │      },             │
    │                              │         │      extensions:    │
    │                              │         │        ["toolshed"],│
    │                              │         │      max_turns: 20, │
    │                              │         │      async: true    │
    │                              │         │    })               │
    │                              │         │    → TaskHandle     │
    │                              │         │                    │
    │                              │         │ 4. Poll load(taskId)│
    │                              │         │    (with timeout)  │
    │                              │         │                    │
    │                              │         │ 5. Validate JSON    │
    │                              │         │    output against   │
    │                              │         │    code-reviewer    │
    │                              │         │    schema           │
    │                              │         │                    │
    │                              │         │ 6. Return response  │
    │                              │         └────────────────────┤
    │                              │                              │
    │                              │  structured response        │
    │  threaded reply ◀───────────│◀─────────────────────────────│
    │  with review results        │                              │
    │                              │                              │

                            MINION (sub-agent)
                            ┌──────────────────┐
                            │ Extensions:      │
                            │  toolshed only   │
                            │                  │
                            │ 1. Get PR diff   │
                            │    → toolshed    │
                            │    → GitHub MCP  │
                            │                  │
                            │ 2. Analyze diff  │
                            │    (LLM review)  │
                            │                  │
                            │ 3. Return JSON   │
                            │    { pr_id,      │
                            │      summary,    │
                            │      issues,     │
                            │      approved }  │
                            └──────────────────┘

                            TOOLSHED (MCP server)
                            ┌──────────────────┐
                            │ 1. Allowlist ✓   │
                            │ 2. Rate limit ✓  │
                            │ 3. Pre-call log  │
                            │ 4. Forward call  │
                            │ 5. Post-call log │
                            │ 6. Return result │
                            └──────────────────┘
```

### 3.2 State Machine

```
                         ┌──────────┐
                         │  IDLE    │  ← No request in flight
                         └────┬─────┘
                              │ Message received
                              ▼
                         ┌──────────┐
                         │CLASSIFY  │  ← LLM classifies intent
                         └────┬─────┘
                              │ Intent determined
                              ▼
                         ┌──────────┐
                         │ DISPATCH │  ← delegate(async: true)
                         └────┬─────┘
                              │ TaskHandle returned
                              ▼
                         ┌──────────┐
                         │ RUNNING  │  ← Minion executing
                         └────┬─────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
                    ▼         ▼         ▼
              ┌─────────┐ ┌──────┐ ┌──────────┐
              │COMPLETE │ │FAIL  │ │ TIMEOUT  │
              │(success)│ │(err) │ │(wall-clock)
              └────┬────┘ └──┬───┘ └────┬─────┘
                   │         │          │
                   │         │ attempt ≤ 3?
                   │         │ YES: retry with backoff
                   │         │ NO:  DECOMMISSIONED
                   │         │          │
                   ▼         ▼          ▼
              ┌─────────────────────────────┐
              │       RESPOND               │
              │ Return structured result    │
              │ or error to user            │
              └─────────────────────────────┘
```

**Retry policy:**
- Max 3 attempts per minion.
- Exponential backoff: 2s, 4s, 8s.
- On final failure, return error with `minion_type`, `attempts`, `last_error`.

**Timeout policy:**
- Per-minion wall-clock timeout (code-reviewer: 10 min, pr-crafter: 15 min, etc.).
- Enforced by `load(taskId)` polling loop in the orchestrator skill.
- On timeout, escalate with `interrupt_agent` (built-in orchestrator).

---

## 4. Tool Governance — The Toolshed

### 4.1 Why the Toolshed Exists

Without the toolshed, a minion spawned via `delegate` would inherit ALL of the parent's extensions — including `developer` (shell, file write, edit). This violates the principle of least privilege: a code reviewer should not be able to execute arbitrary shell commands or modify files.

The toolshed is a **mandatory intermediary** — it's the ONLY extension passed to minions. Every tool call from a minion must pass through:

```
Minion tool call
       │
       ▼
  ┌─────────────┐
  │ Allowlist   │  ← Is this tool allowed for this minion type?
  │ Check       │     NO → BLOCK + log security event
  └──────┬──────┘
         │ PASS
         ▼
  ┌─────────────┐
  │ Rate        │  ← Is this minion type within its rate quota?
  │ Limiter     │     NO → 429 Too Many Requests
  └──────┬──────┘
         │ PASS
         ▼
  ┌─────────────┐
  │ Pre-Call    │  ← Log: timestamp, corr_id, minion_type,
  │ Logger      │     tool_name, input_params
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ Forward to  │  ← Call the real MCP server
  │ Real MCP    │     (GitHub, Azure DevOps, etc.)
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ Post-Call   │  ← Log: result_status, duration_ms,
  │ Logger      │     output_size_bytes
  └──────┬──────┘
         │
         ▼
  Return to minion
```

### 4.2 Allowlist Model

The allowlist is a `Map<MinionType, Set<ToolName>>`:

```rust
const ALLOWLISTS: &[(&str, &[&str])] = &[
    ("code-reviewer", &[
        "github.get_pr_diff",
        "github.create_review_comment",
        "github.get_pr_comments",
    ]),
    ("code-explorer", &[
        "filesystem.list_directory",
        "filesystem.read_file",
    ]),
    ("pr-crafter", &[
        "github.create_branch",
        "github.commit",
        "github.create_pr",
        "filesystem.write_file",
    ]),
    ("ticket-analyst", &[
        "ado.query_work_items",
        "jira.search_issues",
    ]),
    ("security-auditor", &[
        "filesystem.read_file",
        "github.get_advisories",
    ]),
];
```

**How the minion type is known:** The orchestrator specifies the agent via `source` in the delegate call. The toolshed extracts the minion type from the correlation ID (which embeds the agent type) or from metadata propagated through the delegate.

### 4.3 Rate Limiter

Token-bucket algorithm, per minion type:

| Minion type | Tokens | Refill rate |
|---|---|---|
| code-reviewer | 10 | 1/second |
| code-explorer | 20 | 2/second |
| pr-crafter | 15 | 1/second |
| ticket-analyst | 10 | 1/second |
| security-auditor | 20 | 2/second |

### 4.4 Audit Log Format

JSON lines to stdout, collected by Container Insights → Log Analytics in production:

```json
{
  "ts": "2026-06-14T18:00:00.123Z",
  "correlation_id": "corr_a1b2c3d4.1",
  "minion_type": "code-reviewer",
  "tool_name": "github.get_pr_diff",
  "params": {"pr_number": 342, "repo": "org/repo"},
  "result": "success",
  "duration_ms": 600,
  "output_size_bytes": 12450
}
```

On allowlist failure:
```json
{
  "ts": "2026-06-14T18:01:00.456Z",
  "correlation_id": "corr_a1b2c3d4.1",
  "minion_type": "code-reviewer",
  "tool_name": "shell.run",
  "params": {"command": "rm -rf /"},
  "result": "blocked",
  "reason": "allowlist_denied"
}
```

---

## 5. Session and Correlation Model

### 5.1 Correlation ID Tree

Every request gets a root correlation ID (`corr_<uuid>`). Each minion spawned gets a child ID (`corr_<uuid>.N`). This creates a traceable tree:

```
corr_a1b2c3d4                      ← User message "Review PR #342 and check INC00421"
├── corr_a1b2c3d4.1                ← Code Reviewer minion
│   ├── github.get_pr_diff         ← Tool call
│   └── github.create_review_comment ← Tool call
└── corr_a1b2c3d4.2                ← Ticket Analyst minion (Phase 2, parallel)
    └── ado.query_work_items       ← Tool call
```

### 5.2 Session Hooks

The plugin's `hooks/` directory injects cross-cutting behavior:

**`hooks/hooks.json`:**
```json
{
  "hooks": [
    {
      "event": "SessionStart",
      "actions": [
        {
          "type": "command",
          "command": "bash ${plugin_root}/hooks/session-start.sh",
          "description": "Initialize correlation ID"
        }
      ]
    },
    {
      "event": "SessionEnd",
      "actions": [
        {
          "type": "command",
          "command": "bash ${plugin_root}/hooks/session-end.sh",
          "description": "Write session journal"
        }
      ]
    }
  ]
}
```

**`hooks/session-start.sh`:**
```bash
#!/bin/bash
CORR_ID="corr_$(uuidgen | tr '[:upper:]' '[:lower:]')"
export GOOSE_CORRELATION_ID="$CORR_ID"
echo "[framework] Session started: $CORR_ID"
```

**`hooks/session-end.sh`:**
```bash
#!/bin/bash
echo "[framework] Session ended: ${GOOSE_CORRELATION_ID:-unknown}"
# Write journal entry to SQLite or Log Analytics
```

### 5.3 Session Store (SQLite)

Goose already manages sessions in `~/.local/share/goose/sessions/sessions.db`. Our hooks extend this with correlation IDs:

```sql
-- Framework extension table (created by hooks/session-start.sh)
CREATE TABLE IF NOT EXISTS framework_sessions (
  session_id TEXT PRIMARY KEY,
  correlation_id TEXT NOT NULL,
  minion_count INTEGER DEFAULT 0,
  tool_call_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
```

---

## 6. Agent Definitions

### 6.1 Agent File Format

Each agent is a single `.md` file in `agents/`. The `delegate` tool loads it as the sub-agent's system prompt.

**`agents/code-reviewer.md`:**
```markdown
# Code Reviewer

You are a code reviewer. Analyze pull request diffs and return structured reviews.

## Tools

You have access to GitHub tools via the toolshed:
- get_pr_diff — Get the PR diff
- get_pr_comments — Get existing comments
- create_review_comment — Post a review comment

## Process

1. Get the PR diff for the given PR number and repo.
2. Analyze each changed file for bugs, style, performance, security, documentation.
3. Classify each issue by severity (critical/high/medium/low/info) and category.

## Output

Return ONLY valid JSON:
{
  "pr_id": "string",
  "summary": "string (1-3 sentences)",
  "issues": [
    {
      "file": "string",
      "line": "integer or null",
      "severity": "critical|high|medium|low|info",
      "category": "bug|style|performance|security|documentation",
      "description": "string",
      "suggestion": "string or null"
    }
  ],
  "approved": "boolean"
}
```

### 6.2 Agent Registry

The orchestrator skill maintains a registry mapping intents to agent files:

| Intent | Agent | Max Turns | Timeout (min) | Extensions |
|---|---|---|---|---|
| `code_review` | `agents/code-reviewer.md` | 20 | 10 | `["toolshed"]` |
| `code_explore` | `agents/code-explorer.md` | 10 | 5 | `["toolshed"]` |
| `security_audit` | `agents/security-auditor.md` | 20 | 10 | `["toolshed"]` |
| `ticket_lookup` | `agents/ticket-analyst.md` | 10 | 5 | `["toolshed"]` |
| `ticket_fix_pr` | `agents/pr-crafter.md` | 30 | 15 | `["toolshed"]` |
| `unknown` | (none) | — | — | — |

---

## 7. Orchestrator Skill Design

### 7.1 Skill Frontmatter

```yaml
---
name: orchestrator
description: Classify user intents, delegate to specialist agents, collect structured results.
---
```

### 7.2 Intent Classification (LLM-Driven)

The skill instructions tell the LLM to classify the user's message. Phase 1 uses natural-language classification — no regex, no hardcoded patterns.

The LLM is instructed to map the message to one of:
- `code_review` — PR review requested
- `ticket_lookup` — Ticket/incident status inquiry
- `ticket_fix_pr` — Ticket fix + PR creation requested
- `security_audit` — Security/vulnerability inquiry
- `code_explore` — Code search/exploration requested
- `unknown` — Doesn't match any supported intent

**Fallback for `unknown`:** Return a helpful message listing supported intents with examples.

### 7.3 Delegate Dispatch

For each intent, the orchestrator constructs a `delegate` call:

```
delegate({
  source: "<agent name>",
  parameters: {
    <extracted parameters>
  },
  extensions: ["toolshed"],
  max_turns: <from registry>,
  async: true
})
```

Parameters are extracted from the user message by the LLM and passed as typed `parameters`:
- `pr_number` (integer) — extracted from "Review PR #342"
- `repo` (string) — extracted from context or default
- `ticket_id` (string) — extracted from "INC00421"
- `query` (string) — extracted from "find the login timeout source"

**Concrete example (code review):**
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

### 7.4 Result Collection

```python
# Conceptual pseudocode — the orchestrator runs this logic

task_handle = delegate({
    source: minion_type,              # e.g. "code-reviewer"
    parameters: extracted_params,     # e.g. { pr_number: 342, repo: "org/repo" }
    extensions: ["toolshed"],
    max_turns: max_turns,
    async: true
})

# Poll until complete or timeout
start_time = now()
while True:
    result = load({ source: task_handle.task_id })
    if result.status == "completed":
        break
    if now() - start_time > timeout:
        interrupt_agent(task_handle.task_id)  # cancel runaway
        return error("timeout", minion_type=minion_type, timeout=timeout)
    sleep(2)

# Validate output
if not validate_schema(result.output, expected_schema):
    return error("invalid_output", minion_type=minion_type)

return {
    "intent": intent,
    "minion_type": minion_type,
    "status": "completed",
    "result": result.output
}
```

### 7.5 Control Plane Integration

The orchestrator skill uses the built-in `orchestrator` extension for visibility:

- **`list_sessions`** — During long-running operations, the orchestrator can monitor all delegate sessions.
- **`view_session`** — After completion, the orchestrator can inspect the minion's full session for debugging.
- **`interrupt_agent`** — If a minion times out or the user cancels, the orchestrator kills it cleanly.

---

## 8. Bot Adapter Design

### 8.1 ACP Client Model

Bot adapters are thin ACP clients — they don't reimplement the agent loop or tool calling. They bridge chat platforms to goose sessions:

```
┌──────────────┐     WebSocket      ┌──────────────┐
│  Slack Bot   │◀══════════════════▶│ goose serve  │
│              │                    │  localhost:  │
│  @slack/bolt │                    │    3284      │
│              │                    │              │
│  ┌────────┐  │                    │  ┌─────────┐ │
│  │Message │  │  "Review PR #342"  │  │Session  │ │
│  │ event  │──┼────────────────────▶│  │Manager  │ │
│  │handler │  │                    │  └────┬────┘ │
│  └────────┘  │                    │       │      │
│              │                    │       ▼      │
│  ┌────────┐  │                    │  ┌─────────┐ │
│  │Response│◀─┼────────────────────│──│Plugin   │ │
│  │poster  │  │  structured result │  │orchest. │ │
│  └────────┘  │                    │  └─────────┘ │
└──────────────┘                    └──────────────┘
```

### 8.2 Slack Bot (`bots/slack-bot/`)

**Dependencies:** `@slack/bolt` (Slack framework), ACP WebSocket client.

**Flow:**
1. Initialize Bolt app with bot token + signing secret.
2. On `message` event in an allowed channel:
   a. Post `:thinking_face:` reaction.
   b. Open ACP WebSocket to `goose serve`.
   c. Send the user message to the session.
   d. Wait for response.
   e. Post threaded reply with the result.
   f. Remove `:thinking_face:` reaction.
3. Pass correlation ID metadata if available.

**Channel allowlist:** Configurable list of channel IDs. Messages from non-allowed channels are silently ignored.

### 8.3 Teams Bot (`bots/teams-bot/`)

**Dependencies:** `@microsoft/agents-hosting` (Microsoft 365 Agent SDK), ACP WebSocket client.

**Flow:**
1. Initialize with Azure AD app registration (managed identity, no static secrets).
2. On message activity:
   a. Post typing indicator.
   b. Open ACP WebSocket to `goose serve`.
   c. Send message to session.
   d. Wait for response.
   e. Post Adaptive Card with results (links, code snippets, action buttons if applicable).
3. Team/channel allowlist via configuration.

**Security:** Delegated permissions via Azure AD. No static App ID + password. Token management handled by the SDK.

---

## 9. Slash Command Design

### 9.1 Command Format

```yaml
# commands/review-pr.yaml
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
    description: Repository in org/repo format
```

### 9.2 Command Flow

```
User types in goose session:
> /review-pr 342

Goose:
1. Parses command: name="review-pr", pr_number=342
2. Routes to orchestrator skill
3. Orchestrator classifies intent as "code_review"
4. Orchestrator delegates to code-reviewer agent
5. Result returned to session
```

### 9.3 Available Commands (Phase 1)

| Command | Arguments | Maps to intent |
|---|---|---|
| `/review-pr <number> [repo]` | pr_number (required), repo (optional) | `code_review` |
| `/triage-ticket <id>` | ticket_id (required) | `ticket_lookup` |
| `/security-scan <target>` | target (required) | `security_audit` |

---

## 10. Security Model

### 10.1 Least Privilege

Minions receive ONLY the `toolshed` extension. They have no:
- Shell access (`developer` extension not passed)
- File write access
- File edit access
- Sub-agent spawning (`summon` not passed)
- Plugin management (`extensionmanager` not passed)

### 10.2 Allowlist Enforcement

Every tool call is checked against the minion's allowlist. Unknown or disallowed tools are blocked with a logged security event. There is no "allow all" escape hatch — even the orchestrator cannot grant a minion tools beyond its configured allowlist.

### 10.3 Human-in-the-Loop (Phase 2+)

Per ADR-007, destructive operations require human approval. The toolshed's allowlist can mark certain tools as `requires_approval: true`. When such a tool is called, the toolshed holds the call, sends an approval request to the user (via Slack/Teams/session), and only forwards the call after approval.

### 10.4 Audit Trail

Every tool call — allowed and blocked — is logged to stdout as JSON. In production, Container Insights collects these logs into Azure Log Analytics. The correlation ID links every log entry to a specific session and minion.

---

## 11. Data Flow Summary

### 11.1 Full Request Lifecycle

```
User: "Review PR #342"
  │
  ├─► Slack/Teams bot
  │     │
  │     └─► ACP WebSocket → goose serve → session
  │           │
  │           └─► Plugin loaded (orchestrator skill, agents, hooks)
  │                 │
  │                 ├─► SessionStart hook: generate corr_a1b2c3d4
  │                 │
  │                 ├─► Orchestrator skill: classify → code_review
  │                 │
  │                 ├─► delegate({
  │                 │       source: "code-reviewer",
  │                 │       parameters: {
  │                 │         pr_number: 342,
  │                 │         repo: "org/repo"
  │                 │       },
  │                 │       extensions: ["toolshed"],
  │                 │       max_turns: 20,
  │                 │       async: true
  │                 │     })
  │                 │   → TaskHandle(id="...")
  │                 │
  │                 ├─► Minion (code-reviewer agent):
  │                 │     │
  │                 │     ├─► call tool: github.get_pr_diff(342)
  │                 │     │     │
  │                 │     │     └─► Toolshed:
  │                 │     │           │ allowlist check ✓
  │                 │     │           │ rate limit check ✓
  │                 │     │           │ pre-call log: corr_a1b2c3d4.1
  │                 │     │           │ forward → GitHub MCP
  │                 │     │           │ post-call log: success, 600ms
  │                 │     │           └─► return diff
  │                 │     │
  │                 │     ├─► LLM analysis
  │                 │     │
  │                 │     └─► return JSON: {pr_id, summary, issues, approved}
  │                 │
  │                 ├─► load(taskId) → JSON result
  │                 │
  │                 ├─► Schema validation: ✓
  │                 │
  │                 └─► Return to bot:
  │                       {
  │                         intent: "code_review",
  │                         minion_type: "code-reviewer",
  │                         status: "completed",
  │                         result: { ... }
  │                       }
  │
  ├─► Slack/Teams bot:
  │     │
  │     ├─► Format for platform (threaded reply / Adaptive Card)
  │     └─► Post response
  │
  └─► SessionEnd hook: write journal entry
```

---

## 12. Interface Specifications

### 12.1 Plugin Manifest (`plugin.json`)

```json
{
    "name": "goose-agent-framework",
    "version": "0.1.0",
    "description": "Multi-agent orchestration framework",
    "author": { "name": "Goose Agent Framework Team" },
    "repository": "https://github.com/org/goose-agent-framework",
    "license": "Apache-2.0",
    "agents": "./agents/",
    "skills": "./skills/",
    "commands": "./commands/",
    "rules": "./rules/",
    "hooks": "./hooks/hooks.json"
}
```

### 12.2 Agent File Format (agent.md)

```markdown
# <Agent Name>

<Role description>

## Tools

<Available tools — informational, enforcement is in toolshed>

## Process

<Step-by-step workflow>

## Output

<Expected JSON schema>
```

### 12.3 Skill File Format (SKILL.md)

```markdown
---
name: <skill-name>
description: <one-line description>
---

# <Skill Name>

<Instructions that teach goose how to perform this skill>
```

### 12.4 MCP Server (Toolshed)

**Transport:** stdio  
**Protocol:** Model Context Protocol (JSON-RPC over stdin/stdout)  
**Crate:** `rmcp` v0.4  
**Tools exposed:** All GitHub MCP tools, proxied through allowlist/rate-limit/logging  
**Config.yaml entry:**
```yaml
toolshed:
  type: stdio
  cmd: /path/to/goose-toolshed
  args: []
```

### 12.5 ACP Protocol (Bot Adapters)

**Transport:** WebSocket over HTTP  
**Default endpoint:** `ws://127.0.0.1:3284`  
**Message format:** Agent Communication Protocol (Goose-native)  
**Sessions:** Created and managed via ACP messages

---

## 13. Deployment Model

### 13.1 Development

```bash
# 1. Install the framework plugin
goose plugin install https://github.com/org/goose-agent-framework

# 2. Build and register the toolshed
cargo build --release --manifest-path mcp-servers/toolshed/Cargo.toml
goose configure --add-extension toolshed \
  --type stdio \
  --cmd "$PWD/mcp-servers/toolshed/target/release/goose-toolshed"

# 3. Start goose serve for bot ingress
goose serve --host 0.0.0.0 --port 3284

# 4. Start bot adapters
cd bots/slack-bot && npm start
cd bots/teams-bot && npm start
```

### 13.2 Production (Azure)

```
┌─────────────────────────────────────────────────────────────┐
│  Azure Container Apps                                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ goose serve  │  │ Slack Bot    │  │ Teams Bot    │      │
│  │ (ACP server) │  │ (ACP client) │  │ (ACP client) │      │
│  └──────┬───────┘  └──────────────┘  └──────────────┘      │
│         │                                                    │
│  ┌──────┴───────┐                                           │
│  │ Toolshed     │  ← MCP server (Rust binary)               │
│  │ (stdio MCP)  │                                           │
│  └──────┬───────┘                                           │
│         │                                                    │
│  ┌──────┴───────┐                                           │
│  │ GitHub MCP   │  ← External MCP server                    │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Azure Services                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Log          │  │ Key Vault    │  │ Service Bus  │      │
│  │ Analytics    │  │ (secrets)    │  │ (async queue)│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ Table Storage│  │ Blob Storage │                         │
│  │ (audit logs) │  │ (artifacts)  │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 14. Testing and Coverage

**100% test coverage is non-negotiable.** Every component in this design must have passing tests before it can be merged or deployed. The Ralph Wiggum loop is enforced at every level.

### Coverage requirements by component

| Component | Test type | Command | Required outcome |
|---|---|---|---|
| Toolshed MCP server | Rust unit tests | `cargo test` | All tests pass, 0 failures |
| Code Reviewer agent | Identity test | `goose run -i tests/roles/code-reviewer-identity.yaml` | Pass |
| Orchestrator skill | Identity test | `goose run -i tests/roles/orchestrator-identity.yaml` | All 6 intents classified correctly |
| Walking skeleton | Integration test | `goose run -i tests/integration/walking-skeleton.yaml` | Exit 0, minion completed |
| Session hooks | Shell execution | `bash hooks/session-start.sh && bash hooks/session-end.sh` | Exit 0, no errors |
| Slash commands | Manual + CI | `/review-pr 342` in goose session | Command parses, invokes orchestrator |

### The Ralph Wiggum Loop

```
  Code pushed ──▶ CI runs tests ──▶ ALL PASS ──▶ ✅ Merge
                      │
                      └── ANY FAIL ──▶ ❌ Blocked ──▶ Fix ──▶ Push ──▶ CI ──▶ ...
                                                                              │
                                                                              └── Repeat until green
```

See `testing-strategy.md` for the full coverage mandate and enforcement rules.

---

## 15. Phase 1 Scope Boundary

Phase 1 delivers the **walking skeleton**: one intent (`code_review`), one agent (`code-reviewer`), one MCP backend (GitHub), one ingress path (Slack or direct slash command).

| Component | Phase 1 | Phase 2+ |
|---|---|---|
| Orchestrator skill | LLM classification, single-minion dispatch | DAG decomposition, parallel dispatch |
| Agents | `code-reviewer.md` wired; 4 skeleton files | Full implementations for all 5 types |
| Toolshed | GitHub allowlist, rate limiting, stdout logging | Multi-MCP proxy, approval gating, Log Analytics |
| Bot adapters | Slack (ACP client) | Teams, scheduled triggers |
| Slash commands | `/review-pr` | `/triage-ticket`, `/security-scan` |
| Session hooks | Correlation ID, basic journal | Full audit trail, session replay |
| Retry/DLQ | Simple retry (3 attempts, exponential backoff) | Dead-letter queue, escalation rules |
| Multi-minion DAG | Not in scope | Phase 2 core feature |
| Human-in-the-loop | Not in scope | Phase 2 per ADR-007 |

---

## Appendix A: Goose CLI Reference (Verified Commands)

| Command | Purpose |
|---|---|
| `goose session` / `goose s` | Start/resume interactive chat |
| `goose run -i <file>` | Execute from instruction file |
| `goose run --recipe <name> --params k=v` | Run a recipe |
| `goose run -t "<text>"` | Inline text execution |
| `goose serve` | Start ACP server (HTTP/WebSocket) |
| `goose plugin install <git-url>` | Install a plugin |
| `goose plugin update <name>` | Update a plugin |
| `goose configure` | Configure settings |
| `goose info` | Display system information |
| `goose doctor` | Health check |
| `goose recipe validate` | Validate a recipe |
| `goose recipe list` | List discoverable recipes |
| `goose schedule` | Manage scheduled jobs |

## Appendix B: Verified Tool Inventory (17 tools, `--with-builtin developer`)

```
analyze                    — Tree-sitter code analysis
apps__create_app           — Dashboard app scaffolding
apps__delete_app           — Delete dashboard app
apps__iterate_app          — Iterate dashboard app
apps__list_apps            — List dashboard apps
delegate                   — Spawn sub-agent (summon)
edit                       — File editing
extensionmanager__list_resources
extensionmanager__manage_extensions
extensionmanager__read_resource
extensionmanager__search_available_extensions
load                       — Collect delegate result (summon)
load_skill                 — Load a skill
shell                      — Execute shell commands
todo__todo_write           — Task tracking
tree                       — Directory tree
write                      — File writing
```

## Appendix C: Config.yaml Extension States (Goose 1.37.0)

| Extension | Type | Default | Framework dependency |
|---|---|---|---|
| `summon` | platform | enabled | **Critical** — `delegate`/`load` |
| `orchestrator` | platform | disabled | **Required** — control plane |
| `developer` | platform | enabled | Not passed to minions |
| `skills` | platform | enabled | Required for skill loading |
| `apps` | platform | enabled | Phase 4 dashboard |
| `extensionmanager` | platform | enabled | Dynamic extension mgmt |
| `chatrecall` | platform | disabled | Optional session search |
| `analyze` | platform | enabled | Code analysis |
| `todo` | platform | enabled | Task tracking |
