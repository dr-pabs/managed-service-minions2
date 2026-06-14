# ADR-003: Use Goose extensions as the packaging unit

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

We need to package and deploy the orchestrator, toolshed, chat bots (Slack, Teams), and dashboard as independently versioned, independently deployable units. Options:

1. **Goose extensions** — each component is a standalone extension with its own manifest (`extension.yaml`), code, version, and deployment pipeline.
2. **Monolithic application** — everything in one Goose project; redeploy everything on any change.
3. **Microservices** — each component is a separate service with its own Goose instance.

## Decision

**Each component is a standalone Goose extension.**

The framework is a collection of extensions:

| Extension | Purpose |
|---|---|
| `orchestrator` | Intent classification, task decomposition, minion lifecycle |
| `mcp-toolshed` | MCP server management, allowlists, tool call logging |
| `slack-bot` | Slack message ingress/egress |
| `teams-bot` | Teams message ingress/egress |
| `agent-dashboard` | Web UI for monitoring and configuration |

Extensions declare dependencies: `orchestrator` requires `mcp-toolshed` and `chatrecall`.

## Rationale

- **Independent versioning** — The Code Reviewer prompt can change without redeploying the Slack bot. Changes are scoped to the extension that owns them.
- **Independent deployment** — GitHub Actions detects which extensions changed and deploys only those. Faster deployments, smaller blast radius.
- **Goose-native** — No new packaging format to invent. Uses Goose's existing extension model, which already handles loading, lifecycle, and tool registration.
- **Composable** — Extensions declare dependencies via `requires` in their manifest. Goose resolves the dependency graph at load time.
- **Testing isolation** — Each extension can be tested with mock dependencies, independently of the full stack.

## Consequences

### Positive
- Fast, scoped deployments
- Clear ownership boundaries
- Reusable — `mcp-toolshed` could be used by other Goose projects

### Negative / Mitigations
- **Cross-cutting concerns** — correlation IDs, logging format, and error handling must be consistent across extensions. Mitigation: These are defined by `mcp-toolshed` and injected. Extensions that don't comply are caught in integration tests.
- **Extension API surface must remain stable** — Mitigation: Semantic versioning. Breaking changes trigger major version bumps.
- **More deployment pipelines** — Mitigation: GitHub Actions templates keep them uniform.
