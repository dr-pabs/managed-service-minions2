# Framework Rules

Standing orders enforced across all sessions and minions.

## Testing

**100% test coverage is mandatory.** No code may be merged or deployed without passing tests.

1. **Every component must have tests.** Agent definitions, skills, commands, hooks, and MCP server code.
2. **Tests must pass before merge.** CI blocks any PR with failing tests.
3. **Coverage gates block deployment.** If any layer has failing tests, deployment is blocked.
4. **Fix broken tests before adding new code.** A failing test is a broken build — fix it first.
5. **The Ralph Wiggum loop is enforced.** If a test fails, the code goes back to the developer, gets fixed, gets tested again, and this repeats until ALL tests pass. There is no skip button, no override, no "merge anyway."

## CI Enforcement

6. **No merge on red.** CI blocks merge if any test fails. The merge button is disabled. No exceptions without a written exemption approved by a maintainer.
7. **Fix the root cause.** No disabling tests. No lowering thresholds. No `#[ignore]` without a written exemption. Tests can only be modified to fix broken tests, not to make failures disappear.
8. **Re-run the full pipeline.** A fix must trigger a full pipeline re-run. Partial re-runs are not acceptable. The full suite must pass against the exact commit being merged.
9. **Maintainer/QA approval required before merge.** Even with a green pipeline, a human must approve the PR — confirming the right tests passed, no tests were improperly modified, and coverage thresholds are met.
10. **All code must pass linting.** `cargo clippy` (Rust, zero warnings), `markdownlint` (Markdown), `yamllint` (YAML), `shellcheck` (bash). Lint failures block merge. See `testing-strategy.md` for full lint gates.

See `testing-strategy.md` for full coverage thresholds per layer and the CI enforcement table.

## Tool Access

1. **Minions get ONLY the toolshed.** No shell, file write, file edit, or direct MCP access.
2. **The toolshed enforces per-agent allowlists.** Every tool call is checked against the agent's allowlist.
3. **Rate limits apply per agent type.** See `toolshed/src/allowlist.rs` for current limits.

## Delegation

4. **All minion spawning uses `delegate({ async: true })`.** Synchronous delegates block the orchestrator.
5. **Max turns per agent type are enforced.** See the orchestrator skill's `Intent → agent mapping` table.
6. **Failed delegates are retried once.** After two failures, the error is surfaced to the user.

## Correlation

7. **Every session gets a correlation ID** (`corr_<uuid>`) via the `SessionStart` hook.
8. **Every minion gets a child correlation ID** (`corr_<uuid>.N`).
9. **Correlation IDs are logged on every tool call** by the toolshed.

## Audit

10. **Every tool call is logged to stdout as JSON** with correlation ID, agent type, tool name, result, and duration.
11. **Allowlist denials are logged as security events** with the blocked tool name, agent type, and correlation ID.

## Error Handling

12. **Timeout errors trigger `interrupt_agent`** to cleanly cancel the runaway delegate.
13. **Unknown intents get a helpful clarification message** listing supported commands.
14. **Schema validation failures return the raw output + schema error** for debugging.

## Phase 1 Scope

- Only `code-reviewer` is fully implemented. Other agents are skeletons.
- Only GitHub MCP is connected. Other MCP servers are Phase 2-3.
- DAG decomposition and parallel delegate spawning is Phase 2.
- Human-in-the-loop approval gating is Phase 2 (see ADR-007).
