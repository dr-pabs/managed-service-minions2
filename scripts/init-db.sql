-- Goose Agent Framework — Data Model
-- Version: 0.1.0
-- Target: SQLite 3.35+ (bundled with Goose 1.37.0)
-- Location: ~/.local/share/goose/sessions/sessions.db (co-located with Goose's own tables)
--
-- Apply: sqlite3 ~/.local/share/goose/sessions/sessions.db < scripts/init-db.sql

-- ── Framework Sessions ──────────────────────────────────────────────────
-- One row per goose session that loads the framework plugin.
-- Mirrors goose's internal sessions table with framework-specific columns.

CREATE TABLE IF NOT EXISTS framework_sessions (
    session_id    TEXT PRIMARY KEY,                           -- Goose session ID (e.g. "20260615_1")
    correlation_id TEXT NOT NULL UNIQUE,                      -- corr_<uuid> — root correlation ID
    status        TEXT NOT NULL DEFAULT 'active',            -- active | completed | dead_lettered
    minion_count  INTEGER NOT NULL DEFAULT 0,                 -- Number of minions spawned
    tool_call_count INTEGER NOT NULL DEFAULT 0,               -- Number of tool calls made
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),   -- ISO 8601 UTC
    completed_at  TEXT                                       -- Set on session end
);

-- ── Minion Runs ─────────────────────────────────────────────────────────
-- One row per delegate spawn. Each minion is a sub-agent spawned via
-- the delegate tool with source = agent name.

CREATE TABLE IF NOT EXISTS minion_runs (
    id            TEXT PRIMARY KEY,                           -- corr_<uuid>.<N> — child correlation ID
    session_id    TEXT NOT NULL REFERENCES framework_sessions(session_id),
    agent         TEXT NOT NULL,                              -- Agent name: code-reviewer, ticket-analyst, etc.
    source        TEXT,                                       -- Agent .md file path (for debugging)
    task_id       TEXT,                                       -- Delegate task handle ID
    max_turns     INTEGER NOT NULL DEFAULT 20,
    status        TEXT NOT NULL DEFAULT 'running',            -- running | completed | failed | dead_lettered | interrupted
    attempts      INTEGER NOT NULL DEFAULT 1,                 -- Retry count (1 = first attempt)
    last_error    TEXT,                                       -- Error message from last failed attempt
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at  TEXT
);

-- ── Tool Call Log ───────────────────────────────────────────────────────
-- One row per tool call, regardless of result.
-- Populated by the toolshed MCP server (mcp-servers/toolshed/src/logger.rs).

CREATE TABLE IF NOT EXISTS tool_calls (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
    correlation_id  TEXT NOT NULL,                            -- Child correlation ID (matches minion_runs.id)
    agent           TEXT NOT NULL,                            -- Agent type that made the call
    tool_name       TEXT NOT NULL,                            -- e.g. "github.get_pr_diff"
    params          TEXT,                                     -- JSON blob of input parameters
    result          TEXT NOT NULL DEFAULT 'pending',          -- success | failure | blocked
    duration_ms     INTEGER,                                  -- Wall-clock duration of the call
    output_size_bytes INTEGER,                                -- Size of the tool response
    reason          TEXT                                      -- Block reason (allowlist_denied, rate_limited)
);

-- ── Allowlist Denials ───────────────────────────────────────────────────
-- Security-relevant. Every blocked tool call is recorded here for audit.

CREATE TABLE IF NOT EXISTS allowlist_denials (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
    correlation_id  TEXT NOT NULL,
    agent           TEXT NOT NULL,
    tool_name       TEXT NOT NULL,                            -- The tool that was blocked
    params          TEXT,                                     -- What the minion tried to pass
    reason          TEXT NOT NULL DEFAULT 'allowlist_denied', -- allowlist_denied | rate_limited
    INDEX idx_denials_agent (agent),
    INDEX idx_denials_timestamp (timestamp)
);

-- ── Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fw_sessions_corr ON framework_sessions(correlation_id);
CREATE INDEX IF NOT EXISTS idx_fw_sessions_status ON framework_sessions(status);
CREATE INDEX IF NOT EXISTS idx_minion_runs_session ON minion_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_minion_runs_agent ON minion_runs(agent);
CREATE INDEX IF NOT EXISTS idx_minion_runs_status ON minion_runs(status);
CREATE INDEX IF NOT EXISTS idx_tool_calls_corr ON tool_calls(correlation_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_agent ON tool_calls(agent);
CREATE INDEX IF NOT EXISTS idx_tool_calls_result ON tool_calls(result);
