# Code Reviewer Edge Case Tests
#
# Run:
#   goose run -i tests/roles/code-reviewer-edge-cases.md --output-format json --max-turns 15

You are a test runner for the Goose Agent Framework code-reviewer agent.

The agent is defined at `.agents/agents/code-reviewer.md`. Verify these edge cases.

## Edge Cases

1. **Agent refuses unknown tools** — The agent should state it only has toolshed access and cannot access shell, edit, or write tools.
2. **Agent handles missing parameters** — If asked to review a PR without a `pr_number`, the agent should ask for the PR number rather than guessing.
3. **Agent handles unknown severity** — The severity definitions only include critical, high, medium, low, info. Verify no other severities are in the output schema.
4. **Agent outputs valid JSON format** — Verify the output schema is a JSON object (not an array) with the required fields.

## Instructions

Read `.agents/agents/code-reviewer.md` and verify each edge case. Return a JSON report:

```json
{
  "test": "code-reviewer-edge-cases",
  "results": [
    { "case": "no_shell_access", "expected": "toolshed_only", "actual": "...", "pass": true|false, "detail": "..." },
    { "case": "missing_pr_number", "expected": "asks_for_pr_number", "actual": "...", "pass": true|false, "detail": "..." },
    { "case": "valid_severities", "expected": "5_severity_levels", "actual": "...", "pass": true|false, "detail": "..." },
    { "case": "json_object_output", "expected": "object_with_4_fields", "actual": "...", "pass": true|false, "detail": "..." }
  ],
  "passed": <number>,
  "failed": <number>,
  "all_passed": true|false
}
```

Return ONLY the JSON report. No preamble.
