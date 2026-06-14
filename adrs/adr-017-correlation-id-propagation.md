# ADR-017: Correlation ID propagation for distributed tracing

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

A single user request spans multiple execution units:
```
User message → Intent classification → Minion A (parallel)
                                      → Minion B (parallel)
                                      → Orchestrator merge
                                      → Minion C (dependent on A+B)
                                      → Tool calls within each minion
```

We need to trace the full execution tree — every minion, every tool call, every MCP interaction — back to the originating user request.

Options:

1. **Hierarchical correlation IDs** — structured, human-readable, encodes parent-child in the ID.
2. **W3C Trace Context** — `traceparent` / `tracestate` headers (OpenTelemetry standard).
3. **Flat UUIDs with a mapping table** — every entity gets a random UUID. A separate table maps parent-child.
4. **No correlation** — logs are timestamp-based. Correlation is done post-hoc.

## Decision

Use **hierarchical correlation IDs** that encode the parent-child relationship directly in the ID string.

### Format

```
corr_<uuid>                    ← Root (orchestration session)
corr_<uuid>.<n>                ← Minion (n = sequential minion index in the DAG)
corr_<uuid>.<n>.<server>-<m>   ← Tool call (server = MCP server alias, m = call sequence within the minion)
```

### Examples

```
corr_a1b2c3                    ← Session root
corr_a1b2c3.1                  ← Minion 1 (e.g., Ticket Analyst)
corr_a1b2c3.1.sn-001           ← First ServiceNow call in Minion 1
corr_a1b2c3.1.ado-001          ← First Azure DevOps call in Minion 1
corr_a1b2c3.2                  ← Minion 2 (e.g., Code Explorer, parallel with Minion 1)
corr_a1b2c3.2.fs-001           ← First filesystem call in Minion 2
corr_a1b2c3.3                  ← Minion 3 (e.g., PR Crafter, depends on 1+2)
corr_a1b2c3.3.gh-001           ← First GitHub call in Minion 3
```

## Rationale

- **Encodes parent-child** — You can determine the full tree from the ID alone. No mapping table needed.
- **Lexicographically sortable** — Sorting IDs alphabetically reconstructs execution order: `corr_a1b2c3.1 → corr_a1b2c3.1.ado-001 → corr_a1b2c3.1.sn-001 → corr_a1b2c3.2 → ...`
- **Queryable with prefix** — `startswith(corr_a1b2c3)` returns everything for a session. `startswith(corr_a1b2c3.2)` returns only Minion 2's calls. Works in Table Storage partition queries and KQL.
- **No external dependency** — No distributed tracing service required. Log Analytics can consume these as structured properties.
- **Human-readable** — Operators can identify the session UUID, minion index, and tool server from the ID without decoding.
- **Compact** — Approximately 40–70 characters. Well within message size limits.

### Why not the alternatives?

| Option | Rejected Because |
|---|---|
| **W3C Trace Context** | Designed for HTTP microservices, not agent tool calls. Requires OpenTelemetry SDK integration across all layers. Adds complexity with no clear benefit for our use case. |
| **Flat UUIDs + mapping table** | Requires a separate relation table. Adding new entities requires a synchronous write to the mapping table, creating a bottleneck. |
| **No correlation** | Unacceptable for auditing, debugging, and compliance. "Post-hoc" correlation is unreliable. |

## Consequences

### Positive
- Full trace reconstruction with prefix queries
- No mapping table — IDs are self-describing
- Works with existing infrastructure (Table Storage, Log Analytics)

### Negative / Mitigations
- **The orchestrator must generate and propagate the root ID** — Mitigation: The orchestrator generates a UUID at session start. Every minion instruction includes `correlation_id: corr_xxx.N`. The MCP toolshed appends the tool-call suffix.
- **Minions must include their sub-ID in tool calls** — Mitigation: The toolshed injects the correlation ID context. Minions don't need to manage it explicitly.
- **Long pipelines produce longer IDs** — Mitigation: A 10-minion pipeline produces IDs ~50 characters long, well within the 1KB limit for correlation fields.
- **Replay/retry must be handled** — If a minion is retried, it reuses the same sub-ID but gets a new attempt marker in the log (`attempt: 2`). The tool call log records both attempts under the same correlation prefix.
