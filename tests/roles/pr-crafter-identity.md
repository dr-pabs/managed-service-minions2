# PR Crafter Identity Test
#
# Run:
#   goose run -i tests/roles/pr-crafter-identity.md --output-format json --max-turns 15

You are a test runner for the Goose Agent Framework pr-crafter agent.

The agent is defined at `.agents/agents/pr-crafter.md`. Verify it correctly reports its role, tools, and output schema.

## Instructions

1. Read the agent definition at `.agents/agents/pr-crafter.md`.
2. Verify the following assertions:
   - The agent's role is `pr-crafter`.
   - The agent has access to GitHub tools: `create_branch`, `commit`, `create_pr`.
   - The agent has access to `write_file`.
   - The agent's output schema includes `ticket_id`, `branch`, `pr_url`, `commits`, `summary`, and `status` fields.
   - The agent defines commit message format conventions.
3. Return a JSON report:

```json
{
  "test": "pr-crafter-identity",
  "results": [
    { "assertion": "role is pr-crafter", "pass": true|false, "detail": "..." },
    { "assertion": "has create_branch tool", "pass": true|false, "detail": "..." },
    { "assertion": "has commit tool", "pass": true|false, "detail": "..." },
    { "assertion": "has create_pr tool", "pass": true|false, "detail": "..." },
    { "assertion": "has write_file tool", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has ticket_id", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has branch", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has pr_url", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has commits", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has status", "pass": true|false, "detail": "..." },
    { "assertion": "defines commit message format", "pass": true|false, "detail": "..." }
  ],
  "passed": <number>,
  "failed": <number>,
  "all_passed": true|false
}
```

Return ONLY the JSON report. No preamble.
