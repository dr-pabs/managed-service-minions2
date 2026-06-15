# Production Deployment Runbook

> **Date:** 2026-06-15\
> **Status:** Phase 3 — Production Ready\
> **Purpose:** Step-by-step operational procedures for deploying, monitoring, and recovering the Goose Agent Framework in production.

______________________________________________________________________

## 1. Prerequisites

- Azure subscription with Contributor access
- `az` CLI authenticated (`az login`)
- `terraform` v1.5+ installed
- `gh` CLI authenticated for GitHub Actions
- Goose 1.37.0+ installed
- Docker installed for image builds
- Access to `dr-pabs/managed-service-minions2` repo

______________________________________________________________________

## 2. Initial Deployment

### 2.1 One-Time Setup

````bash
# Clone the repo
git clone https://github.com/dr-pabs/managed-service-minions2
cd managed-service-minions2

# Create Terraform state storage (one-time, per subscription)
az group create -n rg-goosefw-tfstate -l uksouth
az storage account create -n stgoosefwtfstate -g rg-goosefw-tfstate --sku Standard_ZRS
az storage container create -n tfstate --account-name stgoosefwtfstate

# Build and push container images
docker build -f docker/Dockerfile.goose-serve -t stgoosefwprod.azurecr.io/goose-serve:latest .
docker build -f docker/Dockerfile.slack-bot -t stgoosefwprod.azurecr.io/slack-bot:latest .
docker build -f docker/Dockerfile.teams-bot -t stgoosefwprod.azurecr.io/teams-bot:latest .
docker build -f docker/Dockerfile.dashboard -t stgoosefwprod.azurecr.io/dashboard:latest .
az acr login -n stgoosefwprod
docker push stgoosefwprod.azurecr.io/goose-serve:latest
docker push stgoosefwprod.azurecr.io/slack-bot:latest
docker push stgoosefwprod.azurecr.io/teams-bot:latest
docker push stgoosefwprod.azurecr.io/dashboard:latest
```text

### 2.2 Deploy Infrastructure

```bash
cd infra

# Plan (review changes)
terraform plan -var-file=environments/prod.tfvars -out=tfplan

# Apply
terraform apply tfplan

# Verify outputs
terraform output orchestrator_url
terraform output slack_bot_fqdn
terraform output teams_bot_fqdn
terraform output service_bus_namespace
terraform output key_vault_uri
```text

### 2.3 Post-Deploy Verification

```bash
# Health check the orchestrator
curl -s https://<orchestrator_fqdn>:3284/health || echo "Orchestrator not responding"

# Check Service Bus connectivity
az servicebus namespace show -n sb-goosefw-prod -g rg-goosefw-prod

# Verify Key Vault secrets
az keyvault secret list --vault-name kv-goosefw-prod

# Check Container Apps are running
az containerapp show -n ca-orchestrator-prod -g rg-goosefw-prod --query properties.runningStatus
az containerapp show -n ca-slackbot-prod -g rg-goosefw-prod --query properties.runningStatus
az containerapp show -n ca-teamsbot-prod -g rg-goosefw-prod --query properties.runningStatus
```text

______________________________________________________________________

## 3. CI/CD Pipeline

### 3.1 Pipeline Flow

```text
PR opened
  │
  ├─► Lint gates (markdown, YAML, shell)
  ├─► Rust gates (clippy + test)
  ├─► Identity tests (all agents)
  ├─► Walking skeleton
  └─► Terraform validation
       │
       ▼
  All pass → Merge allowed
       │
       ▼
  Merge to dev
       │
       ├─► Build images (goose-serve, bots, dashboard)
       ├─► Push to ACR (latest + git-sha)
       ├─► Deploy to staging (terraform apply)
       │     │
       │     ├─► Canary: 10% traffic for 1 hour
       │     └─► Full rollout after canary passes
       │
       ▼
  Manual approval
       │
       ▼
  Deploy to production
       │
       ├─► Canary: 10% traffic for 15 minutes
       └─► Full rollout after canary passes
```text

### 3.2 Manual Deployment (if CI unavailable)

```bash
# From the repo root, on main branch
git checkout main && git pull

# Build images
docker build -f docker/Dockerfile.goose-serve -t stgoosefwprod.azurecr.io/goose-serve:$(git rev-parse --short HEAD) .
docker build -f docker/Dockerfile.slack-bot -t stgoosefwprod.azurecr.io/slack-bot:$(git rev-parse --short HEAD) .
docker build -f docker/Dockerfile.teams-bot -t stgoosefwprod.azurecr.io/teams-bot:$(git rev-parse --short HEAD) .
docker build -f docker/Dockerfile.dashboard -t stgoosefwprod.azurecr.io/dashboard:$(git rev-parse --short HEAD) .

# Push to ACR
az acr login -n stgoosefwprod
docker push stgoosefwprod.azurecr.io/goose-serve:$(git rev-parse --short HEAD)
# ... (repeat for other images)

# Apply infrastructure
cd infra
terraform apply -var-file=environments/prod.tfvars -var image_tag=$(git rev-parse --short HEAD) -auto-approve
```text

______________________________________________________________________

## 4. Monitoring & Alerting

### 4.1 Key Metrics

| Metric | Source | Threshold | Alert |
|---|---|---|---|
| Orchestrator 5xx rate | Log Analytics | > 5% for 5 minutes | P2 — investigate within 30 minutes |
| Orchestrator latency P95 | Log Analytics | > 10s for 5 minutes | P3 — investigate within 2 hours |
| Minion failure rate | Log Analytics | > 10% for 15 minutes | P2 — investigate within 30 minutes |
| Minion timeout rate | Log Analytics | > 5% for 15 minutes | P2 — check for runaway delegates |
| Allowlist denial rate | Toolshed stdout logs | > 0% (any denial) | P3 — security event, investigate |
| Container App CPU > 80% | Azure Monitor | Sustained for 10 minutes | P3 — consider scaling |
| Container App memory > 80% | Azure Monitor | Sustained for 10 minutes | P3 — consider scaling |
| Service Bus dead-letter count | Azure Monitor | > 0 (any dead-letter) | P2 — investigate failed minions |
| AI Foundry throttling | Azure Monitor | > 10 throttle events in 5 minutes | P2 — increase capacity or optimize prompts |
| Cost spike | Azure Cost Management | > 2x daily average | P3 — investigate runaway or abuse |

### 4.2 Log Queries (KQL)

```kql
// Minion failure rate by agent type (last hour)
toolshed_logs_CL
| where TimeGenerated > ago(1h)
| where result_s == "failure"
| summarize failures=count() by agent_s, bin(TimeGenerated, 5m)

// Allowlist denials (security events)
toolshed_logs_CL
| where result_s == "blocked"
| project TimeGenerated, correlation_id_s, agent_s, tool_s, reason_s

// Orchestrator error rate
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "ca-orchestrator-prod"
| where Log_s contains "error" or Log_s contains "failed"
| summarize count() by bin(TimeGenerated, 5m)

// P95 latency by tool
toolshed_logs_CL
| where result_s == "success"
| summarize percentile(duration_ms_d, 95) by tool_s
```text

### 4.3 Grafana Dashboard Panels

| Panel | Type | Data Source |
|---|---|---|
| Minion throughput (per minute) | Time series | Log Analytics |
| Failure rate by agent | Bar gauge | Log Analytics |
| P50/P95/P99 tool call latency | Heatmap | Log Analytics |
| Allowlist denials (24h) | Stat | Log Analytics |
| Active sessions | Stat | Container Apps metrics |
| Cost by agent (daily) | Bar chart | Azure Cost Management |
| Orchestrator CPU/memory | Time series | Container Apps metrics |
| Dead-letter queue depth | Time series | Service Bus metrics |

______________________________________________________________________

## 5. Operational Runbooks

### 5.1 Investigate Failed Session

1. **Get the correlation ID.** From the user's error message or Slack/Teams bot response.
1. **Open the dashboard.** Navigate to `https://dashboard-url/sessions` and paste the `corr_` ID.
1. **View the correlation tree.** Identify which minion failed and at what stage.
1. **Inspect the minion's tool calls.** Check the toolshed audit log for the correlation ID.
1. **Determine the failure mode:**
   - **Timeout** → The PR may be too large. Retry with reduced scope or increase max_turns.
   - **Allowlist denial** → The minion tried to use an unauthorized tool. Check allowlist config.
   - **Invalid output** → The minion returned malformed JSON. Check prompt quality.
   - **Delegate failed** → Goose runtime error. Check Container App logs.
1. **Retry or escalate.** If the same minion fails 3 times with the same error, escalate to the framework team.

### 5.2 Recover from Orchestrator Crash

1. **Check Grafana Sev-1 alert.** Orchestrator 5xx rate should trigger P1 alert.
1. **Check Container App status:**
   ```bash
   az containerapp show -n ca-orchestrator-prod -g rg-goosefw-prod
   ```text
1. **Diagnose:**
   - **OOM** → Increase memory allocation. Check for memory leak in recent deploys.
   - **Startup failure** → Check Container App logs. Verify `goose serve` starts correctly.
   - **Config error** → Verify `config.yaml` and Key Vault secrets.
1. **KEDA auto-respawn.** Container Apps will automatically restart crashed replicas.
1. **SQLite recovery.** If the orchestrator's SQLite WAL is corrupted:
   ```bash
   # Restore from latest Blob backup (<15 min RPO)
   az storage blob download -c sqlite-backups --account-name stgoosefwprod \
     -n sessions-latest.db -f /tmp/sessions-restored.db
   ```text
1. **Service Bus message replay.** Undelivered messages remain in the topic. After restart, the orchestrator processes the backlog.

### 5.3 Scale AI Foundry Capacity

1. **Throttling alert fires.** AI Foundry returning 429s.
1. **Check current TPM:**
   ```bash
   az cognitiveservices account show -n foundry-goosefw-prod -g rg-goosefw-prod \
     --query properties.quotaLimit
   ```text
1. **Increase capacity:**
   ```bash
   # Edit environments/prod.tfvars — increase model_deployments.<tier>.capacity
   cd infra
   terraform apply -var-file=environments/prod.tfvars
   ```text
1. **Monitor for 15 minutes.** Confirm throttling drops to zero.
1. **If PTU is needed:** Request PTU quota from Azure, update to `Standard_S0` with PTU, reapply.

### 5.4 Deploy Model Tier Update

1. **Update provider.yaml** (in the framework repo):
   ```yaml
   models:
     reasoning:
       name: gpt-4o
       version: "2024-08-06"
       capacity: 200
   ```text
1. **CI/CD pipeline** picks up the change on merge.
1. **Staging canary (1 hour):** 10% of traffic uses the new model tier.
1. **Monitor Grafana:** Compare minion quality metrics (accuracy, latency, cost) vs. baseline.
1. **If metrics hold:** Promote to full staging → manual approval → production canary.
1. **If metrics degrade:** Auto-rollback via Terraform state restore.

______________________________________________________________________

## 6. Disaster Recovery

### 6.1 Recovery Objectives

| Metric | Target | Current |
|---|---|---|
| RPO (Recovery Point Objective) | < 15 minutes | SQLite WAL backup every 15 minutes to Blob |
| RTO (Recovery Time Objective) | < 30 minutes | Container Apps auto-respawn + Terraform reapply |

### 6.2 Regional Failure (not in Phase 1-3 scope)

The framework is single-region (uksouth). Multi-region DR is a Phase 4+ enhancement. In a regional outage:

1. All services are unavailable.
1. Recovery requires Terraform apply in a new region.
1. SQLite state is lost beyond the last Blob backup (RPO: 15 minutes).

### 6.3 Backup & Restore

```bash
# Manual backup (SQLite WAL → Blob)
az storage blob upload -c sqlite-backups --account-name stgoosefwprod \
  -n sessions-$(date +%Y%m%d-%H%M%S).db \
  -f ~/.local/share/goose/sessions/sessions.db

# Restore from backup
az storage blob download -c sqlite-backups --account-name stgoosefwprod \
  -n <backup-name> -f /tmp/sessions-restored.db
```text

______________________________________________________________________

## 7. Security Procedures

### 7.1 Secret Rotation

| Secret | Rotation Cadence | Procedure |
|---|---|---|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | 90 days | Generate new PAT → update Key Vault → restart containers |
| `GOOSE_SERVER__SECRET_KEY` | 180 days | Generate new key → update Key Vault → restart containers |
| `SLACK_BOT_TOKEN` | Per Slack policy | Rotate in Slack admin → update Key Vault |
| `AZURE_AD_CLIENT_SECRET` | 180 days | Rotate in Azure AD → update Key Vault |

### 7.2 Incident Response

1. **Contain.** Disable the affected minion type via allowlist update.
1. **Investigate.** Use the dashboard correlation tree to trace the incident.
1. **Remediate.** Apply the fix, re-enable the minion type.
1. **Post-mortem.** Document the incident in `docs/postmortems/YYYY-MM-DD.md`.

______________________________________________________________________

## 8. Cost Management

### 8.1 Monthly Cost Baseline (Production)

| Resource | Estimated Cost |
|---|---|
| Container Apps (orchestrator, 2 bots) | ~$50/month |
| Service Bus (Standard) | ~$10/month |
| Storage (Blob + Table) | ~$5/month |
| Key Vault | ~$3/month |
| AI Foundry (PayGo, 5 model tiers) | Variable — $500-$2,000/month |
| Log Analytics (31-day retention) | ~$20/month |
| **Total estimated** | **~$600-$2,100/month** |

### 8.2 Cost Optimization

- **Scale-to-zero in dev.** Container Apps consume $0 when idle.
- **Right-size model tiers.** Use `gpt-4o-mini` for fast tasks, `gpt-4o` for reasoning.
- **PTU for predictable workloads.** If consistently >200 sessions/day, PTU is cheaper than PayGo.
- **Log retention.** Reduce to 7 days in dev/staging.
- **Service Bus.** Standard tier is adequate. Only upgrade to Premium if message size >256KB.
````
