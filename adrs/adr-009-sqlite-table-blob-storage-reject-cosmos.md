# ADR-009: SQLite + Azure Table Storage + Azure Blob for storage (reject Cosmos DB)

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

We need durable storage for three distinct data shapes:
1. **Hot session state** — active orchestrations, in-flight minion DAGs, pending approvals. Read/write during a session.
2. **Tool call log** — immutable, append-only record of every tool invocation. Queried by correlation ID.
3. **Large artifacts** — full minion outputs, diffs, conversation transcripts. Megabytes per session.

Azure Cosmos DB was considered as the "Azure-native NoSQL" option but rejected on cost grounds.

## Decision

Use three purpose-built stores:

| Data Shape | Store | Est. Monthly Cost |
|---|---|---|
| Hot session state | **SQLite** (local to container) | $0 |
| Tool call log | **Azure Table Storage** | ~$1.50 |
| Large artifacts | **Azure Blob Storage** (Cool tier) | ~$0.50 |
| **Total** | | **~$2–$5/month** |

Cosmos DB is explicitly rejected for this use case.

## Rationale

### Rejection of Cosmos DB

| | Cosmos DB Serverless | Our Approach |
|---|---|---|
| Minimum monthly cost | ~$50 | $0 (SQLite) |
| At 1M operations/month | ~$250 | ~$2 |
| Cold start | None | None (Table Storage), instant |
| Query complexity | SQL-like, rich | Partition/Row key (Table), full SQL (SQLite) |

Cosmos DB is excellent for low-latency, globally-distributed, multi-model workloads. Our workload is append-heavy with simple key-based lookups — the wrong fit for Cosmos DB's pricing model.

### Why each store fits its purpose

- **SQLite for session state** — Zero-cost, embedded, full SQL. The orchestrator container needs local state. Backup to Blob ensures durability. Single-replica deployment is sufficient for the initial scope; Service Bus session affinity (ADR-012) handles multi-replica scenarios.
- **Azure Table Storage for the tool call log** — Purpose-built for append-heavy, key-based access. PartitionKey = session correlation ID, RowKey = timestamp + minion + tool. $0.045/GB storage, $0.0036 per 100K transactions. Linear, predictable cost.
- **Azure Blob Storage for large artifacts** — Minion outputs can be megabytes. Cool tier at $0.018/GB/month; Archive tier at $0.002/GB for >90 days. Tier-agnostic to the application.

## Consequences

### Positive
- Radical cost reduction vs. Cosmos DB (~98% less)
- No Azure resource to provision for hot state (SQLite)
- Predictable, linear cost scaling

### Negative / Mitigations
- **SQLite is not shared across replicas** — Mitigation: Service Bus sessions guarantee a session's messages go to a single replica. For HA, the orchestrator instance is rebuilt from the WAL backup in Blob.
- **Table Storage has no secondary indexes** — Mitigation: All tool calls also stream to Log Analytics via Container Insights for KQL querying, dashboards, and alerts.
- **SQLite backup must be handled by the application** — Mitigation: The orchestrator writes periodic WAL snapshots to Blob. On container restart, the latest snapshot is restored.
- **Abstraction layer required for future migration** — Mitigation: The `mcp-toolshed` exposes a storage interface. Table Storage is one implementation. The interface can accept Cosmos DB or PostgreSQL later if requirements change.
