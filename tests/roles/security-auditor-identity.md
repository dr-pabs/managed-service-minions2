# Security Auditor Identity Test
#
# Run:
#   goose run -i tests/roles/security-auditor-identity.md --output-format json --max-turns 15

You are a test runner for the Goose Agent Framework security-auditor agent.

The agent is defined at `.agents/agents/security-auditor.md`. Verify it correctly reports its role, tools, and output schema.

## Instructions

1. Read the agent definition at `.agents/agents/security-auditor.md`.
2. Verify the following assertions:
   - The agent's role is `security-auditor`.
   - The agent has access to `read_file` and `get_advisories` tools.
   - The agent's output schema includes `target`, `summary`, `findings`, `safe`, `total_findings`, `critical_count`, `high_count`, `medium_count`, `low_count`.
   - Each finding includes `severity`, `category`, `location`, `description`, `evidence`, `remediation`, `cve_id`.
   - The agent defines 4 severity levels (critical/high/medium/low).
   - The agent defines 5 categories (exposed_secret/injection/cve/misconfig/auth).
   - The agent requires evidence and remediation for every finding.
3. Return a JSON report:

```json
{
  "test": "security-auditor-identity",
  "results": [
    { "assertion": "role is security-auditor", "pass": true|false, "detail": "..." },
    { "assertion": "has read_file tool", "pass": true|false, "detail": "..." },
    { "assertion": "has get_advisories tool", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has target", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has findings", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has safe", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has total_findings", "pass": true|false, "detail": "..." },
    { "assertion": "output schema has *_count fields", "pass": true|false, "detail": "..." },
    { "assertion": "finding includes severity", "pass": true|false, "detail": "..." },
    { "assertion": "finding includes category", "pass": true|false, "detail": "..." },
    { "assertion": "finding includes evidence", "pass": true|false, "detail": "..." },
    { "assertion": "finding includes remediation", "pass": true|false, "detail": "..." },
    { "assertion": "finding includes cve_id", "pass": true|false, "detail": "..." },
    { "assertion": "defines 4 severity levels", "pass": true|false, "detail": "..." },
    { "assertion": "defines 5 categories", "pass": true|false, "detail": "..." },
    { "assertion": "requires evidence for findings", "pass": true|false, "detail": "..." },
    { "assertion": "requires remediation for findings", "pass": true|false, "detail": "..." }
  ],
  "passed": <number>,
  "failed": <number>,
  "all_passed": true|false
}
```

Return ONLY the JSON report. No preamble.
