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

# ── Container App: Orchestrator (Goose Serve) ───────────────────────────────

resource "azurerm_container_app" "orchestrator" {
  name                         = "ca-orchestrator-${local.env}"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  tags                         = var.tags

  template {
    container {
      name   = "goose-serve"
      image  = "${var.acr_name}.azurecr.io/goose-serve:${var.image_tag}"
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
    server   = "${var.acr_name}.azurecr.io"
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

  template {
    container {
      name   = "slack-bot"
      image  = "${var.acr_name}.azurecr.io/slack-bot:${var.image_tag}"
      cpu    = var.bot_cpu
      memory = var.bot_memory

      env {
        name  = "GOOSE_SERVE_URL"
        value = "https://${azurerm_container_app.orchestrator.latest_revision_fqdn}:3284"
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
    server   = "${var.acr_name}.azurecr.io"
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

  template {
    container {
      name   = "teams-bot"
      image  = "${var.acr_name}.azurecr.io/teams-bot:${var.image_tag}"
      cpu    = var.bot_cpu
      memory = var.bot_memory

      env {
        name  = "GOOSE_SERVE_URL"
        value = "https://${azurerm_container_app.orchestrator.latest_revision_fqdn}:3284"
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
    server   = "${var.acr_name}.azurecr.io"
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

# ── User-Assigned Managed Identity for ACR pull ─────────────────────────────

resource "azurerm_user_assigned_identity" "acr_pull" {
  name                = "id-acr-pull-${var.naming_prefix}-${local.env}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = var.tags
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
