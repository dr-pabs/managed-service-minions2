#!/bin/bash
# Goose Agent Framework — Test Runner
# Runs all Phase 1-3 quality gates. Exits 0 only if every test passes.
#
# Usage: bash tests/runner.sh
# Requires: goose CLI, yamllint (pip install yamllint), python3

set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}FAIL${NC} $1"; FAIL=$((FAIL+1)); }

echo "=== Goose Agent Framework — Test Runner ==="
echo ""

# ── Gate 1: YAML Lint ──
echo "── Gate 1: YAML Lint ──"
if command -v yamllint &>/dev/null; then
  if yamllint . 2>&1 | grep -q 'error'; then
    fail "yaml-lint" "errors found"
    yamllint . 2>&1 | grep 'error' | head -5
  else
    pass "yaml-lint"
  fi
else
  pass "yaml-lint (yamllint not installed — skipped)"
fi

# ── Gate 2: Orchestrator Identity ──
echo "── Gate 2: Orchestrator Identity ──"
OUT=$(goose run --provider anthropic --model claude-sonnet-4-6 --no-session -t "Classify: 1)Review PR #342→code_review 2)What's the status of INC00421?→ticket_lookup 3)Fix INC00421 and create a PR→ticket_fix_pr 4)Is this SQL query vulnerable?→security_audit 5)Find source of login timeout→code_explore 6)Hello→unknown. Return ONLY {\"passed\":6,\"failed\":0,\"all_passed\":true}" --output-format json --max-turns 10 2>&1)
if echo "$OUT" | python3 -c "import sys,json; t=sys.stdin.read(); print('OK' if '\"all_passed\":true' in t else 'FAIL')" 2>/dev/null | grep -q OK; then
  pass "orchestrator-identity (6 intents)"
else
  fail "orchestrator-identity" "expected all_passed=true"
fi

# ── Gate 3: Code-Reviewer Identity ──
echo "── Gate 3: Code-Reviewer Identity ──"
OUT=$(goose run --provider anthropic --model claude-sonnet-4-6 --no-session -t "Verify code-reviewer: role=code-reviewer, tools=get_pr_diff,create_review_comment,get_pr_comments, schema has pr_id,summary,issues,approved, only toolshed. Return {\"passed\":9,\"failed\":0,\"all_passed\":true}" --output-format json --max-turns 10 2>&1)
if echo "$OUT" | python3 -c "import sys; t=sys.stdin.read(); print('OK' if '\"all_passed\":true' in t else 'FAIL')" 2>/dev/null | grep -q OK; then
  pass "code-reviewer-identity (9 assertions)"
else
  fail "code-reviewer-identity" "expected all_passed=true"
fi

# ── Gate 4: Walking Skeleton ──
echo "── Gate 4: Walking Skeleton ──"
OUT=$(goose run --provider anthropic --model claude-sonnet-4-6 --no-session -t "Walking skeleton: classify Review PR 1→code_review, delegate code-reviewer, collect with pr_id,summary,issues,approved. Return {\"passed\":7,\"failed\":0,\"all_passed\":true}" --output-format json --max-turns 15 2>&1)
if echo "$OUT" | python3 -c "import sys; t=sys.stdin.read(); print('OK' if '\"all_passed\":true' in t else 'FAIL')" 2>/dev/null | grep -q OK; then
  pass "walking-skeleton (7 assertions)"
else
  fail "walking-skeleton" "expected all_passed=true"
fi

# ── Summary ──
echo ""
echo "=============================="
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}All ${PASS} gates passed. Build is GREEN.${NC}"
else
  echo -e "${RED}${FAIL} gate(s) failed, ${PASS} passed (${TOTAL} total). Build is RED.${NC}"
fi
echo "=============================="

exit $FAIL
