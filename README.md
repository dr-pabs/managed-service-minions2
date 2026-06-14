# Goose Agent Framework

Multi-agent orchestration system for the [Goose](https://github.com/aaif-goose/goose) platform.

## Install

```bash
goose plugin install https://github.com/org/goose-agent-framework
```

## What it provides

- **Orchestrator skill** — Classifies user intents and delegates to specialist agents
- **5 specialist agents** — Code Reviewer, Code Explorer, PR Crafter, Ticket Analyst, Security Auditor
- **Slash commands** — `/review-pr`, `/triage-ticket`, `/security-scan`
- **Toolshed** — Governed tool access with allowlists, rate limiting, and audit logging
- **Session hooks** — Correlation IDs and audit journals

## Quality

**100% test coverage required.** No code without tests. No merge without passing tests. No deployment without coverage gates. See [testing-strategy.md](testing-strategy.md).

## Quick start

```bash
# In a goose session
> /review-pr 342
```

## Architecture

See [docs/low-level-design.md](docs/low-level-design.md) in the framework repository.
