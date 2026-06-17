# Architecture Decision Records — Goose Agent Framework

> **Status:** Draft  
> **Date:** 2026-06-05  
> **Author:** Goose (AAIF)

---

## ADR-001: Use Goose `delegate` as the minion runtime

### Status
Accepted

### Context
We need a way to spawn specialized sub-agents ("minions") that operate independently with their own context windows, tool access, and lifecycle. Options considered:

1. **Goose `delegate`** — built-in sub-agent mechanism with async support, context isolation, and tool allowlisting
2. **Custom agent runtime** — build our own process/thread pool with custom context management
3. **External orchestrator** — Dapr Workflow, Temporal, or Azure Durable Functions

### Decision
Use Goose's `delegate` mechanism.

### Rationale
- Already supports async parallelism (`async: true`) and result collection via `load(taskId)`
- Isolated context windows prevent prompt pollution between minions
- Tool allowlisting is native — each delegate gets a curated set of extensions/tools
- No new infrastructure to build or operate
- Tightly integrated with Goose's session model

### Consequences
- Minion concurrency is bounded by Goose's delegate implementation
- Minions cannot share in-memory state directly (by design — they communicate through the orchestrator)
- Timeout and retry logic must be built in the orchestrator, not the delegate layer

---

## ADR-002: Use MCP for all tool integrations

### Status
Accepted

### Context
Minions need access to external systems: GitHub, Azure DevOps, ServiceNow, Jira, Slack, Teams, filesystems, git, and shell. Options:

1. **Model Context Protocol (MCP)** — standardized client-server protocol for tool exposure
2. **Custom Goose extensions per integration** — build a Goose extension for each external system
3. **Direct REST API calls** — have minions call REST APIs directly via shell

### Decision
Use MCP for all integrations. Build a single `mcp-toolshed` extension that manages connections to all MCP servers.

### Rationale
- **Standard protocol** — growing ecosystem of MCP servers; we get many integrations "for free"
- **Clean separation** — tools are defined once in MCP servers and shared across all minions
- **Unified allowlisting** — one extension (`mcp-toolshed`) governs all tool access
- **Interception point** — tool calls flow through the toolshed for logging, rate limiting, and security
- **Swappable backends** — if a system changes, only its MCP server changes; minions are unaffected

### Consequences
- MCP server must be available and healthy for minions to function
- Some MCP servers will need to be custom-built (e.g., Azure DevOps, ServiceNow)
- Transport diversity (stdio, SSE, WebSocket) adds connection management complexity in the toolshed

---

## ADR-003: Use Goose extensions as the packaging unit

### Status
Accepted

### Context
We need to package and deploy the orchestrator, toolshed, chat bots, and dashboard as independently versioned, independently deployable units.

### Decision
Each component is a standalone Goose extension with its own manifest, code, and deployment pipeline.

### Rationale
- **Independent versioning** — the Code Reviewer prompt can change without redeploying the Slack bot
- **Independent deployment** — GitHub Actions deploys only changed extensions
- **Goose-native** — no new packaging format to invent; uses Goose's extension model
- **Composable** — extensions declare dependencies (`requires: [mcp-toolshed]`)
- **Testing isolation** — each extension can be tested independently

### Consequences
- Cross-cutting concerns (correlation IDs, logging) must be injected or provided by the toolshed
- Extension API surface must remain stable (semantic versioning)
- Deployment complexity increases with extension count (mitigated by CI/CD automation)

---

## ADR-004: Stateless minions, stateful orchestrator

### Status
Accepted

### Context
Minions perform computational work (code exploration, review, PR creation). Should they maintain state across invocations?

### Decision
Minions are stateless and disposable. The orchestrator is stateful and maintains conversation context, session history, and cross-minion coordination.

### Rationale
- **Disposability** — a failed minion can be retried from scratch without corrupted state
- **Parallelism** — stateless minions can safely run in parallel
- **Simplicity** — minions are pure functions: `(instructions, tools) → structured_output`
- **Auditability** — every minion invocation is a clean unit of work with its own correlation ID
- **Context control** — the orchestrator decides what context to pass to each minion, preventing context pollution

### Consequences
- The orchestrator is a single point of coordination (can be mitigated with session affinity in Service Bus)
- Minion outputs must be self-contained (the orchestrator merges them)
- Long-running pipelines need the orchestrator to persist intermediate state

---

## ADR-005: Tool allowlisting per minion

### Status
Accepted

### Context
Different minions need different tools. A Code Reviewer needs GitHub PR access but not ServiceNow. A Ticket Analyst needs ServiceNow but not shell write access. How do we restrict tool access?

### Decision
Each minion has a curated tool allowlist enforced by the `mcp-toolshed` extension. Any call to a non-allowlisted tool is blocked and logged as a security event.

### Rationale
- **Least privilege** — minions get only the tools they need
- **Blast radius reduction** — a compromised or misdirected minion cannot access unrelated systems
- **Auditability** — blocked calls are logged; operators can review and adjust allowlists
- **Compliance** — demonstrates access control for audit/regulatory review

### Consequences
- Operators must maintain allowlists per minion type
- Adding a new tool to a minion requires a manifest change + deployment
- Allowlist must be comprehensive enough that minions don't fail on missing tools

---

## ADR-006: Structured JSON output contracts for minions

### Status
Accepted

### Context
Minions produce outputs that the orchestrator must merge, synthesize, and pass to downstream minions. Free-text outputs are hard to parse reliably.

### Decision
Every minion returns typed, structured JSON following a defined schema. The orchestrator validates and merges these outputs.

### Rationale
- **Machine-parseable** — orchestrator can merge outputs without LLM-based parsing
- **Type safety** — schemas can be validated at the orchestrator boundary
- **Downstream consumption** — PR Crafter gets a clean context object, not raw text
- **Versioning** — schemas can be versioned alongside prompts

### Consequences
- Minion prompts must include explicit output format instructions
- Schema evolution requires coordination (or backward-compatible changes)
- Some minion outputs (code review comments) are semi-structured and may need a `raw` fallback field

---

## ADR-007: Human-in-the-loop for destructive operations

### Status
Accepted

### Context
Minions can create PRs, update tickets, and trigger builds. Should they be able to merge PRs, close incidents, or deploy without human approval?

### Decision
All destructive operations (merge, close, delete, deploy) require explicit human confirmation via Slack/Teams. Minions recommend; humans decide.

### Rationale
- **Safety** — no autonomous destructive actions in production systems
- **Compliance** — change management requires human approval
- **Trust** — users will not adopt a system that acts unilaterally on production infrastructure
- **Flexibility** — per-action configuration in `governance.yaml` lets teams tune what requires approval

### Consequences
- Some pipelines (e.g., auto-merge trivial PRs after CI passes) may feel slower
- Approval prompts must be clear and actionable in Slack/Teams
- Timeout on pending approvals — what happens if no one responds? (default: deny, escalate)

---

## ADR-008: Async-first task execution with sync fallback

### Status
Accepted

### Context
Tasks vary in duration. "What's the status of ticket X?" takes seconds. "Fix this bug and create a PR" can take 10+ minutes.

### Decision
- **Simple queries** (single minion, fast) → synchronous execution. User waits for response.
- **Complex pipelines** (multiple minions, slow) → asynchronous. Orchestrator returns immediately with "Working on it..." and posts progress/results when done.

### Rationale
- **User experience** — fast responses for fast queries; no timeouts for slow ones
- **Platform constraints** — Slack and Teams have timeout limits (3-30 seconds)
- **Progress visibility** — async tasks post intermediate updates ("Found the code, writing fix now...")
- **Resource efficiency** — async tasks don't hold a chat connection open

### Consequences
- Orchestrator must manage async state and post progress updates
- Users must tolerate a slight delay for complex requests
- Async task failure must be communicated clearly

---

## ADR-009: SQLite + Azure Table Storage + Azure Blob for storage (reject Cosmos DB)

### Status
Accepted

### Context
We need durable storage for session state, tool call logs, and large minion outputs. Cosmos DB was considered as the Azure-native NoSQL option but rejected on cost grounds.

### Decision
Use three purpose-built stores:

| Data Shape | Store | Est. Cost |
|---|---|---|
| Hot session state | **SQLite** (local to container) | $0/month |
| Tool call log | **Azure Table Storage** | ~$1.50/month |
| Large artifacts | **Azure Blob Storage** (Cool tier) | ~$0.50/month |

Cosmos DB is explicitly rejected.

### Rationale
- **Cost** — Cosmos DB serverless starts at ~$50/month minimum, scales to $250+/month at 1M operations. Our tiered approach is ~$2-5/month.
- **Fit for purpose** — Tool call logs are append-only, partition-key queryable. Table Storage is purpose-built for this.
- **Zero-ops for hot state** — SQLite needs no Azure resource, no provisioning
- **Swappable** — An abstraction layer in the toolshed lets us migrate to a networked DB later if needed

### Consequences
- SQLite is not shared across replicas (mitigated by Service Bus session affinity)
- Table Storage has no secondary indexes (mitigated by Log Analytics for complex queries)
- SQLite backup must be handled by the application (WAL snapshots to Blob)

---

## ADR-010: Azure AI Foundry as the AI platform

### Status
Accepted

### Context
Minions need access to multiple LLM models — fast models for classification, reasoning models for orchestration, code-specialized models for review and generation. Options:

1. **Azure AI Foundry** — unified model catalog with built-in content safety, RBAC, monitoring
2. **Direct OpenAI API** — manage API keys per model provider
3. **Self-hosted models** — run vLLM or similar on our own compute

### Decision
Use Azure AI Foundry as the single AI platform.

### Rationale
- **Unified model catalog** — access any model via configurable tiers (fast, reasoning, code_review, code_generation, security)
- **Built-in content safety** — AI Content Safety filters for prompt injection and harmful output at the platform level
- **RBAC** — Azure AD integration for access control (managed identities, not API keys)
- **Monitoring** — built-in metrics, logging, and alerting
- **Regional compliance** — models deployed in specific Azure regions for data residency
- **No key management** — Goose containers use managed identity, not static API keys

### Consequences
- Model availability is region-dependent (may need multi-region deployment)
- Foundry deployments must be provisioned ahead of time
- Slight latency overhead vs. direct API (acceptable for batch/async tasks)

---

## ADR-011: Azure Container Apps for compute

### Status
Accepted

### Context
We need to run Goose orchestrator containers, bot containers, and MCP sidecars. Options:

1. **Azure Container Apps (ACA)** — serverless containers
2. **Azure Kubernetes Service (AKS)** — managed Kubernetes
3. **Azure App Service** — PaaS web hosting
4. **Azure Container Instances** — single-container

### Decision
Use Azure Container Apps.

### Rationale
- **Serverless** — no cluster to manage; scale-to-zero when idle
- **KEDA autoscaling** — scale based on Service Bus queue depth, not CPU
- **Dapr integration** — optional, for future service-to-service communication
- **Cost** — pay only for active containers; scale-to-zero eliminates idle costs
- **Managed TLS** — automatic HTTPS for public endpoints (Teams/Slack bots)
- **Revision management** — blue/green deployments built-in

### Consequences
- Not all MCP transports may work in ACA (stdio-based MCPs need sidecar containers)
- Higher cold-start latency than always-warm AKS (acceptable for batch-oriented workload)
- Maximum container lifetime (24h before recycle) — must handle graceful shutdown

---

## ADR-012: Azure Service Bus for async task queuing

### Status
Accepted

### Context
Complex pipelines (ticket→fix→pr) involve multiple minion invocations that must be coordinated. Options:

1. **Azure Service Bus** — managed message broker with sessions
2. **Azure Storage Queues** — simpler, cheaper, no sessions
3. **RabbitMQ** — self-hosted
4. **In-memory queue** — no external dependency

### Decision
Use Azure Service Bus (Standard tier, ~$10/month).

### Rationale
- **Sessions** — ordered delivery per correlation ID ensures pipeline steps don't run out of order
- **Dead-letter** — failed tasks automatically move to DLQ for inspection/replay
- **Duplicate detection** — prevents double-processing of the same task
- **Scheduled messages** — supports delayed retry with exponential backoff
- **Standard tier** — $10/month, includes all features needed

### Consequences
- Adds a managed Azure resource (cost and ops)
- Session-based ordering limits fan-out within a session (acceptable — parallel work uses separate sessions)
- Service Bus has message size limits (256KB Standard); large context must go via Blob reference

---

## ADR-013: GitHub as framework source of truth + CI/CD

### Status
Accepted

### Context
Where should the framework's own code, prompts, governance config, and deployment pipelines live?

### Decision
GitHub serves as the single source of truth for all framework artifacts, and GitHub Actions provides CI/CD.

### Rationale
- **Version control** — prompts and governance rules are code; they change via PR with human review
- **CI/CD** — GitHub Actions triggers container builds and deploys on merge to main
- **Self-improvement** — minions can propose prompt/rule changes by opening PRs against the framework repo
- **Transparency** — all changes are visible, auditable, and revertible
- **Ecosystem** — integrates natively with GitHub MCP for cross-referencing

### Consequences
- Deployment secrets must be stored in GitHub (use OIDC to Azure, not static secrets)
- Prompt changes require a deployment cycle (not real-time; acceptable for governed changes)
- GitHub outage = cannot deploy (acceptably rare)

---

## ADR-014: Microsoft Teams as Phase 1 priority (peer to Slack)

### Status
Accepted

### Context
The framework must receive instructions from both Slack and Microsoft Teams. Original design pushed Teams to Phase 4; this ADR elevates it.

### Decision
Microsoft Teams is a Phase 1 delivery, on par with Slack. Both bots are built in parallel.

### Rationale
- **Enterprise reality** — many organizations (especially Azure-heavy) are Teams-first
- **Azure DevOps synergy** — Teams + Azure DevOps + Azure AD = seamless enterprise stack
- **Adaptive Cards** — richer interaction model than Slack Block Kit (actionable buttons, deep links)
- **Meeting integration** — future capability: add Goose to meetings, ask it to summarize discussions
- **No marginal platform cost** — Microsoft 365 Agent SDK (successor to the deprecated Bot Framework SDK) covers both; second bot is mostly configuration

### Consequences
- Two bot frameworks to maintain (Slack Bolt + Microsoft 365 Agent SDK)
- Slight differences in response formatting (Adaptive Cards vs. Block Kit)
- Both must be tested independently

---

## ADR-015: Azure DevOps as first-class MCP integration

### Status
Accepted

### Context
Many enterprises use Azure DevOps (ADO) rather than GitHub for source control, work tracking, and CI/CD. Should ADO be a first-class integration?

### Decision
Azure DevOps MCP is a first-class integration, peer to GitHub MCP. Work items, PRs, repos, builds, and WIQL queries are fully supported.

All minions that support GitHub also support Azure DevOps:
- **Code Reviewer** reviews ADO PRs
- **PR Crafter** creates ADO PRs and links work items
- **Ticket Analyst** queries ADO work items and cross-references with ServiceNow/Jira
- **Security Auditor** checks ADO Advanced Security alerts

### Rationale
- **Enterprise adoption** — ADO is the default for Azure-centric enterprises
- **Work item linking** — ADO PRs can natively link to work items (AB#1234 syntax)
- **Unified pipeline** — "Fix work item #567" works the same regardless of platform
- **No marginal cost** — MCP server development is a fixed cost; minion platform-awareness is a thin abstraction

### Consequences
- PR Crafter and Code Reviewer must detect the target platform (GitHub or ADO) from context
- ADO PATs must be provisioned with appropriate scopes
- ADO API has different rate limits than GitHub

---

## ADR-016: Three-layer tool call capture

### Status
Accepted

### Context
Every tool call must be logged for auditability, debugging, and compliance. Options:

1. **Single layer** — log at the tool call site only
2. **Two layers** — log at both minion and server
3. **Three layers** — Goose-native + MCP proxy + server-side

### Decision
Implement three-layer capture:

| Layer | Where | Purpose |
|---|---|---|
| **A: Goose-native** | Delegate infrastructure | Session reconstruction, automatic |
| **B: MCP toolshed proxy** | Between minion and MCP server | Primary capture point. Allowlist enforcement, rate limiting, parameter logging |
| **C: Server-side** | MCP server itself (optional) | Defense-in-depth; verifies toolshed logging |

### Rationale
- **Layer B is mandatory** — every call flows through the toolshed; capture is unavoidable
- **Layer A is free** — Goose already tracks tool calls internally
- **Layer C is optional defense** — servers log independently; can detect a compromised toolshed
- **Immutable log** — Layer B writes to Azure Table Storage (append-only)
- **Real-time observability** — Layer B also streams to stdout → Container Insights → Log Analytics for KQL

### Consequences
- Tool call latency increases by ~1-2ms (Table Storage write + stdout emit) — negligible
- Three layers of logs may show discrepancies (timing, truncation); Layer B is authoritative
- Table Storage has no schema enforcement; the toolshed must ensure consistent column shapes

---

## ADR-017: Correlation ID propagation for distributed tracing

### Status
Accepted

### Context
A single user request spans: intent classification → multiple minions → multiple tool calls per minion → multiple MCP server calls. How do we trace the full execution tree?

### Decision
Every orchestration generates a **root correlation ID** that propagates through the entire call tree in a hierarchical format:

```
corr_<uuid>                    ← Root (session)
corr_<uuid>.<n>                ← Minion (n = minion index in DAG)
corr_<uuid>.<n>.<server>-<m>   ← Tool call (server = mcp server alias, m = call sequence)
```

Examples:
```
corr_a1b2c3                    ← Session
corr_a1b2c3.1                  ← Ticket Analyst minion
corr_a1b2c3.1.ado-001          ← First ADO tool call in that minion
corr_a1b2c3.3.gh-001           ← First GitHub tool call in PR Crafter
```

### Rationale
- **Hierarchical** — the ID encodes the parent-child relationship
- **Sortable** — lexicographic sort reveals execution order
- **Queryable** — `startswith(corr_a1b2c3)` returns everything for a session
- **No external dependency** — no distributed tracing service needed (though Log Analytics can consume these)
- **Human-readable** — operators can identify the session and minion from the ID

### Consequences
- The orchestrator must generate and propagate the root ID
- Minions receive their sub-ID in their instructions
- The mcp-toolshed appends tool-call sequence numbers
- Long pipelines with many minions may produce long IDs (still well within limits)

---

## ADR-018: Observability dashboard design

### Status
Proposed

### Context
The framework generates significant telemetry — sessions, minion runs, tool calls, failures, cost, and rate limits. Operators need visibility into all of this for debugging, capacity planning, and compliance. Options:

1. **Azure Managed Grafana** — managed dashboard service with native Azure Monitor data source.
2. **Custom Goose extension (`agent-dashboard`)** — full-custom web UI built as a Goose app.
3. **Azure Monitor Workbooks** — built-in Azure portal dashboards with KQL.
4. **Third-party observability** — Datadog, New Relic, etc.

### Decision
Use a **two-tier approach**:

| Tier | What | Who for | Build effort |
|---|---|---|---|
| **Tier 1: Azure Managed Grafana** | Curated dashboards for minion health, tool call metrics, cost, and alerts | Platform operators, SREs | Low |
| **Tier 2: Custom `agent-dashboard`** | Session replay, correlation tree viewer, live minion status, governance config | Framework users, developers | Medium (Phase 4) |

Azure Monitor Workbooks are used for ad-hoc KQL exploration and alert authoring.

### Rationale
- **Grafana** is zero-code, purpose-built for metrics and dashboards. It handles alerting, annotation, and team sharing natively. Azure Managed Grafana is zero-ops with Azure AD SSO. Essential plan at $0/month (up to 2 dashboards, 5 users).
- **The custom dashboard** provides Goose-specific views that a generic metrics tool can't: correlation tree visualization, session replay, governance config editor, and one-click retry of failed sessions.
- **Shared data sources** — both read from Log Analytics + Table Storage. No duplication.

Four Grafana dashboards are defined:
1. **Overview** — active sessions, minion runs, success rate, tool call latency, queue depth, failures
2. **Minion Health** — runs by type, timeout rate, retry distribution, avg turns, token consumption
3. **Cost & Capacity** — token usage by model, estimated cost, rate limit hits, replica count, DLQ depth
4. **Security** — blocked tool calls, pending approvals, content safety triggers

Seven alert rules cover minion timeouts, DLQ depth, failure rate spikes, rate limit exhaustion, idle detection, stale approvals, and container restarts.

### Consequences
- **Two-tier observability** — ops-grade for SREs (Grafana), introspective for users (custom dashboard)
- **Zero-ops Grafana** with Azure Managed
- **Shared data sources** — no duplication
- **Grafana essential plan limited to 2 dashboards** — Mitigation: standard plan at ~$9/user/month if more needed, or use free Azure Monitor Workbooks as supplement
- **Custom dashboard is Phase 4** — Mitigation: Grafana covers operational needs from Day 1

---

## ADR-019: Filesystem path scoping per minion

### Status
Proposed

### Context
Minions explore codebases. A PR Crafter modifying the auth module should not read billing code. A Ticket Analyst investigating a payment incident should not browse HR configuration. The Filesystem MCP currently has global workspace boundaries — all minions that can read files can read all files within the workspace.

### Decision
Extend the per-minion allowlist model (ADR-005) to include filesystem path scoping within the MCP Toolshed. Every minion's manifest gains an optional `path_scope` in `allowlist`, `denylist`, or `none` mode. Enforcement is at the toolshed layer — same codepath as tool allowlisting. A minion's effective access is the intersection of tool allowlist and path scope.

### Rationale
- Same principle as tool allowlisting (ADR-005), applied to the data layer
- Accidental damage prevention — a minion can't overwrite files outside its scope
- Compliance — PCI/HIPAA modules excluded from AI access
- Performance — scoped minions search less, iterate faster
- Reuses existing toolshed enforcement mechanism

### Consequences
- Defense-in-depth: tool + path restrictions
- Scopes are PR-reviewed and version-controlled
- Allowlist mode preferred for sensitive minions; denylist for broad explorers

---

## ADR-020: Optional semantic code tagging

### Status
Proposed

### Context
Agents find code by searching, reading, and tracing symbols — effective but brute-force. Semantic tags (annotations in code) could shortcut discovery, reducing token burn on false positives. Should the framework require tags, support them optionally, or ignore them?

### Decision
Tags are optional accelerators, never a dependency. Three formats are supported: inline annotation comments (`@owner`, `@domain`, `@sla`), per-directory `.goose-tags.yaml`, and a global `.goose-tags.yaml` at the repo root. Agents use tags as navigation hints. When tags are absent or stale, agents fall back to search-based code exploration. Tags are NOT a security boundary (path scoping handles that), NOT enforced by CI, and NOT ingested automatically — they're read lazily during code exploration.

### Rationale
- Adoption gradient — teams start with zero tags, add where precision matters
- Degrades gracefully — missing tags never break the agent
- Avoids the "tag tax" — no mandatory maintenance burden
- Same tools, same loop — tags are just files the Code Explorer reads

### Consequences
- Zero onboarding friction
- Linear adoption path
- Faster incident-to-code for tagged modules
- Stale tag risk mitigated by cross-referencing with git history

---

## ADR-021: Prompt lifecycle and quality measurement

### Status
Proposed

### Context
Minion behavior is governed by system prompts. A prompt change can improve review quality or silently degrade it. We need a defined lifecycle.

### Decision
Prompts are version-controlled artifacts with a measured lifecycle: Author → PR Review → Canary (10% of runs) → Measure (24-48h) → Full Rollout or Rollback. Quality metrics include review acceptance rate, false positive rate, token efficiency, and regression detection. Rollback is a Git revert + redeploy. A test case bank of 50-100 scenarios per minion evaluates prompt candidates against baselines before canary.

### Rationale
- Same CI/CD pipeline as code
- Canary reduces blast radius — a bad prompt affects 10% of runs
- Metrics create a closed feedback loop
- Rollback is a single Git operation

### Consequences
- Prompt authors must accept 24-48h canary window
- Baseline metrics needed (first 2 weeks of production)
- Small teams may skip canary due to low statistical significance

---

## ADR-022: Multi-tenancy model

### Status
Proposed

### Context
If multiple teams use the framework, how do we isolate sessions, data, workspaces, and governance?

### Decision
Shared infrastructure with hard isolation per team. One deployment serves all teams. Per-team isolation: separate Table Storage tables, Blob containers, workspace boundaries, and governance configs. Team ID propagates through the correlation ID. Channel-to-team mapping in a version-controlled registry.

### Rationale
- Cost efficiency — one AI Foundry project, one Service Bus namespace
- Hard isolation where it matters (data, workspaces, governance)
- Operational simplicity — one deployment to monitor
- Team autonomy within shared infrastructure

### Consequences
- Channel-to-team mapping must be maintained
- Shared AI Foundry means throttling affects all teams
- Prefer global prompts initially; per-team overrides add complexity
