# Infra: Cognitive Services account + Model Deployment (Bicep)

This folder contains a Bicep template to create (or use) an Azure Cognitive Services account and deploy a model to it as a model deployment child resource.

Files
- `cognitive_services_deployment.bicep` - Bicep template. Parameterized for account name, SKU, capacity, model name/version/format and deployment name.
- `parameters.example.json` - Example parameter values you can copy and edit.

High-level notes and best practices
- This template creates a `Microsoft.CognitiveServices/accounts` resource of kind `OpenAI` and a `modelDeployments` child resource. Verify API versions and the child resource name path for your Azure subscription; these APIs evolve.
- Security: For production consider enabling private endpoints and disabling public network access, and use Managed Identity and Key Vault to store keys/secrets. Avoid hardcoding credentials.
- Quotas & region: Before deploying, validate that the chosen `skuName` (e.g., `GlobalStandard`) and `skuCapacity` are available in your subscription and region.

Parameters
- `accountName` (string) - Name of the Cognitive Services account.
- `location` (string) - Azure region (defaults to resource group's location).
- `skuName` (string) - SKU of the account (example: `GlobalStandard`).
- `skuCapacity` (int) - Capacity/instance count.
- `modelName`, `modelVersion`, `modelFormat` - Model identification details.
- `deploymentName` - Name of the model deployment under the account.

How to run (what-if then create)

1) Copy the example parameter file and edit values if needed:

   - `infra/parameters.example.json` -> `infra/parameters.json`

2) Run `az deployment group what-if` to preview changes (recommended):

```powershell
# Set subscription (use your subscription id)
az account set --subscription 7830d0c1-0176-4329-9cc2-1857319741aa

# Preview deployment changes
az deployment group what-if \
  --resource-group <your-resource-group> \
  --name cs-model-deploy-whatif \
  --template-file infra/cognitive_services_deployment.bicep \
  --parameters @infra/parameters.json
```

3) If the what-if looks good, create the deployment:

```powershell
# Create (this will create the Cognitive Services account if it does not exist, and the model deployment)
az deployment group create \
  --resource-group <your-resource-group> \
  --name cs-model-deploy \
  --template-file infra/cognitive_services_deployment.bicep \
  --parameters @infra/parameters.json
```

Post-deploy
- After deployment, get the Cognitive Services account resource id and the deployment child resource id from the outputs or via `az rest`/`az cognitiveservices account show`.
- Validate that the model deployment is in the `Succeeded` provisioning state.

Troubleshooting
- If the API schema for `modelDeployments` returns errors, you may need to consult the latest ARM schema or use `az rest` / `az cognitiveservices account deployment create` to submit the model deployment. The child resource path has seen frequent updates across SDK/CLI versions.

If you want, I can:
- Run quota/region checks for the subscription (requires permission to query your subscription) before you run the what-if.
- Update the Bicep template to create private endpoints or configure diagnostic settings.
- Convert this to an ARM or Terraform template instead.
