# ── Outputs ─────────────────────────────────────────────────────────────────
# Used by CI/CD pipeline to configure deployments and test connectivity.

output "resource_group_name" {
  description = "Resource group name"
  value       = azurerm_resource_group.main.name
}

output "orchestrator_fqdn" {
  description = "Orchestrator container app FQDN"
  value       = azurerm_container_app.orchestrator.latest_revision_fqdn
}

output "orchestrator_url" {
  description = "Orchestrator ACP endpoint"
  value       = "https://${azurerm_container_app.orchestrator.latest_revision_fqdn}:3284"
}

output "slack_bot_fqdn" {
  description = "Slack bot container app FQDN"
  value       = azurerm_container_app.slack_bot.latest_revision_fqdn
}

output "teams_bot_fqdn" {
  description = "Teams bot container app FQDN"
  value       = azurerm_container_app.teams_bot.latest_revision_fqdn
}

output "service_bus_namespace" {
  description = "Service Bus namespace FQDN"
  value       = "${azurerm_servicebus_namespace.main.name}.servicebus.windows.net"
}

output "service_bus_topic" {
  description = "Service Bus topic name"
  value       = azurerm_servicebus_topic.minion_tasks.name
}

output "service_bus_connection_string" {
  description = "Service Bus connection string (sensitive)"
  value       = azurerm_servicebus_namespace.main.default_primary_connection_string
  sensitive   = true
}

output "key_vault_uri" {
  description = "Key Vault URI"
  value       = azurerm_key_vault.main.vault_uri
}

output "storage_account_name" {
  description = "Storage account name"
  value       = azurerm_storage_account.main.name
}

output "storage_account_primary_blob_endpoint" {
  description = "Blob endpoint for SQLite backups"
  value       = azurerm_storage_account.main.primary_blob_endpoint
}

output "ai_foundry_endpoint" {
  description = "AI Foundry endpoint"
  value       = azurerm_ai_services.foundry.endpoint
}

output "ai_foundry_key" {
  description = "AI Foundry key (sensitive)"
  value       = azurerm_ai_services.foundry.primary_access_key
  sensitive   = true
}

output "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID"
  value       = azurerm_log_analytics_workspace.main.id
}

output "log_analytics_workspace_key" {
  description = "Log Analytics workspace key (sensitive)"
  value       = azurerm_log_analytics_workspace.main.primary_shared_key
  sensitive   = true
}

output "acr_pull_identity_client_id" {
  description = "Managed identity client ID for ACR pull"
  value       = azurerm_user_assigned_identity.acr_pull.client_id
}
