# ── Production Environment ──────────────────────────────────────────────────
# Terraform plan -var-file=environments/prod.tfvars

environment          = "prod"
location             = "uksouth"
container_apps_environment = "Consumption"

# Always-on in production
orchestrator_replicas_min = 1
orchestrator_replicas_max = 5
orchestrator_cpu          = 1.0
orchestrator_memory       = "2Gi"

bot_cpu    = 0.5
bot_memory = "1Gi"

# AI Foundry — full capacity for production
ai_foundry_sku = "Standard_S0"

model_deployments = {
  fast = {
    model_name    = "gpt-4o-mini"
    model_version = "2024-07-18"
    capacity      = 50
  }
  reasoning = {
    model_name    = "gpt-4o"
    model_version = "2024-08-06"
    capacity      = 200
  }
  code_review = {
    model_name    = "claude-sonnet-4-6"
    model_version = "2026-02-19"
    capacity      = 100
  }
  code_gen = {
    model_name    = "gpt-4o"
    model_version = "2024-08-06"
    capacity      = 100
  }
  security = {
    model_name    = "claude-sonnet-4-6"
    model_version = "2026-02-19"
    capacity      = 50
  }
}

log_retention_days = 31

# Container registry
acr_name   = "stgoosefwprod"
image_tag  = "latest"

ai_foundry_endpoint = "https://foundry-goosefw-prod.openai.azure.com"

tags = {
  project     = "goose-agent-framework"
  environment = "prod"
  managed_by  = "terraform"
  cost_center = "engineering"
}
