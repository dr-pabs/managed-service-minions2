# ADR-020: Optional semantic code tagging

| Key | Value |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-06-06 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |
| **Related** | ADR-005 (Tool allowlisting), ADR-019 (Path scoping) |

---

## Context

Agents explore code by searching, reading, and tracing symbols. This works, but is brute-force. A minion looking for "the auth timeout bug" must grep for `timeout`, read every match, and reason about relevance — burning tokens on false positives.

Semantic tags (annotations in code) could shortcut this: *"This file handles login timeout. Owned by auth-team. SLA: 5 seconds."* Tags would let agents find relevant code faster and with higher precision.

Options:

1. **Mandatory tagging** — require all code in the repository to be tagged. Agents depend on tags.
2. **Optional tagging with fallback** — support tags as an accelerator. Agents use tags when present, fall back to search/analysis when absent.
3. **No tagging** — rely entirely on tree-sitter AST analysis, grep, and git blame.

## Decision

**Tags are optional accelerators, never a dependency.**

The framework supports tags in three formats. When tags exist, agents use them to shortcut discovery. When tags are absent, agents fall back to search-based code exploration — which already works.

### Supported Tag Formats

#### Format A: Inline annotation comments

```python
# @owner: auth-team
# @domain: authentication
# @sla: p1-5s
# @related: session, token, oauth
def login(request: LoginRequest) -> LoginResponse:
    """Authenticate user and return session token."""
    ...
```

```go
// @owner: payments-team
// @domain: billing
// @sla: p0-2s
// @related: gateway, invoice, refund
func ProcessPayment(payment PaymentRequest) (*PaymentResult, error) {
    ...
}
```

#### Format B: Per-directory metadata file

```
src/auth/.goose-tags.yaml
---
domain: authentication
owner: auth-team
sla: p1
files:
  login.ts:
    description: "Handles user login, session creation, timeout enforcement"
    related: [session, token, oauth, mfa]
  middleware.ts:
    description: "Auth middleware — JWT validation, role extraction"
    related: [jwt, roles, permissions]
```

#### Format C: Global tag registry

```
.goose-tags.yaml (repo root)
---
# Single-file shorthand: top-level keys are paths, values are tags
src/auth:
  domain: authentication
  owner: auth-team
  sla: p1

src/payments:
  domain: billing
  owner: payments-team
  sla: p0
  compliance: pci-dss

config/secrets:
  access: restricted       # Auto-denylisted by path scoping (ADR-019)
```

### How Agents Use Tags

Tags are consumed by the **Code Explorer minion** as navigation hints, not as authoritative labels:

```
User: "Fix the auth login timeout bug"

Without tags (baseline):
  1. grep "timeout" → 147 matches across entire codebase
  2. Read and classify each match → ~8,000 tokens, ~45 seconds
  3. Narrow to src/auth/login.ts, guess it's the right file

With tags:
  1. Read .goose-tags.yaml → find all entries with domain: authentication
  2. Filter for SLA tags mentioning "timeout" or "login"
  3. Land directly on src/auth/login.ts → ~500 tokens, ~5 seconds
```

The critical design rule: **if tags are wrong, the agent still works.** Tags guide; search verifies. A stale `@owner` tag doesn't cause a wrong fix — the minion still reads the file and reasons about it.

### What Tags Are NOT

- **NOT a replacement for git blame** — ownership tags go stale. Agents always cross-reference with `git log --follow` for recent committers.
- **NOT a security boundary** — path scoping (ADR-019) enforces access. Tags are advisory.
- **NOT enforced by CI** — no tag-linting in pre-commit hooks. Teams adopt tags at their own pace.
- **NOT ingested automatically** — the agent reads tags lazily, only when searching for relevant code. No pre-indexing step.

## Rationale

- **Adoption gradient** — Teams can start with zero tags. Add a root `.goose-tags.yaml` with directory-level domains. Add per-file annotations where precision matters. No cliff.
- **Degrades gracefully** — If tags are stale, wrong, or absent, the agent falls back to search-based exploration. There is no failure mode where missing tags break the agent.
- **Avoids the "tag tax"** — Mandatory tagging creates maintenance burden. Developers forget to update tags. CI must enforce them. This becomes a friction point that kills adoption.
- **Measurable ROI** — Tags reduce token consumption for code exploration tasks. A team that tags its auth module sees faster, cheaper incident investigations. The ROI is self-evident.
- **Same tools, same loop** — Tags are just files that the Code Explorer reads during its search phase. No new MCP servers, no new tool types.

## Consequences

### Positive
- Zero onboarding cost — framework works without any tags
- Linear adoption — add tags where they matter, skip where they don't
- Faster incident-to-code path for tagged modules
- Tag files are human-readable and PR-reviewable

### Negative / Mitigations
- **Stale tags** — `@owner` changes when teams reorganize. Mitigation: Agents cross-reference with git history. Stale tags are a hint, not a verdict.
- **Tag format proliferation** — Three formats could fragment. Mitigation: The three formats serve different granularities (file, directory, repo). The agent reads all three and merges. Format C is the recommended starting point.
- **No discoverability** — Developers may not know tags exist. Mitigation: The `agent-dashboard` (Phase 4) shows which directories are tagged and which aren't. A "tag coverage" view encourages organic adoption.
