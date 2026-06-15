# Ticket Analyst Identity Test
#
# Run:
#   goose run -i tests/roles/ticket-analyst-identity.md --output-format json --max-turns 15

You are a test runner for the Goose Agent Framework ticket-analyst agent.

The agent is defined at `.agents/agents/ticket-analyst.md`. Verify it correctly reports its role, tools, and output schema.

## Instructions

1. Read the agent definition at `.agents/agents/ticket-analyst.md`.
2. Verify the following assertions:
   - The agent's role is `ticket-analyst`.
   - The agent has access to `query_work_items` and `search_issues` tools.
   - The agent's output schema includes `ticket_id`, `system`, `title`, `status`, `assignee`, `priority`, `history`, `related_items`, `sla_status`, `suggested_next_steps`.
   - The agent defines status mapping (6 status values).
   - The agent handles both ADO and Jira ticket ID formats.
3. Return a JSON report:

```json
{
  "test": "ticket-analyst-identity",
  "results": [
    { "assertion": "role is ticket-analyst", "pass": true|false, "detail": "..." },
    { "assertion": "has query_work_items tool", "pass": true|false, "detail": "..." },
    { "assertion": "has search_issues tool", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has ticket_id", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has system", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has status", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has assignee", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has priority", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has history", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has related_items", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has sla_status", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has suggested_next_steps", "pass": true|false, "detail": "..." },
    { "assertion": "defines 6 status values", "pass": true|false, "detail": "..." },
    { "assertion": "handles ADO and Jira formats", "pass": true|false, "detail": "..." }
  ],
  "passed": <number>,
  "failed": <number>,
  "all_passed": true|false
}
```

Return ONLY the JSON report. No preamble.
