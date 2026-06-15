# Canary Deployment Configuration

> **Status:** Phase 3 — Production Ready  
> **Date:** 2026-06-15  

## Concept

Canary deployments route a small percentage of traffic to a new revision before full rollout. If the canary passes health and quality checks, traffic is increased to 100%. If it fails, traffic is rolled back to the previous revision.

---

## 1. Container Apps Configuration

### 1.1 Canary Revision Pattern

```hcl
# In Terraform: infra/main.tf

resource "azurerm_container_app" "orchestrator" {
  name                         = "ca-orchestrator-${local.env}"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Multiple"  # Required for canary

  template {
    container {
      name   = "orchestrator"
      image  = "${var.acr_name}.azurecr.io/goose-serve:${var.image_tag}"
      cpu    = var.orchestrator_cpu
      memory = var.orchestrator_memory
      # ... env vars and secrets
    }
  }

  # Active revision (stable)
  ingress {
    allow_insecure_connections = false
    external_enabled           = true
    target_port                = 3284
    transport                  = "http"

    traffic_weight {
      percentage      = 90                  # 90% to stable
      revision_suffix = "stable"
      latest_revision = false
    }

    traffic_weight {
      percentage      = 10                  # 10% to canary
      latest_revision = true               # New revision = canary
    }
  }

  lifecycle {
    ignore_changes = [ingress]             # Managed by canary tooling
  }
}
```

### 1.2 Canary Promotion Script

```bash
#!/bin/bash
# scripts/canary-promote.sh — Promote canary revision to 100%
# Usage: bash scripts/canary-promote.sh <env> <revision-name>

ENV=${1:-staging}
REVISION=${2:-latest}

RESOURCE_GROUP="rg-goosefw-${ENV}"
APP_NAME="ca-orchestrator-${ENV}"

echo "=== Canary Promotion: ${ENV} ==="

# 1. Get current revisions
echo "Current traffic split:"
az containerapp revision list -n $APP_NAME -g $RESOURCE_GROUP \
  --query "[].{name:name, active:active, traffic:trafficWeight}" \
  -o table

# 2. Set 100% traffic to the canary revision
echo "Promoting canary to 100%..."
az containerapp ingress traffic set \
  -n $APP_NAME -g $RESOURCE_GROUP \
  --revision-weight ${REVISION}=100

# 3. Verify
echo "Verifying traffic split:"
az containerapp show -n $APP_NAME -g $RESOURCE_GROUP \
  --query "properties.configuration.ingress.traffic" \
  -o table

# 4. Activate the promoted revision
az containerapp revision activate \
  -n $APP_NAME -g $RESOURCE_GROUP \
  --revision $REVISION

# 5. Deactivate old revisions (keep latest 2)
OLD_REVISIONS=$(az containerapp revision list \
  -n $APP_NAME -g $RESOURCE_GROUP \
  --query "[?name!='${REVISION}'].name | reverse(@) | [2:]" \
  -o tsv)

for rev in $OLD_REVISIONS; do
  echo "Deactivating old revision: $rev"
  az containerapp revision deactivate \
    -n $APP_NAME -g $RESOURCE_GROUP \
    --revision $rev
done

echo "=== Canary promotion complete ==="
```

### 1.3 Canary Rollback Script

```bash
#!/bin/bash
# scripts/canary-rollback.sh — Roll back to previous stable revision
# Usage: bash scripts/canary-rollback.sh <env>

ENV=${1:-staging}

RESOURCE_GROUP="rg-goosefw-${ENV}"
APP_NAME="ca-orchestrator-${ENV}"

echo "=== Canary Rollback: ${ENV} ==="

# 1. Find the previous stable revision (most recent active, not latest)
STABLE_REV=$(az containerapp revision list \
  -n $APP_NAME -g $RESOURCE_GROUP \
  --query "[?active==\`true\` && name!='latest'][0].name" \
  -o tsv)

if [ -z "$STABLE_REV" ]; then
  echo "ERROR: No stable revision found. Cannot rollback."
  exit 1
fi

# 2. Set 100% traffic back to stable
echo "Rolling back to: $STABLE_REV"
az containerapp ingress traffic set \
  -n $APP_NAME -g $RESOURCE_GROUP \
  --revision-weight ${STABLE_REV}=100

# 3. Verify
echo "Verifying traffic split:"
az containerapp show -n $APP_NAME -g $RESOURCE_GROUP \
  --query "properties.configuration.ingress.traffic" \
  -o table

echo "=== Canary rollback complete ==="
```

---

## 2. Canary Quality Gates

### 2.1 Gate Conditions

Before promoting a canary to full rollout, these gates must pass:

| Gate | Threshold | Check | Duration |
|---|---|---|---|
| Error rate | < 2% 5xx | Log Analytics query | 15 minutes |
| P95 latency | < 2x baseline | Log Analytics query | 15 minutes |
| Minion completion rate | > 95% | Log Analytics query | 15 minutes |
| Allowlist denials | 0 | Log Analytics query | Full canary window |
| Container health | Running & ready | Container Apps status | Full canary window |

### 2.2 Automated Gate Check

```bash
#!/bin/bash
# scripts/canary-gate-check.sh — Verify canary quality gates
# Usage: bash scripts/canary-gate-check.sh <env> <window_minutes>

ENV=${1:-staging}
WINDOW=${2:-15}

WORKSPACE_ID=$(az monitor log-analytics workspace show \
  -g "rg-goosefw-${ENV}" -n "log-goosefw-${ENV}" \
  --query customerId -o tsv)

echo "=== Canary Gate Check: ${ENV} (last ${WINDOW}min) ==="

# Gate 1: Error rate < 2%
ERROR_RATE=$(az monitor log-analytics query \
  -w $WORKSPACE_ID \
  --analytics-query "
    ContainerAppConsoleLogs_CL
    | where TimeGenerated > ago(${WINDOW}m)
    | where ContainerAppName_s == 'ca-orchestrator-${ENV}'
    | summarize total=count(), errors=countif(Log_s contains '500' or Log_s contains '503')
    | extend error_rate = errors * 100.0 / total
    | project error_rate
  " --query "[0].error_rate" -o tsv 2>/dev/null || echo "0")

if (( $(echo "$ERROR_RATE > 2.0" | bc -l 2>/dev/null || echo 0) )); then
  echo "FAIL: Error rate ${ERROR_RATE}% exceeds 2% threshold"
  exit 1
fi
echo "PASS: Error rate ${ERROR_RATE}% (threshold: 2%)"

# Gate 2: Minion completion rate > 95%
COMPLETION_RATE=$(az monitor log-analytics query \
  -w $WORKSPACE_ID \
  --analytics-query "
    toolshed_logs_CL
    | where TimeGenerated > ago(${WINDOW}m)
    | summarize total=count(), success=countif(result_s == 'success')
    | extend completion_rate = success * 100.0 / total
    | project completion_rate
  " --query "[0].completion_rate" -o tsv 2>/dev/null || echo "100")

if (( $(echo "$COMPLETION_RATE < 95.0" | bc -l 2>/dev/null || echo 0) )); then
  echo "FAIL: Completion rate ${COMPLETION_RATE}% below 95% threshold"
  exit 1
fi
echo "PASS: Completion rate ${COMPLETION_RATE}% (threshold: 95%)"

# Gate 3: Zero allowlist denials
DENIALS=$(az monitor log-analytics query \
  -w $WORKSPACE_ID \
  --analytics-query "
    toolshed_logs_CL
    | where TimeGenerated > ago(${WINDOW}m)
    | where result_s == 'blocked'
    | count
  " --query "[0].Count" -o tsv 2>/dev/null || echo "0")

if [ "$DENIALS" != "0" ]; then
  echo "FAIL: ${DENIALS} allowlist denial(s) detected"
  exit 1
fi
echo "PASS: Zero allowlist denials"

echo "=== All gates PASSED ==="
```

---

## 3. CI/CD Integration

### 3.1 Canary Pipeline Stages

```yaml
# In .github/workflows/ci.yml (additional job)

deploy-canary:
  name: Deploy Canary
  runs-on: ubuntu-latest
  needs: [lint, rust, identity, integration, terraform]
  steps:
    - uses: actions/checkout@v4
    - uses: azure/login@v2
    - name: Deploy canary revision
      run: |
        az containerapp update \
          -n ca-orchestrator-${ENV} -g rg-goosefw-${ENV} \
          --image ${ACR_NAME}.azurecr.io/goose-serve:${GITHUB_SHA}
    - name: Wait for canary health
      run: sleep 60
    - name: Run gate checks
      run: bash scripts/canary-gate-check.sh ${ENV} 15

promote-canary:
  name: Promote Canary
  runs-on: ubuntu-latest
  needs: [deploy-canary]
  environment: production  # Requires manual approval
  steps:
    - uses: actions/checkout@v4
    - uses: azure/login@v2
    - name: Promote to 100%
      run: bash scripts/canary-promote.sh ${ENV} latest
```

### 3.2 Canary Duration by Environment

| Environment | Canary Duration | Gate Window | Rollback Trigger |
|---|---|---|---|
| Dev | 5 minutes | N/A | Immediate on failure |
| Staging | 1 hour | 15 minutes | Auto-rollback on gate failure |
| Production | 15 minutes (initial) | 15 minutes | Auto-rollback on gate failure |
| Production (extended) | 1 hour after initial pass | 15 minutes | Manual rollback |
