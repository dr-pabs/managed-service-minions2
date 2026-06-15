# Microsoft Foundry Integration Design

> **Status:** Phase 4 — Design Complete, Awaiting Foundry Deployment\
> **Date:** 2026-06-15\
> **Reference:** ADR-010 — Azure AI Foundry as the AI Platform\
> **Complements:** `docs/how-goose-works-with-llms.md`, `docs/high-level-design.md`

## 1. Overview

Per ADR-010, the framework routes each agent type to a specific Azure AI Foundry model tier optimized for its task profile. The `delegate` tool supports `provider` and `model` parameters, enabling per-minion model selection without code changes.

## 2. Model Tier → Agent Mapping

| Tier | Foundry Deployment | Agent Types | Rationale |
|---|---|---|---|
| **Fast** | `gpt-4o-mini` (100 TPM) | `ticket-analyst`, intent classification | Low latency, simple lookups, status queries |
| **Reasoning** | `gpt-4o` (100 TPM) | `code-explorer`, task decomposition | Complex reasoning, code tracing, DAG planning |
| **Code Review** | `gpt-4o` (200 TPM) | `code-reviewer` | Deep analysis, nuance, security pattern detection |
| **Code Generation** | `gpt-4o` (200 TPM) | `pr-crafter` | Implementing fixes, writing tests, authoring PRs |
| **Security** | `gpt-4o` (100 TPM) | `security-auditor` | Vulnerability scanning, CVE analysis, dependency auditing |

## 3. Delegate Model Routing

The orchestrator passes `provider` and `model` to each `delegate` call based on the agent type:

```
// Fast tier — ticket analyst
delegate({
  source: "ticket-analyst",
  parameters: { ticket_id: "INC00421" },
  provider: "azure_openai",
  model: "gpt-4o-mini",
  extensions: ["toolshed"],
  max_turns: 10,
  async: true
})

// Code review tier — code reviewer
delegate({
  source: "code-reviewer",
  parameters: { pr_number: 342, repo: "org/repo" },
  provider: "azure_openai",
  model: "gpt-4o",
  extensions: ["toolshed"],
  max_turns: 20,
  async: true
})
```

## 4. Provider Configuration

### 4.1 Goose `config.yaml`

```yaml
providers:
  azure_openai:
    type: azure_openai
    endpoint: "https://foundry-goosefw-${ENV}.openai.azure.com"
    api_version: "2024-08-01-preview"
    models:
      - name: gpt-4o-mini
        deployment: fast-tier
      - name: gpt-4o
        deployment: reasoning-tier
      - name: gpt-4o
        deployment: code-review-tier
      - name: gpt-4o
        deployment: code-gen-tier
      - name: gpt-4o
        deployment: security-tier
```

### 4.2 Terraform — Model Deployments

```hcl
# From infra/variables.tf
variable "model_deployments" {
  type = map(object({
    model_name    = string
    model_version = string
    capacity      = number
  }))
  default = {
    "fast-tier" = {
      model_name    = "gpt-4o-mini"
      model_version = "2024-07-18"
      capacity      = 100
    }
    "reasoning-tier" = {
      model_name    = "gpt-4o"
      model_version = "2024-08-06"
      capacity      = 100
    }
    "code-review-tier" = {
      model_name    = "gpt-4o"
      model_version = "2024-08-06"
      capacity      = 200
    }
    "code-gen-tier" = {
      model_name    = "gpt-4o"
      model_version = "2024-08-06"
      capacity      = 200
    }
    "security-tier" = {
      model_name    = "gpt-4o"
      model_version = "2024-08-06"
      capacity      = 100
    }
  }
}
```

## 5. Foundry Agent Deployment (Phase 4+)

Beyond model routing, Foundry supports deploying AI agents as managed endpoints. The framework can deploy minions as Foundry agents:

```bash
# Deploy code-reviewer as a Foundry agent
az ml agent create \
  --name code-reviewer \
  --resource-group rg-goosefw-prod \
  --workspace-name mlw-goosefw-prod \
  --agent-definition .agents/agents/code-reviewer.md \
  --model-deployment code-review-tier \
  --endpoint-name code-reviewer-endpoint
```

### Foundry Agent Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Azure AI Foundry                                        │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │Fast Tier │ │Reasoning │ │Code Rev  │ │Security  │   │
│  │(mini)    │ │(gpt-4o)  │ │(gpt-4o)  │ │(gpt-4o)  │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
│       │            │            │            │          │
│       ▼            ▼            ▼            ▼          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Content Safety Filter (input + output)           │   │
│  │  • Jailbreak detection                            │   │
│  │  • Protected material detection                   │   │
│  │  • Violence/self-harm/hate filtering              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Prompt Flow (optional)                            │   │
│  │  • Pre-processing: system prompt injection         │   │
│  │  • Post-processing: schema validation              │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 6. Monitoring & Cost Attribution

| Metric | Source | Purpose |
|---|---|---|
| Tokens per agent per day | Foundry metrics | Cost attribution to each minion type |
| Throttle events | Foundry metrics | Alert on quota exhaustion (P1) |
| Content filter triggers | Foundry metrics | Security event — review blocked content |
| P50/P95 latency per tier | Foundry metrics | Performance baseline per model tier |

## 7. CI/CD Integration

```yaml
# In .github/workflows/ci.yml — additional job for Foundry deploy

deploy-foundry:
  name: Deploy to Foundry
  runs-on: ubuntu-latest
  needs: [lint, rust, identity, terraform]
  steps:
    - uses: azure/login@v2
    - name: Validate model deployments
      run: |
        az cognitiveservices account show \
          -n foundry-goosefw-${ENV} -g rg-goosefw-${ENV}
    - name: Deploy agent definitions
      run: |
        for agent in code-reviewer code-explorer pr-crafter ticket-analyst security-auditor; do
          az ml agent create \
            --name $agent \
            --resource-group rg-goosefw-${ENV} \
            --agent-definition .agents/agents/$agent.md
        done
```

## 8. Deployment Status

| Tier | Provisioned (Terraform) | Model Routed (Delegate) | Tested |
|---|---|---|---|
| Fast (`gpt-4o-mini`) | ✅ | ❌ | ❌ |
| Reasoning (`gpt-4o`) | ✅ | ❌ | ❌ |
| Code Review (`gpt-4o`) | ✅ | ❌ | ❌ |
| Code Generation (`gpt-4o`) | ✅ | ❌ | ❌ |
| Security (`gpt-4o`) | ✅ | ❌ | ❌ |

All tiers are provisioned in Terraform but not yet routed or tested — blocked on Azure subscription credentials for Foundry deployment.
