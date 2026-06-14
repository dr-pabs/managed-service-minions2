# ADR-016: Three-layer tool call capture

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

Every tool call must be logged for auditability, debugging, compliance, and cost attribution. How many capture points, and which one is authoritative?

Options:

1. **Single layer** — log only at the tool call site (inside the minion).
2. **Two layers** — log at the minion level and at the MCP server level.
3. **Three layers** — Goose-native (automatic), MCP toolshed proxy (primary, mandatory), and MCP server-side (optional defense-in-depth).

## Decision

Implement three-layer capture:

| Layer | Where | Purpose | Mandatory? |
|---|---|---|---|
| **A: Goose-native** | Goose delegate infrastructure | Automatic capture of tool calls within each delegate invocation. Session reconstruction. | Yes (free, built-in) |
| **B: MCP toolshed proxy** | Between minion and MCP server | **Primary capture point.** Allowlist enforcement, rate limiting, parameter logging, result summary. Writes to Azure Table Storage + stdout → Log Analytics. | **Yes** |
| **C: Server-side** | Each MCP server itself | Independent verification. Defense-in-depth against a compromised toolshed. | No |

**Layer B is the authoritative source.** Layer A is a free supplement. Layer C is optional defense-in-depth.

### What Layer B captures:

**Before call (synchronous):**
- Timestamp (UTC, ISO 8601)
- Correlation ID (minion run level)
- MCP server name
- Tool name
- Parameters (JSON, truncated at 4KB to control storage)
- Minion type

**After call (synchronous):**
- Result summary (first 1KB)
- Status: `success` | `error` | `blocked_by_allowlist` | `throttled`
- Latency in milliseconds
- Error details if failed
- Token usage if the MCP server reports it

**Blocked calls (security events):**
- If the allowlist rejects the call — logged as a security event, HTTP 403 returned to minion
- If the rate limiter blocks the call — logged as a throttle event, HTTP 429 returned

## Rationale

- **Layer B is mandatory by design** — Every tool call flows through the toolshed. Capture is unavoidable and cannot be bypassed.
- **Layer A is free** — Goose already tracks tool calls internally. No additional cost or code.
- **Layer C is optional defense** — If the toolshed is ever compromised, server-side logs provide independent verification. This follows the "assume breach" principle.
- **Two output channels** — Table Storage for durable, queryable audit. Log Analytics for real-time querying, dashboards, and alert rules.
- **Immutable** — Table Storage writes are append-only. No modification of logged calls. 90-day retention.

## Consequences

### Positive
- Complete, immutable audit trail
- Real-time querying via KQL in Log Analytics
- Defense-in-depth (three independent capture points)

### Negative / Mitigations
- **Tool call latency increases by ~1-2ms** — Table Storage write + stdout. Negligible relative to typical tool call durations (10ms–5000ms).
- **Three layers may show discrepancies** — Timing differences, truncation boundaries. Mitigation: Layer B is declared authoritative. Discrepancies are flagged as warnings.
- **Table Storage has no schema enforcement** — Mitigation: The toolshed ensures consistent column shapes. Integration tests verify the log schema.
- **4KB parameter truncation** — Long parameters (e.g., full file contents) are truncated in the log. Mitigation: The full payload is available in the minion's output artifact in Blob Storage (ADR-009).
