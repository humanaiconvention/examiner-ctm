/**
 * Module Ethics Profile for Entropy Weighting
 * 
 * Machine-readable ethics profile for automated evaluation
 * per HumanAI Convention requirements.
 */

export const profile = {
  id: 'entropy-weighting',
  version: '0.1.0',
  declaredPurposes: ['educational', 'research', 'user-empowerment'],
  dataCategories: ['preferences'],
  retentionDays: 'session',
  consentRequired: true,
  sensitive: false,
  approximateEnergyJoules: 5,
  networkKBPerInteraction: 0.5,
  reuseDependencies: [],
  exportFormats: ['json'],
  riskMitigations: [
    'session-only-default',
    'user-control-only',
    'transparent-logging',
    'explicit-consent',
    'easy-reset'
  ]
};

export default profile;
