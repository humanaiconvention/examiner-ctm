/**
 * HumanAI Convention Ethics / Usefulness Evaluator (v0.1.0)
 *
 * Provides programmatic primitives to declare a module's ethics profile and
 * compute an automated review level based on risk & resource heuristics.
 */

export interface ModuleEthicsProfileInput {
  id: string;
  version: string; // semver
  declaredPurposes: string[]; // controlled vocabulary (extend later)
  dataCategories: string[]; // e.g. 'behavioral', 'content', 'telemetry:performance'
  retentionDays: number | 'session';
  consentRequired: boolean;
  sensitive: boolean;
  approximateEnergyJoules?: number; // per interaction
  networkKBPerInteraction?: number;
  reuseDependencies?: string[];
  exportFormats: string[];
  riskMitigations?: string[];
}

export type ReviewLevel = 'auto' | 'light' | 'full';

export interface ModuleEthicsProfile extends ModuleEthicsProfileInput {
  reviewLevel: ReviewLevel;
  scoreBreakdown: Record<string, number>; // individual factor contributions
  totalScore: number;
  evaluatorVersion: string; // version of this evaluator logic
}

const EVALUATOR_VERSION = '0.1.0';

export interface EvaluatorThresholds {
  maxLightRetentionDays: number; // retention above this adds score
  highNetworkKB: number; // > adds score
  highEnergyJoules: number; // > adds score
}

export const defaultThresholds: EvaluatorThresholds = {
  maxLightRetentionDays: 30,
  highNetworkKB: 500,
  highEnergyJoules: 120,
};

/** Scoring weights (tunable, must be change‑logged if adjusted) */
const weights = {
  sensitive: 3,
  longRetention: 2,
  highNetwork: 1,
  highEnergy: 1,
  behavioralData: 1,
};

export interface EvaluateOptions {
  thresholds?: Partial<EvaluatorThresholds>;
}

/** Compute review level from cumulative score */
function levelFromScore(score: number): ReviewLevel {
  if (score >= 5) return 'full';
  if (score >= 2) return 'light';
  return 'auto';
}

export function evaluateProfile(input: ModuleEthicsProfileInput, opts: EvaluateOptions = {}): ModuleEthicsProfile {
  const thresholds: EvaluatorThresholds = { ...defaultThresholds, ...opts.thresholds } as EvaluatorThresholds;
  const breakdown: Record<string, number> = {};
  let total = 0;

  const add = (key: keyof typeof weights, condition: boolean) => {
    if (condition) {
      const w = weights[key];
      breakdown[key] = w;
      total += w;
    }
  };

  add('sensitive', input.sensitive);
  add('longRetention', input.retentionDays !== 'session' && typeof input.retentionDays === 'number' && input.retentionDays > thresholds.maxLightRetentionDays);
  add('highNetwork', (input.networkKBPerInteraction ?? 0) > thresholds.highNetworkKB);
  add('highEnergy', (input.approximateEnergyJoules ?? 0) > thresholds.highEnergyJoules);
  add('behavioralData', input.dataCategories.some(c => c.toLowerCase().includes('behavioral')));

  const reviewLevel = levelFromScore(total);

  return {
    ...input,
    reviewLevel,
    scoreBreakdown: breakdown,
    totalScore: total,
    evaluatorVersion: EVALUATOR_VERSION,
  };
}

/** Validate structural soundness of a profile input. Returns array of issues (empty if valid). */
export function validateProfileInput(input: ModuleEthicsProfileInput): string[] {
  const issues: string[] = [];
  if (!/^([a-z0-9-]+)$/.test(input.id)) issues.push('id must be kebab-case alphanumeric+dash');
  if (!/^\d+\.\d+\.\d+$/.test(input.version)) issues.push('version must be semver');
  if (!Array.isArray(input.declaredPurposes) || input.declaredPurposes.length === 0) issues.push('declaredPurposes required');
  if (!Array.isArray(input.exportFormats) || input.exportFormats.length === 0) issues.push('exportFormats required');
  if (typeof input.retentionDays === 'number' && input.retentionDays < 0) issues.push('retentionDays cannot be negative');
  return issues;
}

/** Convenience helper: evaluate only if structurally valid; else throw with aggregated issues */
export function safeEvaluate(input: ModuleEthicsProfileInput, opts?: EvaluateOptions): ModuleEthicsProfile {
  const issues = validateProfileInput(input);
  if (issues.length) {
    interface IssueAggregatedError extends Error { issues: string[] }
    const error: IssueAggregatedError = Object.assign(
      new Error('Invalid ModuleEthicsProfileInput: ' + issues.join('; ')),
      { issues }
    );
    throw error;
  }
  return evaluateProfile(input, opts);
}

// Example (commented):
// const profile = safeEvaluate({
//   id: 'example-module',
//   version: '1.0.0',
//   declaredPurposes: ['educational'],
//   dataCategories: ['content'],
//   retentionDays: 'session',
//   consentRequired: true,
//   sensitive: false,
//   exportFormats: ['json'],
// }, { thresholds: { highNetworkKB: 400 } });
// console.log(profile.reviewLevel);
