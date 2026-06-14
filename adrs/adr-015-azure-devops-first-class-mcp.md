# ADR-015: Azure DevOps as first-class MCP integration

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

Many enterprises use Azure DevOps (ADO) rather than GitHub for source control, work tracking, and CI/CD. Should ADO be a first-class integration — on par with GitHub — or a secondary/catch-up integration?

Options:

1. **First-class (peer to GitHub)** — full ADO MCP server with work items, PRs, repos, builds, and WIQL support. All minions support both platforms.
2. **Secondary** — limited ADO support. Basic PR operations only. Work items are read-only.
3. **GitHub only** — ADO is not supported.

## Decision

Azure DevOps is a **first-class MCP integration, peer to GitHub**.

The ADO MCP server provides:

| Category | Tools |
|---|---|
| **Work items** | `search_work_items`, `get_work_item`, `create_work_item`, `update_work_item`, `run_query` (WIQL) |
| **Pull requests** | `get_pr`, `create_pr`, `get_pr_diff`, `create_pr_review` |
| **Repos** | `search_repos`, `get_file`, `create_branch`, `commit_changes` |
| **Builds & releases** | `get_build`, `queue_build`, `get_release` |
| **Other** | `search_wiki` |

All minions that operate on GitHub also operate on Azure DevOps:
- **Code Reviewer** — reviews ADO PRs
- **PR Crafter** — creates ADO PRs, links work items via `AB#1234` syntax
- **Ticket Analyst** — queries ADO work items, cross-references with ServiceNow/Jira
- **Security Auditor** — checks ADO Advanced Security alerts

## Rationale

- **Enterprise adoption** — Azure DevOps is the default for enterprises on the Microsoft stack. A GitHub-only framework misses this market entirely.
- **Work item linking** — ADO PRs natively link to work items. A PR description containing `AB#1234` automatically associates the PR with work item #1234. This creates a closed loop: ticket → fix → PR → ticket updated.
- **Unified pipeline experience** — "Fix work item #567" works the same regardless of whether the repo is in GitHub or Azure DevOps. The platform is an implementation detail.
- **WIQL** — Work Item Query Language enables complex cross-project queries ("all Sev-1 bugs assigned to my team, opened in the last 24 hours"). The Ticket Analyst minion can compose these dynamically.
- **No marginal architecture cost** — The MCP toolshed already supports multiple servers. Adding ADO is an MCP server development task, not an architecture change. Minion platform-awareness is a thin abstraction in the system prompt.

## Consequences

### Positive
- Full enterprise coverage (GitHub + ADO)
- Closed-loop ticket-to-PR workflows on ADO
- WIQL enables powerful work item queries

### Negative / Mitigations
- **PR Crafter and Code Reviewer must detect the target platform** — Mitigation: The orchestrator detects the platform from context (URL patterns, work item prefixes) and passes `platform: github | ado` to the minion.
- **ADO PATs must be provisioned** — Mitigation: PATs are stored in Azure Key Vault, accessed via managed identity. Scopes are minimal (Code: Read & Write, Work Items: Read & Write).
- **ADO API has different rate limits** — Mitigation: Rate limits are configured per-server in `governance.yaml`. The toolshed enforces them independently.
