# ADR-011: Azure Container Apps for compute

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

We need to run Goose orchestrator containers, Slack/Teams bot containers, and MCP sidecar processes in Azure. Options:

1. **Azure Container Apps (ACA)** — serverless containers with KEDA autoscaling.
2. **Azure Kubernetes Service (AKS)** — managed Kubernetes.
3. **Azure App Service** — PaaS web hosting.
4. **Azure Container Instances (ACI)** — single-container, no orchestration.

## Decision

Use Azure Container Apps as the primary compute platform.

## Rationale

- **Serverless** — No Kubernetes cluster to provision, patch, or maintain. No node pool management.
- **Scale-to-zero** — When the queue is empty (idle), containers scale to zero. No idle cost for the orchestrator outside business hours.
- **KEDA autoscaling** — Native integration with Azure Service Bus. Scale based on queue depth, not CPU. Min 0, max 10 replicas.
- **Cost** — Pay only for active containers. A single always-warm bot container costs ~$15/month. Orchestrator replicas scale on demand.
- **Managed TLS** — Automatic HTTPS for public endpoints (Teams bot, Slack bot). No certificate management.
- **Revision management** — Blue/green deployments with traffic splitting. Rollback is instant.
- **Dapr integration** — Optional. For future service-to-service communication patterns without code changes.

### Why not the alternatives?

| Option | Rejected Because |
|---|---|
| **AKS** | Cluster management overhead. Minimum ~$70/month for the control plane even when idle. Overkill for this workload. |
| **App Service** | Designed for request-response web apps. Doesn't natively fit event-driven, queue-based workloads. No scale-to-zero. |
| **ACI** | No autoscaling, no revision management, no managed TLS. Good for one-off tasks; not for production services. |

## Consequences

### Positive
- Zero idle cost with scale-to-zero
- No infrastructure management
- Native integration with the Azure Service Bus scaler

### Negative / Mitigations
- **Not all MCP transports work in ACA** — stdio-based MCP servers (filesystem, git, shell) run as sidecar containers within the same ACA app. SSE and WebSocket work natively.
- **Higher cold-start latency** — After scale-to-zero, first invocation incurs container startup (~5-15 seconds). Mitigation: Keep a minimum of 1 warm replica during business hours if latency is critical.
- **Maximum container lifetime** — ACA recycles containers every 24 hours. Mitigation: The orchestrator handles graceful shutdown, backing up SQLite state before termination.
- **GPU not available (as of 2026)** — LLM inference runs in AI Foundry, not in ACA. No GPU needed.
