# ── Dev Environment ─────────────────────────────────────────────────────────
# Terraform plan -var-file=environments/dev.tfvars

environment                = "dev"
location                   = "uksouth"
container_apps_environment = "Consumption"

# Scale to zero in dev
orchestrator_replicas_min = 0
orchestrator_replicas_max = 2
orchestrator_cpu          = 0.5
orchestrator_memory       = "1Gi"

bot_cpu    = 0.25
bot_memory = "0.5Gi"

# AI Foundry — minimal capacity for dev
ai_foundry_sku = "Standard_F0"

model_deployments = {
  fast = {
    model_name    = "gpt-4o-mini"
    model_version = "2024-07-18"
    capacity      = 10
  }
  reasoning = {
    model_name    = "gpt-4o"
    model_version = "2024-08-06"
    capacity      = 10
  }
  code_review = {
    model_name    = "claude-sonnet-4-6"
    model_version = "2026-02-19"
    capacity      = 10
  }
  code_gen = {
    model_name    = "gpt-4o"
    model_version = "2024-08-06"
    capacity      = 10
  }
  security = {
    model_name    = "claude-sonnet-4-6"
    model_version = "2026-02-19"
    capacity      = 10
  }
}

log_retention_days = 7

# Container registry
acr_name  = "stgoosefwdev"
image_tag = "latest"

# AI Foundry endpoint (set at plan time or via env)
ai_foundry_endpoint = "https://foundry-goosefw-dev.openai.azure.com"

tags = {
  project     = "goose-agent-framework"
  environment = "dev"
  managed_by  = "terraform"
  cost_center = "engineering"
}
