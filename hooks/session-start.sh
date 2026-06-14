#!/bin/bash
# Goose Agent Framework — Session Start Hook
# Initializes a correlation ID and session record for tracing.
#
# Triggered by: SessionStart (see hooks/hooks.json)

CORR_ID="corr_$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo "$(date +%s)-$(shuf -i 1000-9999 -n 1)")"
export GOOSE_CORRELATION_ID="$CORR_ID"

# Write session start record (best-effort — goose may not expose session ID to hooks)
echo "[goose-agent-framework] Session started | correlation_id=${CORR_ID} | ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# If goose exposes a session ID via env var, write to SQLite
if [ -n "${GOOSE_SESSION_ID:-}" ]; then
  sqlite3 ~/.local/share/goose/sessions/sessions.db "
    INSERT INTO framework_sessions (session_id, correlation_id, status, created_at)
    VALUES ('${GOOSE_SESSION_ID}', '${CORR_ID}', 'active', datetime('now'));
  " 2>/dev/null || true
fi
