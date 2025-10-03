/**
 * Entropy Weighting Module
 * 
 * A consciousness-layer module for controlling exploration-exploitation balance
 * in agentic decision-making systems.
 * 
 * @module entropy-weighting
 * @version 0.1.0
 */

import logic from './logic.js';
import tileConfig from './tile.json' assert { type: 'json' };

export { default as logic } from './logic.js';
export { tileConfig };

/**
 * Initialize the entropy weighting module with default configuration
 * @returns {object} Module instance
 */
export function initialize(config = {}) {
  const defaultConfig = logic.getDefaultConfig();
  const mergedConfig = { ...defaultConfig, ...config };
  
  const validation = logic.validateConfig(mergedConfig);
  if (!validation.valid) {
    throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
  }
  
  let currentConfig = mergedConfig;
  
  return {
    id: 'entropy-weighting',
    layer: 'decision-modulation',
    
    get currentWeight() {
      return currentConfig.entropyWeight;
    },
    
    applyWeighting(options, weight) {
      const effectiveWeight = weight !== undefined ? weight : currentConfig.entropyWeight;
      return logic.applyEntropyWeighting(options, effectiveWeight);
    },
    
    select(options, weight) {
      const effectiveWeight = weight !== undefined ? weight : currentConfig.entropyWeight;
      return logic.selectWithEntropyWeighting(options, effectiveWeight);
    },
    
    validateConfig(cfg) {
      return logic.validateConfig(cfg);
    },
    
    getConfig() {
      return { ...currentConfig };
    },
    
    updateConfig(updates) {
      const newConfig = { ...currentConfig, ...updates };
      const validation = logic.validateConfig(newConfig);
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }
      currentConfig = newConfig;
    },
    
    getTileConfig() {
      return tileConfig;
    }
  };
}

export default { logic, tileConfig, initialize };
