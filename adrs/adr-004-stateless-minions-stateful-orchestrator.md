# ADR-004: Stateless minions, stateful orchestrator

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

Minions perform computational work: code exploration, review, PR creation, ticket analysis, security auditing. Should minions maintain state across invocations, or should state be externalized?

Options:

1. **Stateless minions** — each minion invocation is a pure function. The orchestrator holds all session state and passes relevant context to each minion.
2. **Stateful minions** — minions maintain conversation history across invocations within a session.
3. **Hybrid** — minions have short-term memory but state is checkpointed to a durable store.

## Decision

**Minions are stateless and disposable. The orchestrator is stateful.**

The orchestrator maintains:
- Conversation history with the user
- Session metadata (correlation ID, channel, user)
- Aggregated minion outputs from the current pipeline
- Pending human approvals

Minions receive only: a focused instruction, relevant context from the orchestrator, and their tool allowlist. They return structured JSON and terminate.

## Rationale

- **Disposability** — A failed minion can be retried from scratch with no corrupted state. No checkpoint/restore complexity.
- **Safe parallelism** — Stateless minions can run in parallel without locks or coordination. Two minions cannot interfere with each other's state.
- **Simplicity** — Minions are conceptually pure functions: `(instructions, tools) → structured_output`. Easy to reason about, test, and debug.
- **Auditability** — Every minion invocation is a clean, self-contained unit of work. The input (instructions + context) and output are fully captured.
- **Context control** — The orchestrator decides exactly what context each minion sees. No risk of a minion acting on stale or irrelevant information from a previous turn.

## Consequences

### Positive
- Clean retry semantics
- Safe parallelism
- Full audit trail per invocation
- Easier prompt engineering (no state management in prompts)

### Negative / Mitigations
- **Orchestrator is a single point of coordination** — Mitigation: Service Bus session affinity (ADR-012) ensures a session's messages go to the same orchestrator replica. For HA, the orchestrator can be replicated with session stickiness.
- **Minion outputs must be self-contained** — Mitigation: Structured JSON contracts (ADR-006) ensure outputs carry all necessary information.
- **Long-running pipelines need the orchestrator to persist intermediate state** — Mitigation: SQLite (ADR-009) stores session state with periodic backup to Blob.
