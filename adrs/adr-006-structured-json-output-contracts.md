# ADR-006: Structured JSON output contracts for minions

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

Minions produce outputs that the orchestrator must merge, validate, synthesize, and pass to downstream minions in a pipeline. Free-text outputs are hard to parse reliably and prone to format drift.

Options:

1. **Structured JSON contracts** — every minion returns typed JSON conforming to a defined schema.
2. **Free-text with post-hoc parsing** — minions return natural language; the orchestrator uses another LLM call to extract structured data.
3. **Semi-structured (Markdown with conventions)** — minions follow a Markdown template; the orchestrator parses headings and code blocks.

## Decision

**Every minion returns typed, structured JSON following a defined schema.**

The output format is specified in the minion's system prompt. The orchestrator validates the output against the expected schema and merges multiple minion outputs into a unified context object for downstream consumption.

Example schemas:

```json
// Code Explorer output
{
  "files": [{ "path": "...", "lines": 142, "functions": ["..."] }],
  "symbols": [{ "name": "...", "file": "...", "line": 42, "kind": "function" }],
  "call_graph": { "incoming": [...], "outgoing": [...] },
  "summary": "Auth logic lives in src/auth/login.ts, lines 142-167."
}

// Code Reviewer output
{
  "findings": [
    { "file": "...", "line": 150, "severity": "major", "category": "security", "message": "...", "suggestion": "..." }
  ],
  "summary": "Found 2 major issues, 5 minor, 3 nits. Not approved.",
  "approved": false
}
```

## Rationale

- **Machine-parseable** — The orchestrator can merge outputs without an additional LLM call, saving tokens and latency.
- **Type safety** — Schemas are validated at the orchestrator boundary. Malformed output triggers a retry, not a downstream error.
- **Downstream consumption** — The PR Crafter receives a clean, structured context object, not raw text it must re-interpret.
- **Versioning** — Schemas are versioned. Breaking changes are explicit and tracked.
- **Testing** — Minion outputs can be validated against their schema in integration tests.

## Consequences

### Positive
- No ambiguity in cross-minion communication
- Token savings (no re-parsing LLM calls)
- Testable, versioned contracts

### Negative / Mitigations
- **Minion prompts must include explicit format instructions** — Mitigation: The format section of each prompt is templated and shared across minions.
- **Schema evolution requires coordination** — Mitigation: Backward-compatible changes (adding optional fields) are preferred. Breaking changes trigger a major version bump of the minion.
- **Some outputs are naturally semi-structured** — Code review comments include free-text suggestions. Mitigation: The `message` and `suggestion` fields within structured findings can contain Markdown.
