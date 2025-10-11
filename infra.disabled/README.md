Infra: Cognitive Services account + Model Deployment (Bicep)

This folder contains a Bicep template to create (or use) an Azure Cognitive Services account and deploy a model to it as a model deployment child resource.

Files
- cognitive_services_deployment.bicep - Bicep template. Parameterized for account name, SKU, capacity, model name/version/format and deployment name.
- parameters.example.json - Example parameter values you can copy and edit.

High-level notes and best practices
- This template creates a Microsoft.CognitiveServices/accounts resource of kind OpenAI and a modelDeployments child resource. Verify API versions and the child resource name path for your Azure subscription; these APIs evolve.
- Security: For production consider enabling private endpoints and disabling public network access, and use Managed Identity and Key Vault to store keys/secrets. Avoid hardcoding credentials.
- Quotas & region: Before deploying, validate that the chosen skuName (e.g., GlobalStandard) and skuCapacity are available in your subscription and region.

Parameters
- accountName (string) - Name of the Cognitive Services account.
- location (string) - Azure region (defaults to resource group's location).
- skuName (string) - SKU of the account (example: GlobalStandard).
- skuCapacity (int) - Capacity/instance count.
- modelName, modelVersion, modelFormat - Model identification details.
- deploymentName - Name of the model deployment under the account.

How to run (what-if then create)

1) Copy the example parameter file and edit values if needed: copy parameters.example.json to parameters.json and edit.

2) Run az deployment group what-if to preview changes (recommended).

3) If the what-if looks good, run az deployment group create to create the resources.

Post-deploy
- After deployment, get the Cognitive Services account resource id and the deployment child resource id from the outputs or via az rest/az cognitiveservices account show.
- Validate that the model deployment is in the Succeeded provisioning state.

Troubleshooting
- If the API schema for modelDeployments returns errors, consult the latest ARM schema or use az rest / az cognitiveservices account deployment create to submit the model deployment. The child resource path has seen frequent updates across SDK/CLI versions.

If you want, I can:
- Run quota/region checks for the subscription (requires permission to query your subscription) before you run the what-if.
- Update the Bicep template to create private endpoints or configure diagnostic settings.
- Convert this to an ARM or Terraform template instead.
This folder contains the preserved infra artifacts from the `infra/` directory.

Files were moved here to prevent accidental automatic deployments. To re-enable, review contents and move back to `infra/`.

Files included:
- cognitive_services_deployment.bicep
- parameters.example.json
- parameters.json

NOTE: Do not re-enable or run these templates unless you have verified subscription, billing, and credentials.
