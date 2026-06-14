# ADR-005: Tool allowlisting per minion

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

Different minions need different tools. A Code Reviewer needs GitHub PR access but not ServiceNow. A Ticket Analyst needs ServiceNow but not shell write access. A PR Crafter needs git push but not the ability to close production incidents.

How do we restrict tool access per minion type?

Options:

1. **Per-minion allowlists** — each minion type has an explicit list of allowed tools per MCP server.
2. **Role-based** — define roles (Reader, Writer, Admin), assign each minion a role.
3. **Open access** — all minions can access all tools. Trust the system prompt to constrain behavior.
4. **No restrictions** — minions call whatever they want.

## Decision

**Each minion type has a curated tool allowlist enforced by the `mcp-toolshed` extension.**

Any call to a non-allowlisted tool is **blocked at the toolshed level** and logged as a security event. The minion never reaches the target MCP server.

The allowlist is defined in the orchestrator extension manifest:

```yaml
minions:
  ticket-analyst:
    tools:
      servicenow: {allow: [query_incidents, get_incident, query_changes]}
      azure_devops: {allow: [search_work_items, get_work_item, run_query]}
      # No access to: github write, filesystem write, git, shell, docker
```

## Rationale

- **Least privilege** — Each minion gets only the tools essential for its function. A misdirected or compromised minion has minimal blast radius.
- **Enforcement at the boundary** — The toolshed blocks before the call reaches the MCP server. No reliance on server-side permissions alone.
- **Auditable** — Blocked calls are logged with the minion type, requested tool, timestamp, and correlation ID. Operators can review and adjust.
- **Compliance** — An explicit, version-controlled allowlist demonstrates access control for audit and regulatory review.
- **Focus** — Restricting tools also constrains minion behavior, reducing decision paralysis and improving output quality.

## Consequences

### Positive
- Strong security boundary
- Clear compliance posture
- Reduced blast radius

### Negative / Mitigations
- **Operators must maintain allowlists** — Mitigation: Allowlists are version-controlled YAML in the framework repo. Changes go through PR review.
- **Adding a tool requires a manifest change + deployment** — Mitigation: This is intentional. Tool access changes should be deliberate and reviewed.
- **Allowlist must be complete enough** — Minions must not fail because a needed tool is missing. Mitigation: Allowlists are defined alongside minion prompts; integration tests verify minions can complete their tasks.
