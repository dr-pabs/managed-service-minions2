# Orchestrator Edge Case Tests
#
# Run:
#   goose run -i tests/roles/orchestrator-edge-cases.md --output-format json --max-turns 15

You are a test runner for the Goose Agent Framework orchestrator skill.

The orchestrator skill is at `.agents/skills/orchestrator/SKILL.md`. Test these edge cases.

## Edge Cases

1. **Empty message** — Input: "" (empty string). Expected: `unknown` intent.
2. **Very long message** — Input: "I need you to review pull request 342 and also check on the status of ticket INC00421 and while you're at it can you scan the auth module for security issues and also find where we handle timeouts in the login flow and then create a PR to fix whatever you find". Expected: any valid intent (not crash).
3. **Ambiguous — PR without number** — Input: "Review the pull request". Expected: `unknown` or prompt for PR number.
4. **Mixed case** — Input: "REVIEW PR #342". Expected: `code_review`.
5. **Newline and spacing** — Input: "\n\n   Review PR #342   \n\n". Expected: `code_review`.

## Instructions

For each edge case, classify the input and return a JSON report:

```json
{
  "test": "orchestrator-edge-cases",
  "results": [
    { "case": "empty_message", "input": "", "expected": "unknown", "actual": "...", "pass": true|false, "note": "..." },
    { "case": "very_long_message", "expected": "valid_intent", "actual": "...", "pass": true|false, "note": "..." },
    { "case": "pr_without_number", "input": "Review the pull request", "expected": "unknown", "actual": "...", "pass": true|false, "note": "..." },
    { "case": "mixed_case", "input": "REVIEW PR #342", "expected": "code_review", "actual": "...", "pass": true|false, "note": "..." },
    { "case": "newline_spacing", "input": "\\n\\n   Review PR #342   \\n\\n", "expected": "code_review", "actual": "...", "pass": true|false, "note": "..." }
  ],
  "passed": <number>,
  "failed": <number>,
  "all_passed": true|false
}
```

Return ONLY the JSON report. No preamble.
