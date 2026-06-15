# Scheduled Triggers Design

> **Status:** Phase 4 — Design Complete, Awaiting Implementation\
> **Date:** 2026-06-15\
> **Target:** Goose 1.37.0+ `goose schedule` CLI\
> **Complements:** `docs/high-level-design.md` §Layer 1, `docs/gap-analysis.md` §Scale Limits

## 1. Overview

The framework supports cron-based scheduled triggers for recurring work: daily PR reviews, weekly security scans, ticket queue polling, and maintenance sweeps. Scheduling uses the `goose schedule` CLI command — `platform__manage_schedule` does not exist as a goose tool.

## 2. Schedule Registry

| Job | Intent | Recipe/Agent | Cadence | Parameters |
|---|---|---|---|---|
| `daily-pr-review` | `daily_review` | `code-reviewer` (parallel fan-out) | `0 8 * * 1-5` | `repo: org/repo` |
| `weekly-security-sweep` | `security_audit` | `security-auditor` | `0 9 * * 1` | `target: src/` |
| `ticket-queue-poll` | `ticket_lookup` | `ticket-analyst` | `*/15 * * * *` | (none — scans all open) |
| `knowledge-graduation` | `daily_review` | office-town librarian-style | `0 18 * * *` | (Phase 4) |
| `cost-report` | (dashboard query) | Dashboard → Log Analytics | `0 7 * * 1` | (Phase 4) |

## 3. CLI Invocation

```bash
# Register a daily PR review schedule
goose schedule create daily-pr-review \
  --cron "0 8 * * 1-5" \
  --recipe orchestrator \
  --params "intent=daily_review" \
  --params "repo=org/repo"

# List schedules
goose schedule list

# Remove a schedule
goose schedule delete daily-pr-review
```

## 4. Orchestrator Flow

When a scheduled trigger fires, the goose runtime starts a new session with the orchestrator recipe. The orchestrator:

1. Receives the `intent` parameter (e.g., `daily_review`).
1. Fetches the list of open PRs via GitHub MCP (through toolshed).
1. Deploys parallel `delegate` calls — one per PR.
1. Collects results via `load`.
1. Posts a summary to the configured channel (Slack/Teams) or writes to the session journal.

```
cron fires "0 8 * * 1-5"
  │
  ▼
goose schedule triggers
  │
  ▼
goose session starts
  │
  ├── orchestrator recipe loaded
  ├── intent: daily_review
  ├── GitHub MCP: list open PRs → [341, 342, 343, 344, 345]
  │
  ├── Parallel delegate spawn:
  │     delegate(source: "code-reviewer", pr_number: 341, async: true)
  │     delegate(source: "code-reviewer", pr_number: 342, async: true)
  │     delegate(source: "code-reviewer", pr_number: 343, async: true)
  │     delegate(source: "code-reviewer", pr_number: 344, async: true)
  │     delegate(source: "code-reviewer", pr_number: 345, async: true)
  │
  ├── Collect results via load(taskId) for each
  ├── Synthesize summary
  │
  └── Post to Slack/Teams or write to journal
```

## 5. Failure Handling

| Failure | Behavior |
|---|---|
| Single PR review fails | Continue with remaining PRs. Include failure in summary. |
| All PR reviews fail | Dead-letter the session. Alert P2. |
| `goose schedule` daemon down | No triggers fire. Alert on missed schedule (P2). |
| GitHub MCP unavailable | Abort schedule run. Alert P2. Retry next cycle. |

## 6. Environment Schedule Configuration

```bash
# Dev: no schedules (manual testing only)
# Staging: daily PR review at 10:00, no ticket polling
goose schedule create daily-pr-review --cron "0 10 * * 1-5" --recipe orchestrator --params "intent=daily_review"

# Production: full schedule suite
goose schedule create daily-pr-review --cron "0 8 * * 1-5" --recipe orchestrator --params "intent=daily_review" --params "repo=org/repo"
goose schedule create weekly-security --cron "0 9 * * 1" --recipe orchestrator --params "intent=security_audit" --params "target=src/"
goose schedule create ticket-poll --cron "*/15 * * * *" --recipe orchestrator --params "intent=ticket_queue_poll"
```

## 7. Monitoring

| Metric | Alert |
|---|---|
| Schedule missed (no trigger within 2x interval) | P2 |
| Schedule run failure rate > 10% | P2 |
| Schedule run duration > 90% of interval | P3 (risk of overlap) |
