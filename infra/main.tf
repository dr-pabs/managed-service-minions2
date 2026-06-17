# ── Resource Naming ─────────────────────────────────────────────────────────

locals {
  rg_name = "rg-${var.naming_prefix}-${var.environment}"
  env     = var.environment

  # Scale-to-zero in dev, warm in staging, always-on in prod
  scale_config = {
    dev     = { min = 0, max = var.orchestrator_replicas_max }
    staging = { min = 1, max = var.orchestrator_replicas_max }
    prod    = { min = 1, max = var.orchestrator_replicas_max }
  }
}

# ── Resource Group ──────────────────────────────────────────────────────────

resource "azurerm_resource_group" "main" {
  name     = local.rg_name
  location = var.location
  tags     = var.tags
}

# ── Log Analytics Workspace ─────────────────────────────────────────────────

resource "azurerm_log_analytics_workspace" "main" {
  name                = "la-${var.naming_prefix}-${local.env}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = var.log_retention_days
  tags                = var.tags
}

# ── Container Apps Environment ──────────────────────────────────────────────

resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${var.naming_prefix}-${local.env}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  tags                       = var.tags

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}

# ── Container Registry ──────────────────────────────────────────────────────

resource "azurerm_container_registry" "main" {
  # ACR names must be globally unique, alphanumeric only, 5-50 chars
  name                = replace("acr${var.naming_prefix}${local.env}", "-", "")
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = false
  tags                = var.tags
}

# ── User-Assigned Managed Identity ─────────────────────────────────────────

resource "azurerm_user_assigned_identity" "acr_pull" {
  name                = "id-acr-pull-${var.naming_prefix}-${local.env}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = var.tags
}

# Grant the managed identity permission to pull images from ACR
resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.acr_pull.principal_id
}

# ── Key Vault ───────────────────────────────────────────────────────────────

resource "azurerm_key_vault" "main" {
  name                       = "kv-${var.naming_prefix}-${local.env}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 7
  tags                       = var.tags
}

data "azurerm_client_config" "current" {}

# Grant the managed identity permission to read secrets from Key Vault
resource "azurerm_role_assignment" "kv_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.acr_pull.principal_id
}

# ── Key Vault Secrets ────────────────────────────────────────────────────────
# Populated from sensitive variables supplied at terraform apply time.
# Never commit actual secret values to variables.tf or .tfvars files.

resource "azurerm_key_vault_secret" "goose_server_key" {
  name         = "goose-server-secret-key"
  value        = var.goose_server_secret_key
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_secrets_user]
}

resource "azurerm_key_vault_secret" "slack_bot_token" {
  name         = "slack-bot-token"
  value        = var.slack_bot_token
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_secrets_user]
}

resource "azurerm_key_vault_secret" "slack_signing_secret" {
  name         = "slack-signing-secret"
  value        = var.slack_signing_secret
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_secrets_user]
}

resource "azurerm_key_vault_secret" "slack_app_token" {
  name         = "slack-app-token"
  value        = var.slack_app_token
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_secrets_user]
}

resource "azurerm_key_vault_secret" "teams_client_id" {
  name         = "teams-azure-ad-client-id"
  value        = var.teams_client_id
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_secrets_user]
}

resource "azurerm_key_vault_secret" "teams_tenant_id" {
  name         = "teams-azure-ad-tenant-id"
  value        = var.teams_tenant_id
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_secrets_user]
}

resource "azurerm_key_vault_secret" "teams_client_secret" {
  name         = "teams-azure-ad-client-secret"
  value        = var.teams_client_secret
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_secrets_user]
}

# ── Container App: Orchestrator (Goose Serve) ───────────────────────────────

resource "azurerm_container_app" "orchestrator" {
  name                         = "ca-orchestrator-${local.env}"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.acr_pull.id]
  }

  secret {
    name                = "goose-server-secret-key"
    key_vault_secret_id = azurerm_key_vault_secret.goose_server_key.id
    identity            = azurerm_user_assigned_identity.acr_pull.id
  }

  template {
    min_replicas = local.scale_config[local.env].min
    max_replicas = local.scale_config[local.env].max

    container {
      name   = "goose-serve"
      image  = "${azurerm_container_registry.main.login_server}/goose-serve:${var.image_tag}"
      cpu    = var.orchestrator_cpu
      memory = var.orchestrator_memory

      env {
        name        = "GOOSE_SERVER__SECRET_KEY"
        secret_name = "goose-server-secret-key"
      }
      env {
        name  = "GOOSE_PROVIDER"
        value = "azure_openai"
      }
      env {
        name  = "AZURE_OPENAI_ENDPOINT"
        value = var.ai_foundry_endpoint
      }
      env {
        name  = "GOOSE_CORRELATION_ID_PREFIX"
        value = "corr_${local.env}"
      }
    }
  }

  ingress {
    allow_insecure_connections = false
    external_enabled           = true
    target_port                = 3284
    transport                  = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.acr_pull.id
  }
}

# ── Container App: Slack Bot ACP Client ─────────────────────────────────────

resource "azurerm_container_app" "slack_bot" {
  name                         = "ca-slackbot-${local.env}"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.acr_pull.id]
  }

  secret {
    name                = "goose-server-secret-key"
    key_vault_secret_id = azurerm_key_vault_secret.goose_server_key.id
    identity            = azurerm_user_assigned_identity.acr_pull.id
  }
  secret {
    name                = "slack-bot-token"
    key_vault_secret_id = azurerm_key_vault_secret.slack_bot_token.id
    identity            = azurerm_user_assigned_identity.acr_pull.id
  }
  secret {
    name                = "slack-signing-secret"
    key_vault_secret_id = azurerm_key_vault_secret.slack_signing_secret.id
    identity            = azurerm_user_assigned_identity.acr_pull.id
  }
  secret {
    name                = "slack-app-token"
    key_vault_secret_id = azurerm_key_vault_secret.slack_app_token.id
    identity            = azurerm_user_assigned_identity.acr_pull.id
  }

  template {
    container {
      name   = "slack-bot"
      image  = "${azurerm_container_registry.main.login_server}/slack-bot:${var.image_tag}"
      cpu    = var.bot_cpu
      memory = var.bot_memory

      env {
        name  = "GOOSE_SERVE_URL"
        value = "https://${azurerm_container_app.orchestrator.latest_revision_fqdn}"
      }
      env {
        name        = "GOOSE_SERVER__SECRET_KEY"
        secret_name = "goose-server-secret-key"
      }
      env {
        name        = "SLACK_BOT_TOKEN"
        secret_name = "slack-bot-token"
      }
      env {
        name        = "SLACK_SIGNING_SECRET"
        secret_name = "slack-signing-secret"
      }
      env {
        name        = "SLACK_APP_TOKEN"
        secret_name = "slack-app-token"
      }
    }
  }

  ingress {
    allow_insecure_connections = false
    external_enabled           = true
    target_port                = 3000
    transport                  = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.acr_pull.id
  }
}

# ── Container App: Teams Bot ACP Client ─────────────────────────────────────

resource "azurerm_container_app" "teams_bot" {
  name                         = "ca-teamsbot-${local.env}"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.acr_pull.id]
  }

  secret {
    name                = "goose-server-secret-key"
    key_vault_secret_id = azurerm_key_vault_secret.goose_server_key.id
    identity            = azurerm_user_assigned_identity.acr_pull.id
  }
  secret {
    name                = "teams-azure-ad-client-id"
    key_vault_secret_id = azurerm_key_vault_secret.teams_client_id.id
    identity            = azurerm_user_assigned_identity.acr_pull.id
  }
  secret {
    name                = "teams-azure-ad-tenant-id"
    key_vault_secret_id = azurerm_key_vault_secret.teams_tenant_id.id
    identity            = azurerm_user_assigned_identity.acr_pull.id
  }
  secret {
    name                = "teams-azure-ad-client-secret"
    key_vault_secret_id = azurerm_key_vault_secret.teams_client_secret.id
    identity            = azurerm_user_assigned_identity.acr_pull.id
  }

  template {
    container {
      name   = "teams-bot"
      image  = "${azurerm_container_registry.main.login_server}/teams-bot:${var.image_tag}"
      cpu    = var.bot_cpu
      memory = var.bot_memory

      env {
        name  = "GOOSE_SERVE_URL"
        value = "https://${azurerm_container_app.orchestrator.latest_revision_fqdn}"
      }
      env {
        name        = "GOOSE_SERVER__SECRET_KEY"
        secret_name = "goose-server-secret-key"
      }
      env {
        name        = "AZURE_AD_CLIENT_ID"
        secret_name = "teams-azure-ad-client-id"
      }
      env {
        name        = "AZURE_AD_TENANT_ID"
        secret_name = "teams-azure-ad-tenant-id"
      }
      env {
        name        = "AZURE_AD_CLIENT_SECRET"
        secret_name = "teams-azure-ad-client-secret"
      }
    }
  }

  ingress {
    allow_insecure_connections = false
    external_enabled           = true
    target_port                = 3000
    transport                  = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.acr_pull.id
  }
}

# ── Service Bus Namespace ───────────────────────────────────────────────────

resource "azurerm_servicebus_namespace" "main" {
  name                = "sb-${var.naming_prefix}-${local.env}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = var.service_bus_sku
  tags                = var.tags
}

resource "azurerm_servicebus_topic" "minion_tasks" {
  name         = "minion-tasks"
  namespace_id = azurerm_servicebus_namespace.main.id
}

resource "azurerm_servicebus_subscription" "minions" {
  for_each = toset(var.minion_types)

  name               = each.key
  topic_id           = azurerm_servicebus_topic.minion_tasks.id
  max_delivery_count = 3

  # Filter: route to correct minion by correlation property
  client_scoped_subscription_enabled = false
}

resource "azurerm_servicebus_subscription_rule" "minion_filter" {
  for_each = toset(var.minion_types)

  name            = "${each.key}-filter"
  subscription_id = azurerm_servicebus_subscription.minions[each.key].id
  filter_type     = "CorrelationFilter"

  correlation_filter {
    properties = {
      minion_type = each.key
    }
  }
}

# ── Storage Account ─────────────────────────────────────────────────────────

resource "azurerm_storage_account" "main" {
  name                     = "st${var.naming_prefix}${local.env}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "ZRS"
  tags                     = var.tags
}

resource "azurerm_storage_container" "sqlite_backups" {
  name                  = "sqlite-backups"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

resource "azurerm_storage_table" "audit_logs" {
  name                 = "auditlogs"
  storage_account_name = azurerm_storage_account.main.name
}

# ── AI Foundry Hub ──────────────────────────────────────────────────────────

resource "azurerm_cognitive_account" "foundry" {
  name                = "foundry-${var.naming_prefix}-${local.env}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  kind                = "AIServices"
  sku_name            = var.ai_foundry_sku
  tags                = var.tags
}

# ── AI Foundry Model Deployments ────────────────────────────────────────────

resource "azurerm_cognitive_deployment" "models" {
  for_each = var.model_deployments

  name                 = each.key
  cognitive_account_id = azurerm_cognitive_account.foundry.id

  model {
    format  = "OpenAI"
    name    = each.value.model_name
    version = each.value.model_version
  }

  sku {
    name     = "Standard"
    capacity = each.value.capacity
  }
}
