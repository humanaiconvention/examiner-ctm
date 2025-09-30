@description('Application Insights resource id')
param appInsightsId string

@description('Action group resource id for alert notifications')
param actionGroupId string

@description('Region')
param location string = resourceGroup().location

@description('Alert name prefix')
param alertPrefix string = 'haic'

// LCP p75 above threshold (ms)
@description('LCP p75 threshold in ms')
param lcpP75Threshold int = 2500

// Fetch dependency failure rate threshold (0-1)
@description('Failure rate threshold')
param fetchFailureThreshold float = 0.05

@description('INP p75 threshold in ms')
param inpP75Threshold int = 400

// Shared schedule (every 5 minutes, lookback 15 min)
var evaluationFrequency = 'PT5M'
var windowSize = 'PT15M'

var aiMetricsNamespace = 'microsoft.insights/components'

resource ai 'Microsoft.Insights/components@2022-06-15' existing = {
  scope: appInsightsId
  name: last(split(appInsightsId, '/'))
}

// Alert 1: LCP p75 (custom event perf_metric filtering metric == LCP)
resource lcpAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01-preview' = {
  name: '${alertPrefix}-lcp-p75'
  location: location
  tags: {
    'haic.observability': 'true'
    'haic.metric': 'lcp-p75'
  }
  properties: {
    enabled: 'true'
    displayName: 'LCP p75 exceeds ${lcpP75Threshold}ms'
    description: 'Web Vitals LCP 75th percentile above threshold'
    evaluationFrequency: evaluationFrequency
    severity: 3
    windowSize: windowSize
    scopes: [ appInsightsId ]
    autoMitigate: true
    actionGroups: [{ actionGroupId: actionGroupId }]
    criteria: {
      allOf: [
        {
          query: '''customEvents
| where name == "perf_metric" and tostring(customDimensions.metric) == "LCP"
| extend value = todouble(customDimensions.value)
| summarize p75=percentile(value,75)'''
          timeAggregation: 'Average'
          operator: 'GreaterThan'
          threshold: lcpP75Threshold
          name: 'LcpP75Criterion'
          dimensions: []
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
  }
}

// Alert 2: Fetch dependency failure rate
resource fetchFailAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01-preview' = {
  name: '${alertPrefix}-fetch-fail-rate'
  location: location
  tags: {
    'haic.observability': 'true'
    'haic.metric': 'fetch-fail-rate'
  }
  properties: {
    enabled: 'true'
    displayName: 'Fetch dependency failure rate > ${fetchFailureThreshold * 100}%' 
    description: 'Failure rate over rolling window'
    evaluationFrequency: evaluationFrequency
    severity: 3
    windowSize: windowSize
    scopes: [ appInsightsId ]
    autoMitigate: true
    actionGroups: [{ actionGroupId: actionGroupId }]
    criteria: {
      allOf: [
        {
          query: '''customEvents
| where name == "fetch_dependency"
| extend status = toint(tostring(customDimensions.status)), err = tostring(customDimensions.error)
| summarize success = countif(isnotempty(status) and status < 400), failures = countif(isnotempty(err) or status >= 400)
| extend failureRate = failures * 1.0 / (success + failures)
| summarize failureRate = avg(failureRate)'''
          timeAggregation: 'Average'
          operator: 'GreaterThan'
          threshold: fetchFailureThreshold
          name: 'FetchFailureRateCriterion'
          dimensions: []
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
  }
}

// Alert 3: INP p75
resource inpAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01-preview' = {
  name: '${alertPrefix}-inp-p75'
  location: location
  tags: {
    'haic.observability': 'true'
    'haic.metric': 'inp-p75'
  }
  properties: {
    enabled: 'true'
    displayName: 'INP p75 exceeds ${inpP75Threshold}ms'
    description: 'Interaction to Next Paint 75th percentile above threshold'
    evaluationFrequency: evaluationFrequency
    severity: 3
    windowSize: windowSize
    scopes: [ appInsightsId ]
    autoMitigate: true
    actionGroups: [{ actionGroupId: actionGroupId }]
    criteria: {
      allOf: [
        {
          query: '''customEvents
| where name == "perf_metric" and tostring(customDimensions.metric) == "INP"
| extend value = todouble(customDimensions.value)
| summarize p75=percentile(value,75)'''
          timeAggregation: 'Average'
          operator: 'GreaterThan'
          threshold: inpP75Threshold
          name: 'InpP75Criterion'
          dimensions: []
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
  }
}
