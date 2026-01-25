# CTM Monitor

Real-time monitoring dashboard for Examiner-CTM training sessions.

## Overview

CTM Monitor provides live visualization of training metrics, collapse detection signals, and per-pillar performance tracking for the Examiner-CTM system.

## Features

- **Real-time Metrics**: Loss, rewards, and gradient norms
- **Collapse Detection**: Visual alerts for semantic collapse signatures (Haslam 2025)
- **Per-Pillar Tracking**: Individual specialist domain performance
- **Auto-grounding Status**: Intervention timeline visualization (v5.2+)
- **Recursive Weight Monitoring**: Parameter savings tracking (v5.3+)
- **JSONL Data Feed**: Integrated with live metrics from parallel_training_metrics.jsonl

## Files

- `app.js`: Main dashboard application
- `app.bundle.js`: Bundled version for production
- `index.html`: Web interface
- `simple.html`: Lightweight alternative view
- `sync_metrics.py`: Live metrics synchronization script
- `sync_metrics_lite.py`: Lightweight sync variant
- `package.json`: Node.js dependencies

## Usage

### Web Interface

```bash
# Open in browser
open index.html
# or
python -m http.server 8000
# then visit http://localhost:8000
```

### Metrics Synchronization

```bash
# Sync metrics from training session
python sync_metrics.py

# Lightweight sync (lower bandwidth)
python sync_metrics_lite.py
```

## Dashboard Views

### Main Dashboard (index.html)
- Training progress chart
- Loss and reward trends
- Per-pillar specialist performance
- Collapse detector warnings (central + 7 pillars)
- Auto-grounding intervention timeline
- **v5.3+**: Recursive weight parameter savings visualization

### Simple View (simple.html)
- Lightweight single-page view
- Core metrics only
- Lower bandwidth usage

## Integration

**Examiner-CTM v5.3 (Recursive Weight Derivation)**
- Reads from `parallel_training_metrics.jsonl`
- Receives collapse detection events (central + per-pillar monitors)
- Tracks auto-grounding interventions (cascading severity levels)
- **New**: Shows recursive weight parameter savings
  - Central NLM: ~5.4% savings via derived W2
  - Per-specialist: ~91.2% savings via cross-specialist weight sharing
  - Total system: **80.5% parameter reduction** (13,764 vs 70,656 params)

## Requirements

See package.json for Node.js dependencies.

## License

Part of Examiner-CTM project.
