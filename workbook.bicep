@description('Name for the workbook')
param workbookName string = 'haic-observability'
@description('Location (must match Application Insights region)')
param location string = resourceGroup().location
@description('Workbook display name')
param displayName string = 'HumanAI Convention Observability'
@description('Serialized workbook JSON content')
param workbookContent string

resource workbook 'microsoft.insights/workbooks@2022-04-01' = {
  name: workbookName
  location: location
  kind: 'shared'
  properties: {
    displayName: displayName
    serializedData: workbookContent
    version: '1.0'
    sourceId: ''
    category: 'workbook'
  }
}

output workbookId string = workbook.id