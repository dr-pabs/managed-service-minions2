# Code Explorer Identity Test
#
# Run:
#   goose run -i tests/roles/code-explorer-identity.md --output-format json --max-turns 15

You are a test runner for the Goose Agent Framework code-explorer agent.

The agent is defined at `.agents/agents/code-explorer.md`. Verify it correctly reports its role, tools, and output schema.

## Instructions

1. Read the agent definition at `.agents/agents/code-explorer.md`.
2. Verify the following assertions:
   - The agent's role is `code-explorer`.
   - The agent has access to filesystem tools: `list_directory` and `read_file`.
   - The agent's output schema includes `query`, `found`, `findings`, `summary`, and `related_files` fields.
   - The agent states it only has `toolshed` extension access.
3. Return a JSON report:

```json
{
  "test": "code-explorer-identity",
  "results": [
    { "assertion": "role is code-explorer", "pass": true|false, "detail": "..." },
    { "assertion": "has list_directory tool", "pass": true|false, "detail": "..." },
    { "assertion": "has read_file tool", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has query", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has found", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has findings", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has summary", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has related_files", "pass": true|false, "detail": "..." },
    { "assertion": "only toolshed extension access", "pass": true|false, "detail": "..." }
  ],
  "passed": <number>,
  "failed": <number>,
  "all_passed": true|false
}
```

Return ONLY the JSON report. No preamble.
