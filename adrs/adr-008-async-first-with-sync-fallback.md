# ADR-008: Async-first task execution with sync fallback

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

Tasks vary dramatically in duration:
- "What's the status of ticket X?" — a single minion, 3–5 seconds
- "Fix this bug and create a PR" — multiple minions, 5–15 minutes
- "Review all 12 open PRs" — parallel minions, 2–8 minutes

Chat platforms impose response timeouts (Slack: 3 seconds, Teams: 15 seconds). The orchestrator must handle both fast and slow tasks gracefully.

Options:

1. **Async-first** — all tasks are async. The orchestrator returns a "working" acknowledgment immediately, posts results when done.
2. **Sync-first** — simple tasks complete inline. Only complex tasks are async.
3. **Always async** — even simple queries are queued and processed asynchronously.

## Decision

**Simple queries run synchronously. Complex pipelines run asynchronously.**

The intent classifier determines complexity at dispatch time:
- **Sync** (single minion, expected < 10 seconds): The orchestrator waits for the result and returns it immediately to the chat channel. No intermediate "working" message.
- **Async** (multiple minions, expected > 10 seconds): The orchestrator spawns minions via Service Bus, returns a "Working on it…" acknowledgment, and posts progress updates and final results to the chat channel as they become available.

## Rationale

- **User experience** — Fast queries feel instantaneous. No unnecessary "working" messages for trivial lookups.
- **Platform constraints** — Slack and Teams both time out if no response is sent promptly. Async acknowledgment satisfies the platform contract.
- **Progress visibility** — Async tasks post intermediate updates ("Found the relevant code, analyzing now…") so the user isn't left wondering.
- **Resource efficiency** — Async tasks don't hold a chat connection or orchestrator thread open for minutes.

## Consequences

### Positive
- Good UX for both fast and slow tasks
- No platform timeout issues
- Users can ask additional things while a long task runs

### Negative / Mitigations
- **Orchestrator must manage async state** — Mitigation: SQLite (ADR-009) tracks all active sessions and their minion DAGs.
- **Async task failure must be communicated clearly** — Mitigation: Failed tasks post an error card with the correlation ID for debugging. Retry is offered where applicable.
- **Intent classifier must correctly predict task duration** — Mitigation: Default conservative (async) for anything ambiguous. Sync allowed only for known-fast intents (`ticket_lookup`, `code_explore`).
