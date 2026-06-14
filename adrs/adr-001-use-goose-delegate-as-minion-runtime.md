# ADR-001: Use Goose `delegate` as the minion runtime

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

We need a way to spawn specialized sub-agents ("minions") that operate independently with their own context windows, tool access, and lifecycle. The minions must be able to run in parallel for independent sub-tasks and sequentially for dependent ones.

Options considered:

1. **Goose `delegate`** — built-in sub-agent mechanism with async support (`async: true`), context isolation, and tool allowlisting.
2. **Custom agent runtime** — build our own process/thread pool with custom context management, state machines, and retry logic.
3. **External orchestrator** — Dapr Workflow, Temporal, or Azure Durable Functions to manage agent lifecycle.

## Decision

**Use Goose's `delegate` mechanism as the minion runtime.**

Minions are spawned via `delegate(instructions, extensions, max_turns, async: true)`. The orchestrator manages lifecycle — spawn, monitor via `load(taskId)`, collect results, retry, and terminate.

## Rationale

- **Already exists** — Goose `delegate` is production-tested and supports async parallelism natively. No new runtime to build, debug, or maintain.
- **Context isolation** — Each delegate has an independent context window, preventing prompt pollution and cross-minion interference.
- **Tool allowlisting** — Delegates receive a curated set of extensions/tools. This maps directly to our per-minion allowlist model (ADR-005).
- **Result collection** — `load(taskId)` provides structured access to delegate output, which we constrain to JSON (ADR-006).
- **No new infrastructure** — No external workflow engine, no custom process pool, no additional Azure resources.

## Consequences

### Positive
- Zero-cost adoption — Goose already provides the mechanism
- Natural fit with Goose's session and extension model
- Async parallelism is a first-class feature
- No lock-in to an external workflow system

### Negative / Mitigations
- **Concurrency bounded by Goose's delegate implementation** — Mitigation: The orchestrator manages a pool and queues excess tasks via Service Bus (ADR-012).
- **Minions cannot share in-memory state** — Intentional. Minions are stateless by design (ADR-004). Communication flows through the orchestrator.
- **Timeout and retry logic must be built in the orchestrator** — Mitigation: The orchestrator extension handles this explicitly, with configurable timeouts per minion type.
