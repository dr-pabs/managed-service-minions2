# Deployment Guide — Goose Agent Framework

> **Status:** Phase 3 — Production Ready  
> **Date:** 2026-06-15  
> **Target Goose:** 1.37.0  
> **Target Platform:** Azure Container Apps

---

## 1. Prerequisites

| Tool | Version | Install |
|---|---|---|
| Goose CLI | 1.37.0+ | `brew install goose` or `pipx install goose-cli` |
| Azure CLI | Latest | `az upgrade` |
| Terraform | 1.5+ | `brew install terraform` |
| Docker | 24+ | Docker Desktop or Colima |
| Git | Latest | `brew install git` |
| `gh` CLI | Latest | `brew install gh` |

**Azure resources:** Subscription with Contributor access, registered providers:
```bash
az provider register -n Microsoft.App
az provider register -n Microsoft.ServiceBus
az provider register -n Microsoft.Storage
az provider register -n Microsoft.KeyVault
az provider register -n Microsoft.CognitiveServices
az provider register -n Microsoft.OperationalInsights
```

---

## 2. Local Development Setup

### 2.1 Install the Framework

```bash
# Clone
git clone https://github.com/dr-pabs/managed-service-minions2
cd managed-service-minions2

# Install as Goose plugin
goose plugin install .

# Verify
goose plugin list | grep goose-agent-framework
# Expected: goose-agent-framework 0.1.0
```

### 2.2 Verify Agents

```bash
# Test orchestrator identity
goose run -i tests/roles/orchestrator-identity.md \
  --provider anthropic --model claude-sonnet-4-6 \
  --output-format json --max-turns 10

# Test code-reviewer identity
goose run -i tests/roles/code-reviewer-identity.md \
  --provider anthropic --model claude-sonnet-4-6 \
  --output-format json --max-turns 10

# Run the unified test runner
bash tests/runner.sh
# Expected: exit 0
```

### 2.3 Build the Toolshed (Optional)

```bash
# Requires Rust
cargo build --release --manifest-path mcp-servers/toolshed/Cargo.toml

# Register in Goose config
goose configure --add-extension toolshed \
  --type stdio \
  --cmd "$PWD/mcp-servers/toolshed/target/release/goose-toolshed"
```

---

## 3. Environment Configuration

### 3.1 Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `GOOSE_SERVER__SECRET_KEY` | **Yes** | ACP server authentication token |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | **Yes** | GitHub API access for PR reviews and commits |
| `SLACK_BOT_TOKEN` | For Slack | Slack bot `xoxb-...` token |
| `SLACK_SIGNING_SECRET` | For Slack | Slack signing secret |
| `SLACK_APP_TOKEN` | For Slack | Slack app-level `xapp-...` token |
| `AZURE_AD_CLIENT_ID` | For Teams | Azure AD app registration |
| `AZURE_AD_TENANT_ID` | For Teams | Azure AD tenant |
| `AZURE_AD_CLIENT_SECRET` | For Teams | Azure AD client secret |
| `GOOSE_PROVIDER` | Optional | LLM provider (defaults to config) |
| `GOOSE_MODEL` | Optional | LLM model (defaults to config) |

### 3.2 Secrets Management

All secrets are stored in **Azure Key Vault** in production. For local development, use `.env` files (gitignored):

```bash
# .env (DO NOT COMMIT)
GOOSE_SERVER__SECRET_KEY=your-secret-key
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...
```

---

## 4. Deployment Workflow

### 4.1 Infrastructure Deployment

```bash
# 1. Initialize Terraform (one-time per environment)
cd infra
terraform init \
  -backend-config=environments/dev.tfvars

# 2. Validate configuration
terraform validate

# 3. Plan changes
terraform plan -var-file=environments/dev.tfvars

# 4. Apply (dev first)
terraform apply -var-file=environments/dev.tfvars

# 5. Verify resources
terraform output

# 6. Repeat for staging and production
terraform apply -var-file=environments/staging.tfvars
terraform apply -var-file=environments/prod.tfvars
```

### 4.2 Container Image Build & Push

```bash
# Set variables
ACR_NAME="stgoosefwprod"
IMAGE_TAG=$(git rev-parse --short HEAD)

# Build all images
docker build -f docker/Dockerfile.goose-serve \
  -t ${ACR_NAME}.azurecr.io/goose-serve:${IMAGE_TAG} \
  -t ${ACR_NAME}.azurecr.io/goose-serve:latest .

docker build -f docker/Dockerfile.slack-bot \
  -t ${ACR_NAME}.azurecr.io/slack-bot:${IMAGE_TAG} .

docker build -f docker/Dockerfile.teams-bot \
  -t ${ACR_NAME}.azurecr.io/teams-bot:${IMAGE_TAG} .

docker build -f docker/Dockerfile.dashboard \
  -t ${ACR_NAME}.azurecr.io/dashboard:${IMAGE_TAG} .

# Push to ACR
az acr login -n ${ACR_NAME}
docker push ${ACR_NAME}.azurecr.io/goose-serve:${IMAGE_TAG}
docker push ${ACR_NAME}.azurecr.io/slack-bot:${IMAGE_TAG}
docker push ${ACR_NAME}.azurecr.io/teams-bot:${IMAGE_TAG}
docker push ${ACR_NAME}.azurecr.io/dashboard:${IMAGE_TAG}
```

### 4.3 Canary Deployment

```bash
# Deploy to staging with canary
az containerapp update \
  -n ca-orchestrator-staging \
  -g rg-goosefw-staging \
  --image ${ACR_NAME}.azurecr.io/goose-serve:${IMAGE_TAG}

# Wait 60 seconds for health check
sleep 60

# Run canary gate checks
bash scripts/canary-gate-check.sh staging 15

# If gates pass → promote
bash scripts/canary-promote.sh staging latest

# After staging validated → deploy to production (same process)
```

---

## 5. Post-Deployment Verification

### 5.1 Health Checks

```bash
# Orchestrator
curl -s https://<orchestrator_url>:3284/health

# Slack bot
curl -s https://<slack_bot_url>:3000/health

# Teams bot
curl -s https://<teams_bot_url>:3978/health

# Dashboard
curl -s https://<dashboard_url>/health
```

### 5.2 End-to-End Smoke Test

```bash
# From a goose session
goose session
> /review-pr 342

# Expected: structured review response with pr_id, summary, issues, approved
```

### 5.3 Slack Bot Smoke Test

1. Open your Slack workspace.
2. In an allowed channel, type: `Review PR #342`
3. Expected: `:thinking_face:` reaction appears → threaded reply with structured review.

### 5.4 Teams Bot Smoke Test

1. Open Microsoft Teams.
2. Send: `Review PR #342`
3. Expected: Typing indicator → Adaptive Card with structured review response.

---

## 6. Rollback Procedure

### 6.1 Infrastructure Rollback

```bash
cd infra

# List state versions
terraform state list

# Rollback to previous state
terraform apply -var-file=environments/prod.tfvars \
  -var image_tag=<previous-git-sha> \
  -auto-approve
```

### 6.2 Container Image Rollback

```bash
# Rollback to previous image tag
az containerapp update \
  -n ca-orchestrator-prod \
  -g rg-goosefw-prod \
  --image ${ACR_NAME}.azurecr.io/goose-serve:<previous-tag>

# Verify rollback
az containerapp show -n ca-orchestrator-prod \
  -g rg-goosefw-prod \
  --query "properties.template.containers[0].image"
```

### 6.3 Plugin Rollback

If a plugin update causes issues:
```bash
# Reinstall from the previous release
goose plugin install https://github.com/dr-pabs/managed-service-minions2@v0.1.0
```

---

## 7. Monitoring Setup

### 7.1 Connect Grafana

```bash
# Create Managed Grafana instance
az grafana create -n graf-goosefw -g rg-goosefw-prod --sku Standard

# Link Log Analytics
az grafana data-source create -n graf-goosefw \
  --definition @infra/monitoring/grafana-datasource.json

# Import the dashboard
az grafana dashboard import -n graf-goosefw \
  --definition @infra/monitoring/grafana-dashboard.json
```

### 7.2 Configure Alerts

```bash
# Deploy alert rules via Terraform
cd infra
terraform apply -var-file=environments/prod.tfvars \
  -target module.monitoring
```

### 7.3 Verify Alerting

1. Check Grafana dashboard renders all panels.
2. Trigger a test alert: intentionally fail a minion and verify PagerDuty notification.
3. Confirm Teams channel receives P3 alerts.

---

## 8. Troubleshooting

| Symptom | Check | Fix |
|---|---|---|
| Orchestrator not responding | `az containerapp logs show -n ca-orchestrator-prod -g rg-goosefw-prod` | Check `goose serve` startup errors. Verify `config.yaml` and secrets |
| Minion spawn fails | `toolshed_logs_CL \| where result_s == "failed"` | Check `delegate` tool availability. Verify `summon` extension is enabled |
| Allowlist denials | `toolshed_logs_CL \| where result_s == "blocked"` | Review agent prompt for unauthorized tool use. Update allowlist if legitimate |
| High latency | `toolshed_logs_CL \| summarize percentiles(duration_ms_d, 50, 95, 99)` | Check MCP server health. Scale AI Foundry capacity |
| Container restart loop | `az containerapp revision list -n ca-orchestrator-prod -g rg-goosefw-prod` | Check for OOM. Increase memory allocation. Review crash logs |
| Slack bot not responding | `az containerapp logs show -n ca-slackbot-prod -g rg-goosefw-prod` | Verify `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`. Check ACP WebSocket connectivity |
| Teams bot not responding | `az containerapp logs show -n ca-teamsbot-prod -g rg-goosefw-prod` | Verify Azure AD credentials. Check ACP WebSocket connectivity |
| Cost spike | Azure Cost Management → `Cost by resource` | Filter by `ca-orchestrator-*`. Check for runaway turns or excessive delegate spawning |

---

## 9. Environment Differences

| Setting | Dev | Staging | Production |
|---|---|---|---|
| Replicas | 1 (scale-to-zero) | 2 (warm) | 3-5 (always-on) |
| CPU per replica | 0.5 | 1.0 | 2.0 |
| Memory per replica | 1Gi | 2Gi | 4Gi |
| Model tier | gpt-4o-mini | gpt-4o | gpt-4o |
| Log retention | 3 days | 14 days | 31 days |
| Canary duration | 5 minutes | 1 hour | 15 min + 1 hour extended |
| Alert severity | P3 only | P2 + P3 | P1 + P2 + P3 |
| Backup frequency | None | Daily | Every 15 minutes |
| Auto-scaling KEDA | Disabled | Enabled (max 5) | Enabled (max 10) |

---

## 10. Quick Reference

```bash
# Full deploy to dev
make deploy-dev

# Full deploy to staging
make deploy-staging

# Full deploy to production (with canary)
make deploy-prod

# Rollback production
make rollback-prod REVISION=<previous-git-sha>

# Run all tests
make test

# Run tests + lint
make check

# View production logs (last 15 minutes)
make logs-prod

# Open Grafana dashboard
make grafana
```
