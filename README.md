# Managed Service Minions

A multi-agent orchestration framework for the [Goose](https://github.com/aaif-goose/goose) platform. Classifies service desk intents, delegates to specialist AI agents ("minions"), and returns structured results — all through governed tool access.

## What it does

| Capability | Description |
|---|---|
| **Intent Classification** | Natural-language parsing of service requests: PR reviews, ticket triage, security audits, code exploration, ticket-to-PR workflows |
| **Specialist Minions** | 5 purpose-built AI agents: Code Reviewer, Code Explorer, PR Crafter, Ticket Analyst, Security Auditor |
| **Tool Governance** | Toolshed MCP server enforces per-agent allowlists, rate limiting, and full audit logging |
| **Chat Platform Ingress** | Slack and Teams bot adapters via Goose's ACP protocol |
| **Session Tracing** | Correlation IDs propagate through every minion and tool call for full trace reconstruction |
| **Slash Commands** | `/review-pr`, `/triage-ticket`, `/security-scan` — invoke the framework directly in a Goose session |

## Architecture

```text
User (Slack / Teams / Goose session)
        │
        ▼
┌─────────────────────────────────┐
│  Orchestrator Skill             │
│  (.agents/skills/orchestrator)  │
│                                 │
│  Classify intent → Dispatch     │
└──────────────┬──────────────────┘
               │ delegate({ source: "code-reviewer", ... })
               ▼
┌─────────────────────────────────┐
│  Specialist Minions             │
│  (.agents/agents/)              │
│                                 │
│  code-reviewer  code-explorer   │
│  pr-crafter     ticket-analyst  │
│  security-auditor               │
└──────────────┬──────────────────┘
               │ extensions: ["toolshed"]
               ▼
┌─────────────────────────────────┐
│  Toolshed MCP Server            │
│  (mcp-servers/toolshed)         │
│                                 │
│  Allowlist → Rate Limit →       │
│  Audit Log → Forward to GitHub  │
└─────────────────────────────────┘
```

## Prerequisites

- **Goose 1.37.0+** — `brew install goose` or `pipx install goose-cli`
- **Git** — for plugin installation
- **Rust** (optional) — for building the toolshed MCP server (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **GitHub Personal Access Token** — set as `GITHUB_PERSONAL_ACCESS_TOKEN` for PR review functionality

## Quick Start

```bash
# 1. Install the framework as a Goose plugin
goose plugin install https://github.com/dr-pabs/managed-service-minions2

# 2. Verify the installation
goose plugin list | grep goose-agent-framework

# 3. Build and register the toolshed (optional, requires Rust)
cargo build --release --manifest-path ~/.agents/plugins/goose-agent-framework/mcp-servers/toolshed/Cargo.toml
goose configure --add-extension toolshed \
  --type stdio \
  --cmd "$HOME/.agents/plugins/goose-agent-framework/mcp-servers/toolshed/target/release/goose-toolshed"

# 4. Review a PR from a Goose session
goose session
> /review-pr 342
```

## Slash Commands

| Command | Arguments | Description |
|---|---|---|
| `/review-pr` | `pr_number` (required), `repo` (optional) | Review a pull request for bugs, style, performance, and security |
| `/triage-ticket` | `ticket_id` (required) | Look up a ticket or incident status |
| `/security-scan` | `target` (required) | Scan a target for security vulnerabilities |

## Bot Ingress

Start Goose as an ACP server to enable Slack/Teams bot connectivity:

```bash
GOOSE_SERVER__SECRET_KEY='your-secret' goose serve --host 0.0.0.0 --port 3284
```

Bot adapters connect via WebSocket to `ws://localhost:3284/acp?token=your-secret`. See `bots/` directory for Slack and Teams adapter implementations.

## Project Structure

```text
managed-service-minions2/
├── .plugin/
│   └── plugin.json              # Plugin manifest
├── .agents/
│   ├── skills/
│   │   └── orchestrator/
│   │       └── SKILL.md         # Orchestrator: classify → delegate → collect
│   └── agents/
│       ├── code-reviewer.md     # PR review agent
│       ├── code-explorer.md     # Code search agent
│       ├── pr-crafter.md        # PR creation agent
│       ├── ticket-analyst.md    # Ticket lookup agent
│       └── security-auditor.md  # Security scanning agent
├── commands/
│   ├── review-pr.yaml           # /review-pr slash command
│   ├── triage-ticket.yaml       # /triage-ticket slash command
│   └── security-scan.yaml       # /security-scan slash command
├── hooks/
│   ├── hooks.json               # Lifecycle event triggers
│   ├── session-start.sh         # Correlation ID initialization
│   └── session-end.sh           # Session journal write
├── rules/
│   └── allowlist-rules.md       # Standing orders and governance rules
├── mcp-servers/
│   └── toolshed/                # Rust MCP server — tool governance proxy
│       ├── Cargo.toml
│       └── src/
│           ├── main.rs          # Bootstrap
│           ├── allowlist.rs     # Per-agent allowlist enforcement (6 tests)
│           ├── proxy.rs         # Interception: allowlist → log → forward
│           └── logger.rs        # JSON audit logger
├── bots/
│   ├── slack-bot/               # Slack ACP client
│   └── teams-bot/               # Teams ACP client
├── tests/
│   ├── runner.sh                # Unified test runner — all 4 gates
│   ├── integration/
│   │   └── walking-skeleton.md  # End-to-end integration test
│   └── roles/
│       ├── orchestrator-identity.md
│       └── code-reviewer-identity.md
├── docs/
│   ├── low-level-design.md      # Technical architecture reference
│   └── execplan/
│       └── phase-1-foundation.md # Delivery execution plan
├── adrs/                        # 22 Architecture Decision Records
├── README.md
└── AGENTS.md                    # Project instructions for AI agents
```

## Testing

**100% test coverage is mandatory.** The Ralph Wiggum loop is enforced: if a test fails, the code goes back to the developer, gets fixed, and gets tested again — repeating until ALL tests pass. There is no skip button.

### Run All Tests

```bash
bash tests/runner.sh
```

Exits 0 only if all 4 gates pass:

| Gate | What it verifies |
|---|---|
| Orchestrator Identity | All 6 intents classified correctly |
| Code Reviewer Identity | 9 assertions: role, tools, output schema |
| Delegate Spawn | `delegate({ source: "code-reviewer" })` resolves and returns JSON |
| Walking Skeleton | End-to-end: classify → delegate → collect → validate |

### CI Enforcement

| Rule | Enforcement |
|---|---|
| **No merge on red** | CI blocks merge if any test fails |
| **Fix the root cause** | No disabling tests or lowering thresholds without written exemption |
| **Full pipeline re-run** | Required after every fix |
| **Maintainer/QA approval** | Required before merge |
| **Linting must pass** | `cargo clippy` (Rust), `markdownlint` (Markdown), `yamllint` (YAML), `shellcheck` (bash) |

See `testing-strategy.md` for the complete quality framework.

## Quality Policy

```text
┌─────────────────────────────────────┐
│  Code pushed ──▶ CI runs all tests  │
│                    │                │
│                    ├── ALL PASS ──▶ ✅ Merge allowed
│                    │                │
│                    └── ANY FAIL ──▶ ❌ Blocked ──▶ Fix ──▶ Push ──▶ Repeat
│                                                              │
│  "I'm helping!" — Ralph Wiggum    ◀─────────────────────────┘
└─────────────────────────────────────┘
```

## Documentation

| Document | Purpose |
|---|---|
| `docs/low-level-design.md` | Complete technical reference — Goose primitives, architecture, agent lifecycle, toolshed design, ACP protocol, security model |
| `docs/execplan/phase-1-foundation.md` | Delivery execution plan with progress tracking, decision log, and concrete steps |
| `docs/testing-strategy.md` | Test pyramid, coverage mandate, CI enforcement rules |
| `docs/delivery-specification.md` | Scope, workstreams, phases, acceptance criteria |
| `adrs/` | 22 Architecture Decision Records |

## License

Apache 2.0
