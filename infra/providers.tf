# Goose Agent Framework — Terraform Configuration
# Deploys the full Azure infrastructure: Container Apps, Service Bus, Storage, Key Vault,
# AI Foundry, Log Analytics, and networking with private endpoints.
#
# Usage:
#   terraform init
#   terraform plan  -var-file=environments/dev.tfvars
#   terraform apply -var-file=environments/dev.tfvars

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  backend "azurerm" {
    resource_group_name  = "rg-goosefw-tfstate"
    storage_account_name = "stgoosefwtfstate"
    container_name       = "tfstate"
    key                  = "goose-framework.tfstate"
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy = false
    }
  }
}

provider "random" {}
