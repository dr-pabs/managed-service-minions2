# AGENTS.md

## Project overview

This folder contains the design, delivery, and governance artifacts for the Goose Agent Framework. Most of the work here is specification- and architecture-oriented rather than compiled application code.

Primary source documents include:
- `docs/high-level-design.md` — system architecture and core capabilities
- `docs/delivery-specification.md` — scope, workstreams, phases, and acceptance criteria
- `docs/testing-strategy.md` — test pyramid, integration plans, and quality controls
- `docs/agent-led-development.md` — agent/role mapping and operating model
- `adrs/` — architecture decisions and governance rationale

When making changes, prefer to keep these artifacts aligned with one another and with the ADRs.

## What matters most here

1. Preserve the existing architecture narrative.
   - Keep the design docs consistent with the current delivery scope.
   - If a change affects runtime behavior, security, observability, or deployment assumptions, update the related design/spec documents too.

2. Respect the governance model.
   - This project explicitly uses human approval for destructive or high-risk actions.
   - Do not propose production changes, secret handling, or deployment actions without that guardrail.

3. Keep documentation grounded in evidence.
   - Prefer citing existing docs, ADRs, and current design decisions over inventing new assumptions.
   - When you add new guidance, make it specific to this repository’s architecture and delivery goals.

## Build, test, and validation guidance

**⚠️ 100% test coverage is mandatory.** The Ralph Wiggum loop is enforced: if a test fails, the code goes back to the developer, gets fixed, tested again, and this repeats until ALL tests pass. There is no skip button, no override, no "merge anyway."

CI enforcement:
- **No merge on red.** Merge button disabled if any test fails.
- **Fix the root cause.** No disabling tests or lowering thresholds without a written exemption.
- **Full pipeline re-run required after every fix.**
- **Maintainer/QA approval required before merge.**

### Rust (toolshed MCP server)

```bash
# Lint
cargo clippy --manifest-path mcp-servers/toolshed/Cargo.toml -- -D warnings

# Test
cargo test --manifest-path mcp-servers/toolshed/Cargo.toml
# ALL tests must pass. Zero failures tolerated. Zero clippy warnings tolerated.
```

### Markdown, YAML, and Shell

```bash
# Lint all markdown
markdownlint '**/*.md' --ignore node_modules

# Lint all YAML
yamllint .

# Lint all shell scripts
shellcheck hooks/*.sh
# All lint checks must pass. Zero warnings tolerated.
```

### Integration tests (goose run)

```bash
goose run -i tests/integration/walking-skeleton.yaml --output-format json
# Must exit 0 with completed minion result.
```

### Identity tests (agents)

```bash
goose run -i tests/roles/code-reviewer-identity.yaml --output-format json
goose run -i tests/roles/orchestrator-identity.yaml --output-format json
# Every agent must pass its identity test.
```

### Documentation validation

When validating a change, verify the relevant Markdown or spec references and keep the surrounding docs consistent. If a change affects runtime behavior, security, observability, or deployment assumptions, update the related design/spec documents too.

## Writing and style guidelines

- Use clear Markdown structure with concise headings and bullet points.
- Keep technical terminology consistent with the existing design language in the repo.
- Preserve links to related docs and ADRs when referencing decisions or dependencies.
- Prefer incremental updates over broad rewrites unless the task explicitly asks for a major redesign.
- When updating architecture or delivery notes, keep the status/date fields accurate if they already exist in the file.

## Security and operational considerations

- Never add secrets, tokens, credentials, or private endpoints to documentation.
- Keep security and governance language aligned with the ADRs, especially around least privilege, allowlisting, and human oversight.
- Avoid suggesting unsafe automation or destructive actions without explicit approval paths.

## ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in .agent/PLANS.md) from design to implementation.

## Extra instructions

- If this folder later grows into multiple runnable packages or services, place another AGENTS.md in each subproject so the nearest file takes precedence.
- If you introduce new implementation work, document the architectural impact in the relevant design/spec file before or alongside the code change.
- Prefer traceability: changes should be explainable through the existing design docs, ADRs, and delivery goals.
