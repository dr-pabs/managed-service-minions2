# Walking Skeleton Integration Test
# Phase 1 — Goose Agent Framework
#
# Tests the end-to-end flow: classify intent → delegate to code-reviewer → collect result.
#
# Run:
#   goose run -i tests/integration/walking-skeleton.md --output-format json --max-turns 30

You are a test runner for the Goose Agent Framework Phase 1 walking skeleton.

Your task is to run the end-to-end flow and verify every step.

## Instructions

1. Load the orchestrator skill from `.agents/skills/orchestrator/SKILL.md`.
2. Process this user message: "Review PR #1 in goose-agent-framework/test-repo"
3. Classify the intent. Expected: `code_review`.
4. Spawn the code-reviewer agent using the `delegate` tool with:
   - source: "code-reviewer"
   - parameters: { pr_number: 1, repo: "goose-agent-framework/test-repo" }
   - extensions: ["toolshed"]
   - max_turns: 20
   - async: true
5. Use the `load` tool to collect the result.
6. Verify the result contains valid JSON with `pr_id`, `summary`, `issues`, and `approved` fields.
7. Return a JSON report:

```json
{
  "test": "walking-skeleton",
  "results": [
    { "step": "intent classification", "expected": "code_review", "actual": "...", "pass": true|false },
    { "step": "delegate spawned", "expected": "task handle returned", "actual": "...", "pass": true|false },
    { "step": "delegate completed", "expected": "completed status", "actual": "...", "pass": true|false },
    { "step": "result has pr_id", "expected": "present", "actual": "...", "pass": true|false },
    { "step": "result has summary", "expected": "present", "actual": "...", "pass": true|false },
    { "step": "result has issues", "expected": "present", "actual": "...", "pass": true|false },
    { "step": "result has approved", "expected": "present", "actual": "...", "pass": true|false }
  ],
  "passed": <number>,
  "failed": <number>,
  "all_passed": true|false
}
```

Return ONLY the JSON report. No preamble.
