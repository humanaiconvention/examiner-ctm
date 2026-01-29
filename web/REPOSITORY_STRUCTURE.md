# Examiner-CTM v5.2 Repository Structure

## Overview

The Examiner-CTM project uses a **two-repository strategy**:

1. **Public Repository** (`examiner-ctm`) - Open source, anyone can clone and train
2. **Private Repository** (`examiner` / `parallel-ctm-marathon` branch) - Personalized with API keys and ready to deploy

---

## Public Repositories

### 1. https://github.com/humanaiconvention/examiner-ctm
**Main public training codebase - generic, no API keys**

```
examiner-ctm/
├── *.py                          # All v5.2 training modules (29 files)
├── README.md                     # Complete documentation
├── requirements.txt              # Dependencies
└── docs/                         # Architecture guides
```

**Contents:**
- ✅ `auto_grounding.py` - Cascading intervention system
- ✅ `collapse_detector.py` - Collapse detection with callbacks
- ✅ `ctm_trainer.py` - Main training loop
- ✅ `run_training.py` - CLI entry point
- ✅ All supporting modules (curriculum, ensemble, grounding clients, etc.)
- ✅ Unit tests for auto-grounding and collapse detection

**Usage:** Anyone can clone and train with their own API keys in `.env`

```bash
git clone https://github.com/humanaiconvention/examiner-ctm.git
cd examiner-ctm
cp .env.example .env          # Add your API keys here
python run_training.py --steps 5000 --auto-pause --git-sync
```

---

### 2. https://github.com/humanaiconvention/ctm-monitor
**Live training dashboard - public monitoring interface**

```
ctm-monitor/
├── app.js                       # React dashboard
├── package.json                 # Dependencies
└── data/
    └── training_1.jsonl        # Historical reference data (34MB)
```

**Features:**
- Dual-mode display (Training 1 reference + Live stream)
- Collapse signature detection visualization
- Real-time metrics graphs
- No authentication required

**Access:** https://humanaiconvention.com/ctm-monitor/

---

## Private Repository

### https://github.com/humanaiconvention/examiner → `parallel-ctm-marathon` branch
**Personalized instance - contains API keys and L4 deployment config**

```
examiner/parallel-ctm-marathon/
├── *.py                         # v5.2 training modules (same as public)
├── .env.example                 # Configuration template
├── L4_DEPLOYMENT_GUIDE.md      # Step-by-step L4 deployment
├── ctm-monitor/                 # Personalized dashboard copy
└── checkpoints/                 # Training checkpoints (git-ignored)
```

**Difference from Public:**
- `.env.example` provides template for YOUR API keys
- `L4_DEPLOYMENT_GUIDE.md` has L4-specific setup
- `ctm-monitor/` includes personalized configuration
- Local grounding server setup instructions
- Ready-to-run training scripts

**Usage:**
```bash
git clone https://github.com/humanaiconvention/examiner.git
cd examiner
git checkout parallel-ctm-marathon

# Add your API keys
cp .env.example .env
nano .env  # Fill in BRAVE_SEARCH_API_KEY, OPENROUTER_API_KEY, etc.

# Deploy to L4
source venv/bin/activate
python run_training.py --steps 5000 --auto-pause --git-sync
```

---

## Deployment Paths

### Path 1: Public Deployment (Anyone)

```mermaid
Developer
    ↓
git clone https://github.com/humanaiconvention/examiner-ctm.git
    ↓
Add API keys to .env
    ↓
python run_training.py --steps 5000
    ↓
View metrics at https://humanaiconvention.com/ctm-monitor/
```

### Path 2: Personal Deployment (L4 Cloud)

```mermaid
You (Benjamin)
    ↓
git clone (private examiner repo)
git checkout parallel-ctm-marathon
    ↓
Add YOUR API keys to .env
    ↓
SSH to L4 instance
    ↓
python run_training.py --steps 5000 --auto-pause --git-sync
    ↓
View metrics at https://humanaiconvention.com/ctm-monitor/
    ↓
Metrics auto-pushed to ctm-monitor GitHub repo
```

---

## What Lives Where

| Component | Public Repo | Private Branch | Notes |
|-----------|------------|----------------|-------|
| **Training Code** | ✅ examiner-ctm | ✅ parallel-ctm-marathon | Same code, no API keys in either |
| **API Keys** | ❌ None | ✅ .env (not committed) | Private repo only, in .gitignore |
| **L4 Guide** | ❌ None | ✅ L4_DEPLOYMENT_GUIDE.md | Personalized for your instance |
| **CTM Monitor Dashboard** | ✅ ctm-monitor | ✅ parallel-ctm-marathon | Public + private copy |
| **Documentation** | ✅ README.md | ✅ Inherited from public | Full v5.2 docs |
| **Checkpoints** | ❌ None | ✅ checkpoints/ (git-ignored) | Training output, never committed |
| **Configuration** | ✅ .env.example | ✅ .env.example | Template only, no secrets |

---

## Git Configuration

### Current Setup (Monorepo at D:/humanaiconvention)

```bash
# Remote 1: Public repo (origin)
origin → https://github.com/humanaiconvention/examiner-ctm.git

# Remote 2: Private repo (private)
private → https://github.com/humanaiconvention/examiner.git

# Branches
- live                      → Public codebase
- parallel-ctm-marathon     → Personal L4 deployment (from private/parallel-ctm-marathon)
```

### Workflow for Updates

**Public Updates:**
```bash
# Update public repo
git checkout live
git pull origin live
# Make changes
git add .
git commit -m "..."
git push origin live
```

**Private Updates:**
```bash
# Update private repo
git checkout parallel-ctm-marathon
git pull private parallel-ctm-marathon
# Make changes (API keys in .env, not committed)
git add .
git commit -m "..."
git push private parallel-ctm-marathon
```

---

## v5.2 Auto-Grounding Integration

Both repositories include the **identical** v5.2 code:

✅ **Auto-Grounding Manager** (`auto_grounding.py`)
- Cascading interventions: light → moderate → critical
- Pillar-aware preferences (advisor vs context)
- Rate limiting with adaptive bypass for critical violations
- Records all interventions for C_eff(t) calculation

✅ **Updated Collapse Detector** (`collapse_detector.py`)
- Non-invasive intervention callback support
- Calls auto-grounding BEFORE pause decision
- Haslam (2025) temporal signature detection

✅ **Enhanced Trainer** (`ctm_trainer.py`)
- AutoGroundingManager initialization
- Emergency context/advice storage for next sample
- Proactive viability intervention checks
- Git-sync integration for live metrics

---

## Feature Comparison

| Feature | Public | Private |
|---------|--------|---------|
| v5.2 Auto-Grounding | ✅ Yes | ✅ Yes |
| Training Code | ✅ Yes | ✅ Yes |
| Collapse Detection | ✅ Yes | ✅ Yes |
| Live Dashboard | ✅ Yes (read-only) | ✅ Yes (local copy) |
| API Key Templates | ✅ .env.example | ✅ .env.example |
| API Keys (actual) | ❌ None | ✅ In .env (not committed) |
| L4 Deployment Guide | ❌ Generic | ✅ Personalized |
| Ready to Train | ⚠️ If you add keys | ✅ Yes |
| CI/CD Hooks | ✅ GitHub Actions | ⚠️ Manual |

---

## Security Notes

### What's Safe to Commit

✅ Python training code (no secrets)
✅ Documentation and guides
✅ .env.example templates (placeholders only)
✅ Configuration metadata

### What's Never Committed

❌ .env file (actual API keys)
❌ checkpoints/ directory
❌ .env with real values
❌ Personal credentials
❌ Cloud service accounts

### .gitignore Enforces

```
.env                    # Never commit actual keys
checkpoints/           # Training output
__pycache__/           # Python cache
*.pyc                  # Compiled Python
venv/                  # Virtual environment
```

---

## Quick Reference

### Clone Public
```bash
git clone https://github.com/humanaiconvention/examiner-ctm.git
```

### Clone Private
```bash
git clone https://github.com/humanaiconvention/examiner.git
cd examiner
git checkout parallel-ctm-marathon
```

### View Code Differences
```bash
# Diff between public and private (should be minimal)
git diff origin/live private/parallel-ctm-marathon -- '*.py'
```

### Push Updates
```bash
# Public
git checkout live && git push origin live

# Private
git checkout parallel-ctm-marathon && git push private parallel-ctm-marathon
```

### Monitor Training
```bash
# Watch live metrics (public dashboard)
https://humanaiconvention.com/ctm-monitor/?run=Training%202

# Or check local logs
tail -f parallel_training_metrics.jsonl | jq '.'
```

---

## Support & Documentation

- **Public Repo**: https://github.com/humanaiconvention/examiner-ctm
- **Private Repo**: https://github.com/humanaiconvention/examiner/tree/parallel-ctm-marathon
- **Dashboard**: https://humanaiconvention.com/ctm-monitor/
- **v5.2 Docs**: README.md in either repo (identical)
- **L4 Guide**: L4_DEPLOYMENT_GUIDE.md (private repo only)
- **Paper**: https://arxiv.org/abs/2505.05522 (CTM)
- **Grounding**: Haslam (2025) - DOI: 10.5281/zenodo.18091864

---

**Status**: ✅ Both repositories synchronized with v5.2 Auto-Grounding
**Last Updated**: 2026-01-24
**Maintainer**: Human AI Convention Team
