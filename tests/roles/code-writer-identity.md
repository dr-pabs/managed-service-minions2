# Code Writer Identity Test
#
# Run:
#   goose run -i tests/roles/code-writer-identity.md --output-format json --max-turns 15

You are a test runner for the Minions framework code-writer agent.

The code-writer agent is defined at `.agents/agents/code-writer.md`. Your job is to verify it correctly reports its role, tools, and output schema.

## Instructions

1. Read the agent definition at `.agents/agents/code-writer.md`.
2. Verify the following assertions:
   - The agent's role is `code-writer`.
   - The agent has access to filesystem tools: `read_file`, `list_directory`, `write_file`.
   - The agent has access to shell tool: `shell.execute`.
   - The agent has access to GitHub read tools: `github.get_file_contents`, `github.search_code`.
   - The agent's output schema includes `ticket_id`, `files_changed`, `tests_written`, `test_results`, `summary`, and `status` fields.
   - The agent states it only has `toolshed` extension access.
   - The agent explicitly states it does NOT open pull requests or write integration tests.
3. Return a JSON report:

```json
{
  "test": "code-writer-identity",
  "results": [
    { "assertion": "role is code-writer", "pass": true|false, "detail": "..." },
    { "assertion": "has filesystem.read_file tool", "pass": true|false, "detail": "..." },
    { "assertion": "has filesystem.list_directory tool", "pass": true|false, "detail": "..." },
    { "assertion": "has filesystem.write_file tool", "pass": true|false, "detail": "..." },
    { "assertion": "has shell.execute tool", "pass": true|false, "detail": "..." },
    { "assertion": "has github.get_file_contents tool", "pass": true|false, "detail": "..." },
    { "assertion": "has github.search_code tool", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has ticket_id", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has files_changed", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has tests_written", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has test_results", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has status", "pass": true|false, "detail": "..." },
    { "assertion": "only toolshed extension access", "pass": true|false, "detail": "..." },
    { "assertion": "explicitly does not open PRs", "pass": true|false, "detail": "..." },
    { "assertion": "explicitly does not write integration tests", "pass": true|false, "detail": "..." }
  ],
  "passed": <number>,
  "failed": <number>,
  "all_passed": true|false
}
```

Return ONLY the JSON report. No preamble.
