# Entropy Weighting Module

## Overview
The entropy-weighting module provides a configurable parameter for controlling the balance between exploration and exploitation in agentic decision-making systems. This module is part of the HumanAI Convention's consciousness framework.

**Version:** 0.1.0  
**Layer:** decision-modulation  
**Status:** Active

## Purpose
Enable users to directly influence how agentic systems balance predictability (exploitation) versus diversity (exploration) in their decision-making processes.

## Files

### Core Components
- **`tile.json`** - Tile definition with metadata, control configuration, and Power Apps bindings
- **`logic.js`** - Entropy weighting algorithm implementation
- **`types.ts`** - TypeScript type definitions for ConsciousnessModules integration
- **`index.js`** - Module initialization and exports
- **`ethics.md`** - Ethical implications and agentic continuity analysis

### Documentation
- **`README.md`** - This file

## Usage

### Basic Example
```javascript
import { initialize } from './modules/entropy-weighting/index.js';

// Initialize module with default configuration
const entropyModule = initialize();

// Define decision options
const options = [
  { id: 'option-a', score: 0.8 },
  { id: 'option-b', score: 0.6 },
  { id: 'option-c', score: 0.4 }
];

// Apply entropy weighting (default 0.5)
const weighted = entropyModule.applyWeighting(options);
console.log(weighted);

// Select best option
const result = entropyModule.select(options);
console.log('Selected:', result.selected);
console.log('Alternatives:', result.alternatives);
```

### Adjusting Entropy Weight
```javascript
// Update configuration
entropyModule.updateConfig({ entropyWeight: 0.7 });

// Or pass weight directly
const highExploration = entropyModule.select(options, 0.9);
const lowExploration = entropyModule.select(options, 0.1);
```

### Configuration Options
```javascript
const customConfig = {
  entropyWeight: 0.5,      // 0.0 (exploit) to 1.0 (explore)
  minOptions: 2,           // Minimum options required
  maxOptions: 100,         // Maximum options to consider
  normalizeScores: true    // Normalize scores before weighting
};

const module = initialize(customConfig);
```

## Tile Configuration

The `tile.json` includes:

### Core Fields
- **id:** `entropy-weighting-toggle`
- **kind:** `metric`
- **title:** "Entropy Weighting Control"
- **description:** Explains exploration/exploitation tradeoff

### Control Configuration
- **Type:** Slider
- **Range:** 0.0 to 1.0
- **Default:** 0.5
- **Step:** 0.01

### Ethics Extensions
- **Profile Reference:** `entropy-weighting@0.1.0`
- **Retention:** Session-only
- **Consent Required:** Yes

### Power Apps Binding
Ready for integration with Power Platform:
- Control type: Slider
- Data type: Number
- Includes display name and tooltip
- Validation range: 0.0-1.0

### Consciousness Layer
- **Layer:** `decision-modulation`
- **Impact:** `continuity-variance`

## Ethics Profile

```json
{
  "id": "entropy-weighting",
  "version": "0.1.0",
  "declaredPurposes": ["educational", "research", "user-empowerment"],
  "dataCategories": ["preferences"],
  "retentionDays": "session",
  "consentRequired": true,
  "sensitive": false,
  "approximateEnergyJoules": 5,
  "networkKBPerInteraction": 0.5,
  "exportFormats": ["json"]
}
```

**Review Level:** Auto (low risk)

## Algorithm Details

The entropy weighting algorithm:

1. **Calculate Local Entropy:** For each option, compute `-p * log2(p)` where `p` is the normalized probability based on scores
2. **Normalize Entropy:** Scale by maximum possible entropy `log2(n)` where `n` is option count
3. **Apply Weighting:** Combine base score and entropy: `(1 - w) * score + w * entropy`
4. **Select Best:** Choose option with highest weighted score

### Behavioral Implications

- **w = 0.0:** Pure exploitation (always pick highest base score)
- **w = 0.5:** Balanced (equal weight to score and entropy)
- **w = 1.0:** Pure exploration (favor diverse/uncertain options)

## Integration with ConsciousnessModules

The module exposes TypeScript types for schema integration:

```typescript
import type { ConsciousnessEntropyModule } from './types';

const module: ConsciousnessEntropyModule = initialize();
```

See `types.ts` for full type definitions.

## Testing

Basic validation tests:

```javascript
import { logic } from './index.js';

// Test configuration validation
const validation = logic.validateConfig({ entropyWeight: 0.5 });
console.assert(validation.valid === true);

// Test weighting
const options = [
  { id: 'a', score: 1.0 },
  { id: 'b', score: 0.5 }
];
const weighted = logic.applyEntropyWeighting(options, 0.5);
console.assert(weighted.length === 2);
console.assert(weighted[0].weightedScore !== undefined);
```

## Agentic Continuity Considerations

From `ethics.md`:

1. **Behavioral Consistency:** Lower weights increase predictability; higher weights increase adaptability
2. **User Agency:** Clear disclosure of parameter effects required for informed consent
3. **Transparency:** All decisions logged with active entropy weight value
4. **Autonomy:** User-only control; no automated adjustment without consent

## Power Apps Integration

The tile includes Power Apps binding configuration for easy integration:

1. Import tile configuration
2. Bind slider control using `extensions.powerApps:binding`
3. Map control value to module initialization
4. Apply to agentic decision endpoints

## Export & Portability

Settings can be exported in JSON format:

```javascript
const exported = {
  module: 'entropy-weighting',
  version: '0.1.0',
  config: module.getConfig(),
  tile: module.getTileConfig()
};

// Export to JSON
console.log(JSON.stringify(exported, null, 2));
```

## Change Log

| Version | Date | Change | Ethics Impact |
|---------|------|--------|---------------|
| 0.1.0 | 2025-10-03 | Initial implementation | Baseline risk assessment |

## Future Enhancements

- Adaptive entropy recommendations based on task type
- Multi-dimensional entropy controls
- Collaborative filtering for personalized defaults
- Temporal scheduling capabilities

## References

- [TILE_SPEC.md](../economics/TILE_SPEC.md) - Tile specification
- [CONVENTION_PRINCIPLES.md](../../../CONVENTION_PRINCIPLES.md) - Ethics framework
- [MODULE_TEMPLATE.md](../../../MODULE_TEMPLATE.md) - Module template

## License

MIT

---

**Tagline:** *We will know — together.*
