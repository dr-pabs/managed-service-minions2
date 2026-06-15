# Infrastructure Tests — Terratest
# Validates Azure resources after Terraform apply.
#
# Run:
#   cd infra/tests && go test -v -timeout 30m

package test

import (
    "context"
    "fmt"
    "testing"
    "time"

    "github.com/Azure/azure-sdk-for-go/sdk/azidentity"
    "github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armresources"
    "github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/servicebus/armservicebus"
    "github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/storage/armstorage"
    "github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/keyvault/armkeyvault"
    "github.com/gruntwork-io/terratest/modules/terraform"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

var (
    subscriptionID = getEnv("ARM_SUBSCRIPTION_ID", "")
    resourceGroup  = getEnv("TF_VAR_resource_group_name", "rg-goosefw-dev")
    location       = getEnv("TF_VAR_location", "uksouth")
)

func getEnv(key, fallback string) string {
    if v := getenv(key); v != "" {
        return v
    }
    return fallback
}

// ── Resource Group Exists ───────────────────────────────────────────────────

func TestResourceGroupExists(t *testing.T) {
    t.Parallel()

    cred, err := azidentity.NewDefaultAzureCredential(nil)
    require.NoError(t, err)

    client, err := armresources.NewResourceGroupsClient(subscriptionID, cred, nil)
    require.NoError(t, err)

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    resp, err := client.Get(ctx, resourceGroup, nil)
    require.NoError(t, err)

    assert.Equal(t, resourceGroup, *resp.Name)
    assert.Equal(t, location, *resp.Location)
}

// ── Service Bus Topic and Subscriptions Exist ───────────────────────────────

func TestServiceBusResourcesExist(t *testing.T) {
    t.Parallel()

    cred, err := azidentity.NewDefaultAzureCredential(nil)
    require.NoError(t, err)

    namespaceName := "sb-goosefw-dev"
    client, err := armservicebus.NewNamespacesClient(subscriptionID, cred, nil)
    require.NoError(t, err)

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    _, err = client.Get(ctx, resourceGroup, namespaceName, nil)
    require.NoError(t, err, "Service Bus namespace should exist")
}

// ── Service Bus Subscriptions Match Minion Types ────────────────────────────

func TestServiceBusMinionSubscriptions(t *testing.T) {
    t.Parallel()

    cred, err := azidentity.NewDefaultAzureCredential(nil)
    require.NoError(t, err)

    namespaceName := "sb-goosefw-dev"
    topicName := "minion-tasks"
    minionTypes := []string{
        "code-explorer", "code-reviewer", "pr-crafter",
        "ticket-analyst", "security-auditor",
    }

    client, err := armservicebus.NewSubscriptionsClient(subscriptionID, cred, nil)
    require.NoError(t, err)

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    for _, minion := range minionTypes {
        t.Run(fmt.Sprintf("subscription_%s", minion), func(t *testing.T) {
            resp, err := client.Get(ctx, resourceGroup, namespaceName, topicName, minion, nil)
            require.NoError(t, err)
            assert.Equal(t, minion, *resp.Name)
        })
    }
}

// ── Storage Account Exists ──────────────────────────────────────────────────

func TestStorageAccountExists(t *testing.T) {
    t.Parallel()

    cred, err := azidentity.NewDefaultAzureCredential(nil)
    require.NoError(t, err)

    accountName := "stgoosefwdev"
    client, err := armstorage.NewAccountsClient(subscriptionID, cred, nil)
    require.NoError(t, err)

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    resp, err := client.GetProperties(ctx, resourceGroup, accountName, nil)
    require.NoError(t, err)
    assert.Equal(t, accountName, *resp.Name)
}

// ── Key Vault Exists ────────────────────────────────────────────────────────

func TestKeyVaultExists(t *testing.T) {
    t.Parallel()

    cred, err := azidentity.NewDefaultAzureCredential(nil)
    require.NoError(t, err)

    vaultName := "kv-goosefw-dev"
    client, err := armkeyvault.NewVaultsClient(subscriptionID, cred, nil)
    require.NoError(t, err)

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    resp, err := client.Get(ctx, resourceGroup, vaultName, nil)
    require.NoError(t, err)
    assert.Equal(t, vaultName, *resp.Name)
}

// ── Terraform Plan is Clean After Apply ─────────────────────────────────────

func TestTerraformPlanIsClean(t *testing.T) {
    t.Parallel()

    terraformOptions := &terraform.Options{
        TerraformDir: "../",
        VarFiles:     []string{"environments/dev.tfvars"},
        NoColor:      true,
    }

    // Init first (idempotent)
    terraform.Init(t, terraformOptions)

    // Plan should show no changes after apply
    plan := terraform.Plan(t, terraformOptions)

    // Resource count should be stable
    assert.Contains(t, plan, "No changes.")
}
