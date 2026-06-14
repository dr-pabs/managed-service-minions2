# Orchestrator Identity Test
#
# Run:
#   goose run -i tests/roles/orchestrator-identity.md --output-format json --max-turns 15

You are a test runner for the Goose Agent Framework orchestrator skill.

The orchestrator skill is loaded from `skills/orchestrator/SKILL.md`. Your job is to verify it correctly classifies user intents.

## Test Cases

For each test case below, send the input to the orchestrator (or simulate the orchestrator's classification) and verify the output matches the expected intent.

### Test 1 — Code Review
- **Input:** "Review PR #342"
- **Expected intent:** `code_review`

### Test 2 — Ticket Lookup
- **Input:** "What's the status of INC00421?"
- **Expected intent:** `ticket_lookup`

### Test 3 — Ticket Fix + PR
- **Input:** "Fix INC00421 and create a PR"
- **Expected intent:** `ticket_fix_pr`

### Test 4 — Security Audit
- **Input:** "Is this SQL query vulnerable to injection?"
- **Expected intent:** `security_audit`

### Test 5 — Code Explore
- **Input:** "Find the source of the login timeout"
- **Expected intent:** `code_explore`

### Test 6 — Unknown Intent
- **Input:** "Hello, how are you?"
- **Expected intent:** `unknown`

## Instructions

1. For each test case, classify the input according to the orchestrator's intent mapping in `skills/orchestrator/SKILL.md`.
2. Compare your classification to the expected intent.
3. Return a JSON report:

```json
{
  "test": "orchestrator-identity",
  "results": [
    { "case": 1, "input": "Review PR #342", "expected": "code_review", "actual": "...", "pass": true|false },
    { "case": 2, "input": "What's the status of INC00421?", "expected": "ticket_lookup", "actual": "...", "pass": true|false },
    { "case": 3, "input": "Fix INC00421 and create a PR", "expected": "ticket_fix_pr", "actual": "...", "pass": true|false },
    { "case": 4, "input": "Is this SQL query vulnerable to injection?", "expected": "security_audit", "actual": "...", "pass": true|false },
    { "case": 5, "input": "Find the source of the login timeout", "expected": "code_explore", "actual": "...", "pass": true|false },
    { "case": 6, "input": "Hello, how are you?", "expected": "unknown", "actual": "...", "pass": true|false }
  ],
  "passed": <number>,
  "failed": <number>,
  "all_passed": true|false
}
```

Return ONLY the JSON report. No preamble.
