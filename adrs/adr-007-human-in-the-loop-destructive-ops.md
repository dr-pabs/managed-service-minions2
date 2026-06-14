# ADR-007: Human-in-the-loop for destructive operations

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

Minions can create PRs, update tickets and work items, trigger builds, and modify code. Should they be able to autonomously merge PRs, close incidents, transition work items to "Done", or trigger deployments without human oversight?

Options:

1. **Human-in-the-loop** — destructive actions require explicit human approval via Slack/Teams. Minions recommend; humans decide.
2. **Fully autonomous** — minions can perform any action within their tool allowlist, including destructive ones.
3. **Policy-based auto-approval** — some actions auto-approved based on rules (e.g., "auto-merge if tests pass and no review issues").

## Decision

**All destructive operations require explicit human confirmation via Slack/Teams.**

The following are classified as destructive by default:
- Merging PRs (GitHub or Azure DevOps)
- Closing/Resolving tickets, incidents, or work items
- Deleting branches
- Triggering deployments or releases
- Modifying production configuration

Minions may **recommend** these actions with rationale, but they do not execute them unilaterally.

The governance configuration (`governance.yaml`) defines which actions require approval and allows teams to tune per-action.

## Rationale

- **Safety** — No autonomous destructive actions in production systems. A hallucination or misunderstood intent cannot cause damage.
- **Compliance** — Change management processes in regulated environments require human approval.
- **Trust** — Users will not adopt a system that acts unilaterally on production infrastructure. The approval flow builds confidence.
- **Flexibility** — Per-action configuration lets teams start conservative and relax constraints as trust is earned. Some teams may choose to auto-approve low-risk merges.
- **Accountability** — The human approver is recorded in the audit trail alongside the minion's recommendation.

## Consequences

### Positive
- Zero risk of autonomous destructive actions
- Clear accountability boundary
- Configurable per-team, per-action

### Negative / Mitigations
- **Pipelines may feel slower** — Mitigation: Approval prompts are delivered immediately via Slack/Teams with actionable buttons ("Approve", "Deny"). For low-risk scenarios, teams can configure auto-approval rules.
- **Approval prompts must be clear** — Mitigation: Prompts include: what action is requested, why, a link to the PR/diff/ticket, and the impact.
- **Unanswered approvals** — Mitigation: Configurable timeout (default: 4 hours). Expired approvals are denied and escalated to the channel.
