#!/bin/bash
# Goose Agent Framework — Session End Hook
# Writes a session journal entry with run metadata.
#
# Triggered by: SessionEnd (see hooks/hooks.json)

CORR_ID="${GOOSE_CORRELATION_ID:-unknown}"

# Update session record if session ID is available
if [ -n "${GOOSE_SESSION_ID:-}" ]; then
  sqlite3 ~/.local/share/goose/sessions/sessions.db "
    UPDATE framework_sessions
    SET status = 'completed', completed_at = datetime('now')
    WHERE session_id = '${GOOSE_SESSION_ID}';
  " 2>/dev/null || true
fi

echo "[goose-agent-framework] Session ended | correlation_id=${CORR_ID} | ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
