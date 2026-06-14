# ADR-010: Azure AI Foundry as the AI platform

| Key | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-06-05 |
| **Deciders** | Goose Agent Framework team |
| **Replaces** | — |
| **Superseded by** | — |

---

## Context

Minions need access to multiple LLM models for different task profiles:
- **Fast tier** — intent classification, ticket summarization, response synthesis
- **Reasoning tier** — task decomposition, code exploration, complex reasoning
- **Code review tier** — deep code analysis, nuance, security pattern detection
- **Code generation tier** — implementing fixes, writing tests, authoring PRs
- **Security tier** — vulnerability scanning, CVE analysis, dependency auditing

Model names (GPT-4o, Claude Sonnet, etc.) are **not hardcoded**. The framework maps task types to configurable model tiers. When a model is retired or upgraded, only the tier-to-deployment mapping changes — no code changes. See `how-goose-works-with-llms.md` for the tier configuration.

Options:

1. **Azure AI Foundry** — unified model catalog with built-in content safety, RBAC, monitoring, and managed identity.
2. **Direct API keys per provider** — OpenAI API, Anthropic API. Manage keys and billing separately across vendors.
3. **Self-hosted models** — run vLLM, Ollama, or similar on our own compute (AKS or VMs).

## Decision

Use Azure AI Foundry as the single AI platform for all model inference.

## Rationale

- **Unified model catalog** — Access any model in the catalog via configurable tiers (fast, reasoning, code_review, code_generation, security). No per-provider API key management. Model changes are a config deployment, not a code change.
- **Built-in content safety** — Azure AI Content Safety filters for prompt injection, harmful content, and jailbreak attempts at the platform level — before the model sees the request and before the response reaches the user.
- **Azure AD RBAC** — Goose containers authenticate via managed identity, not static API keys. Key Vault stores zero LLM API keys.
- **Unified monitoring** — All model calls flow through Azure Monitor. Latency, token usage, and error rates are visible in one dashboard.
- **Regional compliance** — Models are deployed to specific Azure regions. Data residency requirements are met by choosing the right deployment region.
- **Provisioned throughput** — For high-traffic minions, provisioned throughput (PTU) guarantees capacity and predictable cost.

## Consequences

### Positive
- No API key sprawl
- Unified content safety
- Simplified billing (one Azure subscription)
- Future-proof — add new models from the catalog without code changes

### Negative / Mitigations
- **Model availability is region-dependent** — Mitigation: Multi-region deployment planning. The `deploy-model` skill discovers capacity across regions.
- **Foundry deployments must be provisioned ahead of time** — Mitigation: Deployment is scripted/automated. Scaling rules trigger new deployments when capacity thresholds are hit.
- **Slight latency overhead vs. direct API** — Acceptable for batch/async minion workloads. Not real-time serving.
