@description('Name of the Cognitive Services account to create or use')
param accountName string

@description('Location for the Cognitive Services account')
param location string = resourceGroup().location

@description('SKU name for the Cognitive Services account, e.g., GlobalStandard, S0, F0')
param skuName string = 'GlobalStandard'

@description('SKU capacity (instance count)')
param skuCapacity int = 1

@description('The model name to deploy (e.g., gpt-oss-120b)')
param modelName string

@description('Model version string')
param modelVersion string = '1'

@description('Model format, e.g., OpenAI-OSS')
param modelFormat string = 'OpenAI-OSS'

@description('Deployment name for the model')
param deploymentName string

@description('Optional: additional model-specific settings (left as object for extensibility)')
param modelSettings object = {}

// When possible, prefer using existing Cognitive Services account. This template will create one if it does not exist.
// Use a supported API version for Cognitive Services. Updated from 2024-04-01 to 2024-10-01 which
// is listed among supported API versions in the subscription. If Azure returns schema errors,
// try a later preview version such as 2025-06-01.
resource cognitiveAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' = if (empty(accountName) == false) {
  name: accountName
  location: location
  sku: {
    name: skuName
    capacity: skuCapacity
  }
  kind: 'OpenAI'
  properties: {
    // Enable public network access by default; in production consider private endpoints and VNet injection
    publicNetworkAccess: 'Enabled'
    // Disable or enable specific features here if required
  }
}

// Model deployment subresource. Use parent property so the Bicep linter recognizes the relationship.
resource modelDeployment 'Microsoft.CognitiveServices/accounts/modelDeployments@2024-10-01' = {
  parent: cognitiveAccount
  name: deploymentName
  properties: {
    model: {
      name: modelName
      version: modelVersion
      format: modelFormat
    }
    modelSettings: modelSettings
  }
}

output cognitiveAccountId string = cognitiveAccount.id
output modelDeploymentId string = modelDeployment.id
