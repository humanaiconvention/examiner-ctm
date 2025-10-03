/**
 * Test suite for entropy weighting logic
 * 
 * @module entropy-weighting/logic.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import logic from './logic.js';

describe('Entropy Weighting Logic', () => {
  describe('applyEntropyWeighting', () => {
    it('should throw error for empty options', () => {
      assert.throws(
        () => logic.applyEntropyWeighting([], 0.5),
        /non-empty array/
      );
    });

    it('should throw error for invalid entropy weight', () => {
      const options = [{ id: 'a', score: 1.0 }];
      assert.throws(
        () => logic.applyEntropyWeighting(options, -0.1),
        /between 0 and 1/
      );
      assert.throws(
        () => logic.applyEntropyWeighting(options, 1.1),
        /between 0 and 1/
      );
    });

    it('should calculate weighted scores for valid options', () => {
      const options = [
        { id: 'a', score: 1.0 },
        { id: 'b', score: 0.5 }
      ];
      const result = logic.applyEntropyWeighting(options, 0.5);
      
      assert.strictEqual(result.length, 2);
      assert.ok(result[0].weightedScore !== undefined);
      assert.ok(result[0].entropy !== undefined);
      assert.ok(result[0].entropy >= 0 && result[0].entropy <= 1);
    });

    it('should use provided entropy values if available', () => {
      const options = [
        { id: 'a', score: 1.0, entropy: 0.8 },
        { id: 'b', score: 0.5, entropy: 0.3 }
      ];
      const result = logic.applyEntropyWeighting(options, 0.5);
      
      assert.strictEqual(result[0].entropy, 0.8);
      assert.strictEqual(result[1].entropy, 0.3);
    });

    it('should weight purely by score when entropyWeight is 0', () => {
      const options = [
        { id: 'a', score: 1.0 },
        { id: 'b', score: 0.5 }
      ];
      const result = logic.applyEntropyWeighting(options, 0.0);
      
      // With weight=0, weightedScore should equal base score
      assert.strictEqual(result[0].weightedScore, result[0].score);
      assert.strictEqual(result[1].weightedScore, result[1].score);
    });

    it('should weight purely by entropy when entropyWeight is 1', () => {
      const options = [
        { id: 'a', score: 1.0, entropy: 0.8 },
        { id: 'b', score: 0.5, entropy: 0.3 }
      ];
      const result = logic.applyEntropyWeighting(options, 1.0);
      
      // With weight=1, weightedScore should equal entropy
      assert.strictEqual(result[0].weightedScore, result[0].entropy);
      assert.strictEqual(result[1].weightedScore, result[1].entropy);
    });
  });

  describe('selectWithEntropyWeighting', () => {
    it('should select option with highest weighted score', () => {
      const options = [
        { id: 'a', score: 0.5 },
        { id: 'b', score: 1.0 },
        { id: 'c', score: 0.3 }
      ];
      const result = logic.selectWithEntropyWeighting(options, 0.0);
      
      // With weight=0, should select highest score
      assert.strictEqual(result.selected.id, 'b');
      assert.strictEqual(result.alternatives.length, 2);
    });

    it('should include metadata in result', () => {
      const options = [
        { id: 'a', score: 1.0 },
        { id: 'b', score: 0.5 }
      ];
      const result = logic.selectWithEntropyWeighting(options, 0.5);
      
      assert.ok(result.metadata);
      assert.strictEqual(result.metadata.entropyWeight, 0.5);
      assert.strictEqual(result.metadata.optionCount, 2);
      assert.ok(result.metadata.diversityFactor !== undefined);
    });

    it('should rank alternatives by weighted score', () => {
      const options = [
        { id: 'a', score: 0.3 },
        { id: 'b', score: 0.8 },
        { id: 'c', score: 0.5 }
      ];
      const result = logic.selectWithEntropyWeighting(options, 0.0);
      
      // Alternatives should be sorted descending by weighted score
      assert.ok(result.alternatives[0].weightedScore >= result.alternatives[1].weightedScore);
    });
  });

  describe('validateConfig', () => {
    it('should validate correct configuration', () => {
      const config = {
        entropyWeight: 0.5,
        minOptions: 2
      };
      const result = logic.validateConfig(config);
      
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('should reject invalid entropyWeight type', () => {
      const config = { entropyWeight: '0.5' };
      const result = logic.validateConfig(config);
      
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('must be a number')));
    });

    it('should reject entropyWeight out of range', () => {
      const config1 = { entropyWeight: -0.1 };
      const result1 = logic.validateConfig(config1);
      assert.strictEqual(result1.valid, false);
      
      const config2 = { entropyWeight: 1.5 };
      const result2 = logic.validateConfig(config2);
      assert.strictEqual(result2.valid, false);
    });

    it('should reject invalid minOptions', () => {
      const config1 = { minOptions: 0 };
      const result1 = logic.validateConfig(config1);
      assert.strictEqual(result1.valid, false);
      
      const config2 = { minOptions: 2.5 };
      const result2 = logic.validateConfig(config2);
      assert.strictEqual(result2.valid, false);
    });
  });

  describe('getDefaultConfig', () => {
    it('should return valid default configuration', () => {
      const config = logic.getDefaultConfig();
      
      assert.strictEqual(config.entropyWeight, 0.5);
      assert.strictEqual(config.minOptions, 2);
      assert.strictEqual(config.maxOptions, 100);
      assert.strictEqual(config.normalizeScores, true);
      
      const validation = logic.validateConfig(config);
      assert.strictEqual(validation.valid, true);
    });
  });

  describe('Edge cases', () => {
    it('should handle single option', () => {
      const options = [{ id: 'only', score: 1.0 }];
      const result = logic.selectWithEntropyWeighting(options, 0.5);
      
      assert.strictEqual(result.selected.id, 'only');
      assert.strictEqual(result.alternatives.length, 0);
    });

    it('should handle zero scores', () => {
      const options = [
        { id: 'a', score: 0 },
        { id: 'b', score: 0 }
      ];
      const result = logic.applyEntropyWeighting(options, 0.5);
      
      assert.strictEqual(result.length, 2);
      // Should not throw error
    });

    it('should handle equal scores', () => {
      const options = [
        { id: 'a', score: 0.5 },
        { id: 'b', score: 0.5 },
        { id: 'c', score: 0.5 }
      ];
      const result = logic.selectWithEntropyWeighting(options, 0.5);
      
      // Should select one consistently
      assert.ok(result.selected);
      assert.strictEqual(result.alternatives.length, 2);
    });
  });
});
