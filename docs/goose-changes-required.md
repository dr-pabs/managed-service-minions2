# Goose Core Changes Required

> **Date:** 2026-06-06\
> **Purpose:** Audit every framework capability and determine what requires a change to Goose core vs. what is implemented in extensions.

______________________________________________________________________

## Audit Method

For each framework capability, ask: *"Does Goose already provide the primitive we need, or do we need to modify Goose itself?"*

Three categories:

- 🟢 **Extension-only** — No Goose change. Built entirely in extensions.
- 🟡 **Extension + config** — No code change to Goose. Uses existing primitives with new configuration.
- 🔴 **Goose core change** — Goose itself must be modified.

______________________________________________________________________

## Capability Audit

### Orchestration & Minions

| Capability | Category | How |
|---|---|---|
| Spawn minions as isolated delegates | 🟢 Extension | `delegate(instructions, extensions, max_turns, async: true)` already works. The orchestrator calls this. |
| Restrict minion tool access per type | 🟢 Extension | The `extensions` parameter on `delegate` already restricts which extensions a delegate can use. The orchestrator passes only `["mcp-toolshed"]`. The toolshed enforces per-minion allowlists internally. |
| Collect minion results | 🟢 Extension | `load(taskId)` already returns delegate output. The orchestrator validates JSON schemas. |
| Timeout minions | 🟡 Extension + config | `max_turns` on delegate already works. A timeout wall-clock is added by the orchestrator's monitor (polling `load(taskId)` with a deadline). No Goose change. |
| Retry failed minions | 🟢 Extension | Orchestrator catches failure, re-calls `delegate` with the same parameters. |
| Dead-letter exhausted minions | 🟢 Extension | Orchestrator sends to Service Bus DLQ after retries exhausted. Goose doesn't need to know about Service Bus. |
| Minion path scoping (ADR-019) | 🟢 Extension | Enforced by `mcp-toolshed` before passing calls to the Filesystem MCP. No Goose change. |

### Multi-Model Routing

| Capability | Category | How |
|---|---|---|
| Use different models per minion type | 🟡 Extension + config | The `delegate` function accepts `provider` and `model` overrides. The orchestrator passes the tier's deployment name. If Goose doesn't support per-delegate model override, this becomes 🔴. |
| Model tier abstraction (fast/reasoning/code_review) | 🟢 Extension | Tier-to-deployment mapping is in `provider.yaml`. The orchestrator resolves tier → deployment name before calling `delegate`. |
| Provider fallback on deployment failure | 🔴 Goose core or 🟡 | If Goose doesn't support fallback providers, the orchestrator catches the error and retries with the fallback deployment. This might need Goose core support for seamless failover. |
| Managed identity auth to AI Foundry | 🟡 Config | Azure OpenAI provider already supports Azure AD auth if configured. If not, this becomes 🔴. |

### Tool Call Interception

| Capability | Category | How |
|---|---|---|
| Intercept every tool call for logging | 🟢 Extension | The `mcp-toolshed` is the ONLY extension passed to minions. Every tool call from the minion goes through it. The toolshed wraps each call with pre/post logging. |
| Enforce tool allowlists per minion | 🟢 Extension | The toolshed holds the allowlist config. Before forwarding a call to the real MCP server, it checks the allowlist. |
| Rate-limit tool calls | 🟢 Extension | Sliding window counter in the toolshed. |
| Block tool calls before they reach MCP servers | 🟢 Extension | The toolshed returns an error to the minion without ever calling the MCP server. |

### Entry Points

| Capability | Category | How |
|---|---|---|
| Slack bot ingress | 🟢 Extension | `slack-bot` Goose extension using Slack Bolt. Receives HTTP webhooks, forwards to orchestrator. No Goose change. |
| Teams bot ingress | 🟢 Extension | `teams-bot` Goose extension using Microsoft 365 Agent SDK. Receives HTTP activities, forwards to orchestrator. No Goose change. |
| Scheduled triggers | 🟢 Extension | `platform__manage_schedule` already supports cron. Recipes invoke the orchestrator. No Goose change. |
| Web dashboard | 🟢 Extension | `apps__create_app` generates the `agent-dashboard` extension. No Goose change. |

### State & Storage

| Capability | Category | How |
|---|---|---|
| Session state persistence | 🟢 Extension | Goose sessions already persist. The orchestrator extends this with SQLite for structured metadata. No Goose change. |
| SQLite backup to Blob | 🟢 Extension | The orchestrator writes WAL snapshots to Blob on an interval. Goose doesn't know about Blob. |
| Tool call log to Table Storage | 🟢 Extension | The toolshed writes to Table Storage via Azure SDK. Goose doesn't know about Table Storage. |

### Observability

| Capability | Category | How |
|---|---|---|
| Structured logging to stdout | 🟢 Extension | The toolshed prints JSON to stdout. Container Insights picks it up. No Goose change. |
| Grafana dashboards | 🟢 External | Azure Managed Grafana queries Log Analytics. Not a Goose concern. |
| Alert rules | 🟢 External | Azure Monitor alert rules on KQL queries. Not a Goose concern. |

### Security

| Capability | Category | How |
|---|---|---|
| Human-in-the-loop approval | 🟢 Extension | The orchestrator pauses the pipeline, posts to Slack/Teams, waits for response. Goose delegates don't need to know about approvals. |
| Managed identity to Azure services | 🟢 Extension | Azure SDK in the toolshed and orchestrator uses `DefaultAzureCredential`. Goose doesn't handle auth. |
| Content safety filtering | 🟢 External | Azure AI Foundry applies content safety before the LLM sees the prompt. Goose doesn't implement this. |

______________________________________________________________________

## Summary: Goose Core Changes Needed

### 🟢 No change needed (18 capabilities)

The vast majority of the framework is extension code. Goose's existing primitives — `delegate`, `load(taskId)`, extensions, MCP tool spec, sessions, `platform__manage_schedule`, `apps__create_app` — cover everything.

### 🟡 Needs verification (3 capabilities)

These *should* work with Goose's existing API, but need explicit testing:

| # | Capability | Verification needed |
|---|---|---|
| 1 | **Per-delegate model/provider override** | Does `delegate()` accept `model` and `provider` parameters that override the session defaults? If yes, tier routing works. If not, each minion type needs its own Goose instance (messy). |
| 2 | **Managed identity to Azure OpenAI** | Does the Azure OpenAI provider support `DefaultAzureCredential` (managed identity) rather than API keys? If not, we fall back to Key Vault-stored API keys, which is acceptable but less elegant. |
| 3 | **Provider fallback** | If a model deployment returns 429 or 503, can Goose automatically try a fallback? If not, the orchestrator catches the error at the delegate level and retries with a different model config. |

### 🔴 Likely needs Goose change (1 capability)

| # | Capability | What Goose needs |
|---|---|---|
| 4 | **Cancelling a running delegate** | The Live Minion Status dashboard view needs a "Cancel" button. Goose needs a `cancel(taskId)` or `delegate.cancel()` API to terminate a running delegate mid-execution. Without this, a stuck minion runs until `max_turns` — wasting tokens. |

### Bonus: Nice-to-have Goose enhancements (not blockers)

| Enhancement | Why it helps | Severity |
|---|---|---|
| **Delegate progress events** | Instead of polling `load(taskId)`, the orchestrator could subscribe to progress events (turn started, tool called, turn completed). This would make the Live view real-time. | Nice-to-have |
| **Delegate token usage callback** | A callback after each turn with cumulative token count. The orchestrator could enforce token budgets without polling. | Nice-to-have |
| **Structured output mode** | If `delegate` had a `response_format: json_schema` mode, Goose could enforce minion output schemas at the platform level rather than in the orchestrator. | Nice-to-have |
| **Per-delegate rate limits** | If Goose could rate-limit tool calls per delegate (not just globally), the toolshed's rate limiter would be simpler. | Nice-to-have |

______________________________________________________________________

## What We Do NOT Need Goose To Do

To be explicit about boundaries — these are things we deliberately do *not* ask Goose to handle:

- ❌ Service Bus integration — the orchestrator handles this
- ❌ Table Storage / Blob Storage — the toolshed and orchestrator handle these
- ❌ Multi-minion DAG orchestration — the orchestrator handles this
- ❌ Tool call audit logging — the toolshed handles this
- ❌ Human-in-the-loop approvals — the orchestrator handles this
- ❌ Intent classification — the orchestrator's prompt handles this
- ❌ Correlation ID propagation — the orchestrator and toolshed handle this
- ❌ Slack/Teams adapters — separate extensions
- ❌ Grafana dashboards — external Azure service
- ❌ Content safety — AI Foundry platform feature

Goose remains the **agent runtime** — the loop, the tools, the sub-agent spawning. Everything else is extension code or external Azure services.
