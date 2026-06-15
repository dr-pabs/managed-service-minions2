# ── Staging Environment ─────────────────────────────────────────────────────
# Terraform plan -var-file=environments/staging.tfvars

environment                = "staging"
location                   = "uksouth"
container_apps_environment = "Consumption"

# Warm replica in staging
orchestrator_replicas_min = 1
orchestrator_replicas_max = 3
orchestrator_cpu          = 1.0
orchestrator_memory       = "2Gi"

bot_cpu    = 0.5
bot_memory = "1Gi"

# AI Foundry — moderate capacity for staging
ai_foundry_sku = "Standard_F0"

model_deployments = {
  fast = {
    model_name    = "gpt-4o-mini"
    model_version = "2024-07-18"
    capacity      = 25
  }
  reasoning = {
    model_name    = "gpt-4o"
    model_version = "2024-08-06"
    capacity      = 50
  }
  code_review = {
    model_name    = "claude-sonnet-4-6"
    model_version = "2026-02-19"
    capacity      = 50
  }
  code_gen = {
    model_name    = "gpt-4o"
    model_version = "2024-08-06"
    capacity      = 50
  }
  security = {
    model_name    = "claude-sonnet-4-6"
    model_version = "2026-02-19"
    capacity      = 25
  }
}

log_retention_days = 31

# Container registry
acr_name  = "stgoosefwstaging"
image_tag = "latest"

ai_foundry_endpoint = "https://foundry-goosefw-staging.openai.azure.com"

tags = {
  project     = "goose-agent-framework"
  environment = "staging"
  managed_by  = "terraform"
  cost_center = "engineering"
}
