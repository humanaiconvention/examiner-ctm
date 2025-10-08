/**
 * Entropy Weighting Logic Module
 * 
 * Implements entropy-based decision weighting for agentic systems.
 * Controls the balance between exploration (high entropy) and exploitation (low entropy).
 * 
 * @module entropy-weighting
 * @version 0.1.0
 */

/**
 * Calculate weighted entropy score for a set of options
 * @param {Array<{id: string, score: number, entropy?: number}>} options - Decision options with base scores
 * @param {number} entropyWeight - Weight factor (0.0 to 1.0)
 * @returns {Array<{id: string, score: number, weightedScore: number, entropy: number}>}
 */
export function applyEntropyWeighting(options, entropyWeight = 0.5) {
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error('Options must be a non-empty array');
  }
  
  if (entropyWeight < 0 || entropyWeight > 1) {
    throw new Error('entropyWeight must be between 0 and 1');
  }
  
  // Calculate entropy for each option if not provided
  const optionsWithEntropy = options.map(opt => ({
    ...opt,
    entropy: opt.entropy !== undefined ? opt.entropy : calculateLocalEntropy(opt.score, options.map(o => o.score))
  }));
  
  // Apply weighted combination of base score and entropy
  return optionsWithEntropy.map(opt => ({
    ...opt,
    weightedScore: (1 - entropyWeight) * opt.score + entropyWeight * opt.entropy
  }));
}

/**
 * Calculate local entropy contribution for a single option
 * @param {number} score - The option's base score
 * @param {number[]} allScores - All scores in the distribution
 * @returns {number} Normalized entropy contribution (0 to 1)
 */
function calculateLocalEntropy(score, allScores) {
  const total = allScores.reduce((sum, s) => sum + s, 0);
  if (total === 0) return 0;
  
  const probability = score / total;
  if (probability === 0) return 0;
  
  // Local entropy: -p * log2(p), normalized
  const localEntropy = -probability * Math.log2(probability);
  const maxEntropy = Math.log2(allScores.length);
  
  return localEntropy / maxEntropy;
}

/**
 * Select best option based on entropy-weighted scores
 * @param {Array<{id: string, score: number}>} options - Decision options
 * @param {number} entropyWeight - Weight factor (0.0 to 1.0)
 * @returns {{selected: object, alternatives: Array}} Best option and alternatives
 */
export function selectWithEntropyWeighting(options, entropyWeight = 0.5) {
  const weighted = applyEntropyWeighting(options, entropyWeight);
  
  // Sort by weighted score (descending)
  const sorted = [...weighted].sort((a, b) => b.weightedScore - a.weightedScore);
  
  return {
    selected: sorted[0],
    alternatives: sorted.slice(1),
    metadata: {
      entropyWeight,
      optionCount: options.length,
      diversityFactor: calculateDiversityFactor(weighted)
    }
  };
}

/**
 * Calculate diversity factor of the current decision space
 * @param {Array<{entropy: number}>} options - Options with entropy values
 * @returns {number} Diversity factor (0 to 1)
 */
function calculateDiversityFactor(options) {
  if (options.length === 0) return 0;
  
  const avgEntropy = options.reduce((sum, opt) => sum + opt.entropy, 0) / options.length;
  return avgEntropy;
}

/**
 * Validate entropy weighting configuration
 * @param {object} config - Configuration object
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateConfig(config) {
  const errors = [];
  
  if (config.entropyWeight !== undefined) {
    if (typeof config.entropyWeight !== 'number') {
      errors.push('entropyWeight must be a number');
    } else if (config.entropyWeight < 0 || config.entropyWeight > 1) {
      errors.push('entropyWeight must be between 0 and 1');
    }
  }
  
  if (config.minOptions !== undefined) {
    if (!Number.isInteger(config.minOptions) || config.minOptions < 1) {
      errors.push('minOptions must be a positive integer');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get default configuration
 * @returns {object} Default configuration
 */
export function getDefaultConfig() {
  return {
    entropyWeight: 0.5,
    minOptions: 2,
    maxOptions: 100,
    normalizeScores: true
  };
}

export default {
  applyEntropyWeighting,
  selectWithEntropyWeighting,
  validateConfig,
  getDefaultConfig
};
