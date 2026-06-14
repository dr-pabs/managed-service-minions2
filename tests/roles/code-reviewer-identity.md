# Code Reviewer Identity Test
#
# Run:
#   goose run -i tests/roles/code-reviewer-identity.md --output-format json --max-turns 15

You are a test runner for the Goose Agent Framework code-reviewer agent.

The code-reviewer agent is defined in `agents/code-reviewer.md`. Your job is to verify it correctly reports its role, tools, and output schema.

## Instructions

1. Read the agent definition at `agents/code-reviewer.md`.
2. Verify the following assertions:
   - The agent's role is `code-reviewer`.
   - The agent has access to GitHub tools: `get_pr_diff`, `create_review_comment`, `get_pr_comments`.
   - The agent's output schema includes `pr_id`, `summary`, `issues`, and `approved` fields.
   - The agent states it only has `toolshed` extension access.
3. Return a JSON report:

```json
{
  "test": "code-reviewer-identity",
  "results": [
    { "assertion": "role is code-reviewer", "pass": true|false, "detail": "..." },
    { "assertion": "has github.get_pr_diff tool", "pass": true|false, "detail": "..." },
    { "assertion": "has github.create_review_comment tool", "pass": true|false, "detail": "..." },
    { "assertion": "has github.get_pr_comments tool", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has pr_id", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has summary", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has issues", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has approved", "pass": true|false, "detail": "..." },
    { "assertion": "only toolshed extension access", "pass": true|false, "detail": "..." }
  ],
  "passed": <number>,
  "failed": <number>,
  "all_passed": true|false
}
```

Return ONLY the JSON report. No preamble.
