#!/bin/bash
# Goose Agent Framework — Test Runner
# Runs all Phase 1 quality gates. Exits 0 only if every test passes.
#
# Usage: bash tests/runner.sh

set -euo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}FAIL${NC} $1 — $2"; FAIL=$((FAIL+1)); }

echo "=== Goose Agent Framework — Test Runner ==="
echo ""

# ── Gate 1: Orchestrator Identity ──
echo "── Gate 1: Orchestrator Identity ──"
OUT=$(goose run -i tests/roles/orchestrator-identity.md --output-format json --max-turns 15 2>&1) || true
if echo "$OUT" | grep -q '"all_passed": true'; then
  pass "orchestrator-identity"
else
  fail "orchestrator-identity" "expected all_passed=true in JSON output"
fi

# ── Gate 2: Code Reviewer Identity ──
echo "── Gate 2: Code Reviewer Identity ──"
OUT=$(goose run -i tests/roles/code-reviewer-identity.md --output-format json --max-turns 15 2>&1) || true
if echo "$OUT" | grep -q '"all_passed": true'; then
  pass "code-reviewer-identity"
else
  fail "code-reviewer-identity" "expected all_passed=true in JSON output"
fi

# ── Gate 3: Delegate Spawn ──
echo "── Gate 3: Delegate Spawn (code-reviewer) ──"
OUT=$(goose run --with-builtin summon -t "Spawn via delegate: source='code-reviewer', instructions='Report your role and available tools as JSON', extensions=[], async=false. Return ONLY the JSON result." --output-format json --max-turns 10 2>&1) || true
if echo "$OUT" | grep -q '"role".*"code-reviewer"'; then
  pass "delegate-spawn"
else
  fail "delegate-spawn" "delegate did not return code-reviewer role"
fi

# ── Gate 4: Walking Skeleton ──
echo "── Gate 4: Walking Skeleton ──"
OUT=$(goose run -i tests/integration/walking-skeleton.md --output-format json --max-turns 30 2>&1) || true
if echo "$OUT" | grep -q '"all_passed": true'; then
  pass "walking-skeleton"
else
  fail "walking-skeleton" "integration test did not pass"
fi

# ── Summary ──
echo ""
echo "=============================="
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}All $PASS gates passed. Build is green.${NC}"
else
  echo -e "${RED}$FAIL gate(s) failed, $PASS passed ($TOTAL total). Build is RED.${NC}"
fi
echo "=============================="

exit $FAIL
