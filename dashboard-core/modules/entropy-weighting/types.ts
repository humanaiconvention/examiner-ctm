/**
 * Entropy Weighting Module Type Definitions
 * 
 * Extends the ConsciousnessModules schema with entropy-weighting specific types
 * for integration with the broader consciousness framework.
 */

/**
 * Entropy weighting configuration
 */
export interface EntropyWeightingConfig {
  /** Weight factor between exploitation (0.0) and exploration (1.0) */
  entropyWeight: number;
  /** Minimum number of options required for weighting */
  minOptions?: number;
  /** Maximum number of options to consider */
  maxOptions?: number;
  /** Whether to normalize scores before weighting */
  normalizeScores?: boolean;
}

/**
 * Decision option with entropy metadata
 */
export interface EntropyWeightedOption {
  /** Unique identifier for the option */
  id: string;
  /** Base score before entropy weighting */
  score: number;
  /** Entropy contribution (0 to 1) */
  entropy: number;
  /** Final weighted score */
  weightedScore: number;
  /** Optional additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Selection result with entropy metadata
 */
export interface EntropyWeightedSelection {
  /** The selected option */
  selected: EntropyWeightedOption;
  /** Alternative options ranked by weighted score */
  alternatives: EntropyWeightedOption[];
  /** Metadata about the selection process */
  metadata: {
    entropyWeight: number;
    optionCount: number;
    diversityFactor: number;
  };
}

/**
 * Consciousness layer integration for entropy weighting
 */
export interface ConsciousnessEntropyModule {
  /** Module identifier */
  id: 'entropy-weighting';
  /** Layer in consciousness hierarchy */
  layer: 'decision-modulation';
  /** Current entropy weight setting */
  currentWeight: number;
  /** Apply entropy weighting to decision options */
  applyWeighting: (
    options: Array<{ id: string; score: number }>,
    weight?: number
  ) => EntropyWeightedOption[];
  /** Select best option with entropy weighting */
  select: (
    options: Array<{ id: string; score: number }>,
    weight?: number
  ) => EntropyWeightedSelection;
  /** Validate configuration */
  validateConfig: (config: Partial<EntropyWeightingConfig>) => { valid: boolean; errors: string[] };
  /** Get current configuration */
  getConfig: () => EntropyWeightingConfig;
  /** Update configuration */
  updateConfig: (config: Partial<EntropyWeightingConfig>) => void;
}

/**
 * Power Apps integration binding
 */
export interface PowerAppsEntropyBinding {
  /** Control type in Power Apps */
  controlType: 'Slider';
  /** Data type */
  dataType: 'Number';
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Default value */
  default: number;
  /** Step increment */
  step: number;
  /** Display name in Power Apps */
  displayName: string;
  /** Tooltip text */
  tooltip: string;
  /** Optional formula binding */
  formula?: string;
  /** Optional validation expression */
  validation?: string;
}

/**
 * Tile extension metadata for entropy weighting
 */
export interface EntropyWeightingTileExtensions {
  'ethics:profileRef': string;
  'ethics:retention': 'session' | number;
  'ethics:consent': boolean;
  'control:type': 'slider';
  'control:min': number;
  'control:max': number;
  'control:default': number;
  'control:step': number;
  'powerApps:binding': PowerAppsEntropyBinding;
  'consciousness:layer': string;
  'consciousness:impact': string;
}

/**
 * Full tile definition for entropy weighting
 */
export interface EntropyWeightingTile {
  id: string;
  kind: 'metric';
  specVersion: string;
  title: string;
  description: string;
  updatedAt: string;
  contentVersion: string;
  author: { name: string; id: string };
  tags: string[];
  license: string;
  notes: string;
  extensions: EntropyWeightingTileExtensions;
  metric: {
    key: string;
    unit: string;
    value: number;
    source: string;
  };
}

/**
 * Module ethics profile for entropy weighting
 */
export interface EntropyWeightingEthicsProfile {
  id: 'entropy-weighting';
  version: string;
  declaredPurposes: string[];
  dataCategories: string[];
  retentionDays: 'session' | number;
  consentRequired: boolean;
  sensitive: boolean;
  approximateEnergyJoules?: number;
  networkKBPerInteraction?: number;
  exportFormats: string[];
  riskMitigations?: string[];
}

/**
 * Export all types for use in ConsciousnessModules schema
 */
export type {
  EntropyWeightingConfig as Config,
  EntropyWeightedOption as Option,
  EntropyWeightedSelection as Selection,
  ConsciousnessEntropyModule as Module,
};
