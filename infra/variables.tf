# ── Variables ────────────────────────────────────────────────────────────────

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "uksouth"
}

variable "container_apps_environment" {
  description = "Container Apps Environment type (Consumption or Workload Profiles)"
  type        = string
  default     = "Consumption"
}

# ── Naming ───────────────────────────────────────────────────────────────────

variable "naming_prefix" {
  description = "Prefix for all resource names"
  type        = string
  default     = "goosefw"
}

# ── Networking ───────────────────────────────────────────────────────────────

variable "vnet_address_space" {
  description = "Address space for the VNet"
  type        = list(string)
  default     = ["10.0.0.0/16"]
}

variable "subnet_container_apps" {
  description = "Address prefix for Container Apps subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "subnet_private_endpoints" {
  description = "Address prefix for Private Endpoints subnet"
  type        = string
  default     = "10.0.2.0/24"
}

# ── Container Apps ───────────────────────────────────────────────────────────

variable "orchestrator_replicas_min" {
  description = "Min orchestrator replicas"
  type        = number
  default     = 1
}

variable "orchestrator_replicas_max" {
  description = "Max orchestrator replicas"
  type        = number
  default     = 5
}

variable "orchestrator_cpu" {
  description = "Orchestrator CPU (vCPU)"
  type        = number
  default     = 1.0
}

variable "orchestrator_memory" {
  description = "Orchestrator memory (GB)"
  type        = string
  default     = "2Gi"
}

variable "bot_cpu" {
  description = "Bot adapter CPU (vCPU)"
  type        = number
  default     = 0.5
}

variable "bot_memory" {
  description = "Bot adapter memory (GB)"
  type        = string
  default     = "1Gi"
}

# ── Service Bus ──────────────────────────────────────────────────────────────

variable "service_bus_sku" {
  description = "Service Bus tier"
  type        = string
  default     = "Standard"
}

variable "minion_types" {
  description = "Minion subscription names"
  type        = list(string)
  default     = ["code-explorer", "code-reviewer", "pr-crafter", "ticket-analyst", "security-auditor"]
}

# ── AI Foundry ──────────────────────────────────────────────────────────────

variable "ai_foundry_sku" {
  description = "AI Foundry Hub SKU"
  type        = string
  default     = "Standard_F0"
}

variable "model_deployments" {
  description = "Model deployment tiers"
  type = map(object({
    model_name    = string
    model_version = string
    capacity      = number
  }))
  default = {
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
}

# ── Container Registry ──────────────────────────────────────────────────────

variable "acr_name" {
  description = "Azure Container Registry name"
  type        = string
  default     = "stgoosefwdev"
}

variable "image_tag" {
  description = "Docker image tag for container apps"
  type        = string
  default     = "latest"
}

# ── AI Foundry ──────────────────────────────────────────────────────────────

variable "ai_foundry_endpoint" {
  description = "AI Foundry endpoint URL"
  type        = string
  default     = ""
}

# ── Log Analytics ────────────────────────────────────────────────────────────

variable "log_retention_days" {
  description = "Log Analytics retention in days"
  type        = number
  default     = 31
}

# ── Tags ─────────────────────────────────────────────────────────────────────

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default = {
    project    = "goose-agent-framework"
    managed_by = "terraform"
  }
}
