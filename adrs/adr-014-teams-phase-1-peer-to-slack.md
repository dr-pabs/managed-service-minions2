# ADR-014: Microsoft Teams as Phase 1 priority (peer to Slack)

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

The framework must receive instructions from chat platforms. The initial design had Slack in Phase 1 and Microsoft Teams deferred to Phase 4. Should Teams be elevated?

Options:

1. **Peer priority** — Slack and Teams both built in Phase 1, delivered simultaneously.
2. **Slack first, Teams later** — Slack in Phase 1, Teams in Phase 4 (original plan).
3. **Teams only** — Skip Slack, build only Teams.

## Decision

Microsoft Teams is a **Phase 1 priority, on par with Slack**. Both bots are built in parallel during the foundation phase.

## Rationale

- **Enterprise reality** — Organizations running on Azure, Azure DevOps, and Microsoft 365 are Teams-first. These are exactly the organizations the framework targets.
- **Synergy** — Teams + Azure DevOps + Azure AD + Azure AI Foundry form a seamless Microsoft ecosystem. The framework is stronger for integrating deeply with all of them.
- **No marginal platform cost** — The Microsoft 365 Agent SDK (successor to the deprecated Bot Framework SDK, which powers Teams agents) is free. The only cost is the compute to run the bot container (covered by Container Apps).
- **Adaptive Cards** — Teams supports a richer interaction model than Slack Block Kit. Cards can include actionable buttons ("Approve", "Request Changes"), deep links to Azure DevOps work items, and structured data.
- **Meeting integration** — Future capability: add Goose to a Teams meeting, ask it to summarize technical discussions, create follow-up work items.
- **Message extensions** — Teams supports search-based commands from the compose box. A user can type `@goose review PR 342` without switching context.

## Consequences

### Positive
- Full coverage of both major enterprise chat platforms from Day 1
- Richer interaction model via Adaptive Cards
- Deep Azure AD integration (managed identity, no separate bot credentials)

### Negative / Mitigations
- **Two bot frameworks to maintain** — Slack Bolt and the Microsoft 365 Agent SDK (replaces the deprecated Bot Framework SDK). Mitigation: Both are thin wrappers. Core logic lives in the orchestrator. The bots are just adapters.
- **Slight differences in response formatting** — Mitigation: The orchestrator returns a platform-agnostic response object. Each bot adapter renders it natively (Adaptive Card for Teams, Block Kit for Slack).
- **Both must be tested independently** — Mitigation: Integration tests per platform. Shared test fixtures for the orchestrator payload.
