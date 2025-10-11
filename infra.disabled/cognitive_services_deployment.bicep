@description('Name of the Cognitive Services account to create or use')
@param accountName string
@description('Location for the Cognitive Services account')
@param location string = resourceGroup().location
@description('SKU name for the Cognitive Services account, e.g., GlobalStandard, S0, F0')
@param skuName string = 'S0'

// When possible, prefer using existing Cognitive Services account. This template will create one if it does not exist.
resource cognitiveAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' = if (empty(accountName) == false) {
  name: accountName
  location: location
  sku: {
    name: skuName
  }
  kind: 'OpenAI'
}

// Model deployment subresource. Use parent property so the Bicep linter recognizes the relationship.
resource modelDeployment 'Microsoft.CognitiveServices/accounts/modelDeployments@2024-10-01' = {
  parent: cognitiveAccount
  name: 'example-deployment'
  properties: {
    model: 'gpt-5'
    scaleSettings: {
      scaleType: 'Standard'
    }
  }
}

output cognitiveAccountId string = cognitiveAccount.id
