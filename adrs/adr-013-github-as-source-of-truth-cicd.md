# ADR-013: GitHub as framework source of truth + CI/CD

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

Where should the framework's own artifacts — extension code, minion prompts, governance configuration, recipes, and deployment pipelines — live and how should they be deployed?

Options:

1. **GitHub** — source of truth for all framework artifacts. GitHub Actions for CI/CD.
2. **Azure DevOps** — source of truth and Azure Pipelines for CI/CD.
3. **Hybrid** — code in GitHub, pipelines in Azure DevOps.
4. **Self-hosted** — own Git server and CI runner.

## Decision

GitHub serves as the single source of truth for all framework artifacts. GitHub Actions provides CI/CD to Azure Container Apps.

## Rationale

- **Version control** — Prompts and governance rules are code. They change via pull request with human review. Every change is auditable, commentable, and revertible.
- **CI/CD** — GitHub Actions triggers container builds (`az acr build`) and deployments (`az containerapp update`) on merge to `main`. Each extension has its own workflow, triggered only when its files change.
- **Self-improvement loop** — A minion can propose a prompt improvement by opening a PR against the framework repo. A human reviews and merges. The framework gets better the more it's used.
- **OIDC to Azure** — GitHub Actions authenticates to Azure via OpenID Connect (workload identity federation), not static secrets. No long-lived credentials stored in GitHub.
- **Transparency** — All changes are visible. The `docs/` directory (design docs, ADRs) lives alongside the code.
- **Ecosystem** — GitHub MCP is one of our primary integrations. The framework and its tools share the same platform.

### Why not alternatives?

| Option | Rejected Because |
|---|---|
| **Azure DevOps** | Lacks OIDC federation to Azure (as of 2026, relies on service connections with secrets). The framework integrates with ADO as a *tool*, but its own source should minimize secret management friction. |
| **Hybrid** | Unnecessary complexity. Two CI systems to maintain for one framework. |
| **Self-hosted** | Operational burden for no benefit. |

## Consequences

### Positive
- Prompts and governance are PR-reviewed before deployment
- Self-improvement loop (minions propose their own prompt fixes)
- OIDC — no static secrets
- Single platform for code, CI/CD, and integration

### Negative / Mitigations
- **Deployment secrets must still be managed** — Mitigation: OIDC eliminates all static secrets for Azure. GitHub PAT for repo access is auto-provisioned by the GitHub App.
- **Prompt changes require a deployment cycle** — Not real-time. Mitigation: This is intentional. Prompt changes are governed changes, not runtime tweaks. Emergency hotfixes can bypass the full pipeline.
- **GitHub outage = cannot deploy** — Mitigation: Acceptably rare. Containers continue running during an outage; only deployments are paused.
