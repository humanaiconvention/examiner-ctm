# Examiner-CTM v5.2 - Get Started Guide

## 🚀 Quick Start (2 minutes)

### For Windows Users

```powershell
# PowerShell (recommended)
.\QUICK_START.ps1

# Or Windows CMD
QUICK_START.bat
```

### For Linux/macOS Users

```bash
bash QUICK_START.sh
```

That's it! The script will:
1. Navigate to the examiner-ctm directory
2. Show you all available commands
3. Guide you through setup

---

## 📋 Step-by-Step Setup

### 1. Clone the Repository

**For public use:**
```bash
git clone https://github.com/humanaiconvention/examiner-ctm.git
cd examiner-ctm
```

**For L4 cloud deployment (private):**
```bash
git clone https://github.com/humanaiconvention/examiner.git
cd examiner
git checkout parallel-ctm-marathon
```

### 2. Set Up Your API Keys

```bash
# Copy the configuration template
cp .env.example .env

# Edit with your API keys
nano .env          # Linux/macOS
# or
notepad .env       # Windows
```

**Required keys:**
- `BRAVE_SEARCH_API_KEY` - For context search grounding
- `OPENROUTER_API_KEY` - For advisor ensemble (Qwen, Claude, Llama, Gemma)

**Optional keys:**
- `DUCKDUCKGO_API_KEY` - Fallback search provider
- `CLAUDE_API_KEY` - Direct Anthropic access (if using OpenRouter)

### 3. Create Virtual Environment (Recommended)

```bash
# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate          # Linux/macOS
# or
venv\Scripts\activate             # Windows
```

### 4. Install Dependencies

```bash
pip install -r requirements.txt
```

### 5. Start Training

```bash
# Basic training
python run_training.py --steps 5000

# With auto-grounding and collapse detection
python run_training.py --steps 5000 --auto-pause --git-sync

# With time limit
python run_training.py --steps 10000 --time-limit 8 --auto-pause --git-sync

# Resume from checkpoint
python run_training.py --resume --target-step 5500 --auto-pause --git-sync
```

---

## 📊 Monitor Your Training

**Live Dashboard:**
```
https://humanaiconvention.com/ctm-monitor/
```

The dashboard shows:
- Real-time metrics from your training run
- Collapse detection warnings
- Historical reference data (Training 1)
- Auto-grounding intervention status

**Or watch local logs:**
```bash
tail -f parallel_training_metrics.jsonl | jq '.'
```

---

## 🎯 Understanding the Training Command

```bash
python run_training.py --steps 5000 --auto-pause --git-sync
```

**Flags:**
- `--steps 5000` - Train for 5000 steps
- `--auto-pause` - Automatically pause on collapse detection
- `--git-sync` - Push metrics to GitHub for live dashboard
- `--sync-every 50` - Push metrics every 50 steps (default)
- `--resume` - Resume from latest checkpoint
- `--target-step 5500` - Stop at specific step
- `--time-limit 8` - Stop after 8 hours
- `--bootstrap-steps 100` - Pre-train LOGOS for 100 steps

---

## ✨ What's v5.2 Auto-Grounding?

The system automatically injects external grounding when collapse is detected:

```
Collapse Signature Detected
    ↓
Light Intervention (context search) - 60s cooldown
    ↓
Moderate Intervention (advisor ensemble) - 120s cooldown
    ↓
Critical Intervention (both + bypass cooldowns) - Force recovery
    ↓
If all else fails: Training pause
```

**Why it works:**
- **C_eff(t) ≥ E(t)** - Increases corrective bandwidth before pausing
- **Pillar-aware** - LOGOS prefers advisor, PHYSIS prefers context
- **Smart fallback** - Uses alternative method if preferred is on cooldown

---

## 📂 Repository Structure

### Public Repos (Anyone can use)
```
https://github.com/humanaiconvention/examiner-ctm
  ├── 29 Python training modules
  ├── README.md (full architecture)
  ├── QUICK_START.* (platform-specific scripts)
  └── .env.example (config template)

https://github.com/humanaiconvention/ctm-monitor
  ├── React dashboard
  ├── Training 1 historical data
  └── Live metrics endpoint
```

### Private Repo (Your L4 setup)
```
https://github.com/humanaiconvention/examiner
Branch: parallel-ctm-marathon
  ├── Same v5.2 code as public
  ├── L4_DEPLOYMENT_GUIDE.md
  ├── .env.example (your template)
  └── Personalized ctm-monitor copy
```

---

## 🔧 Common Commands

### Check GPU Status
```bash
nvidia-smi
```

### Watch Real-Time Metrics
```bash
tail -f parallel_training_metrics.jsonl | jq '.[-1]'
```

### View Collapse Detection History
```bash
jq 'select(.collapse_status.warning_count > 0)' parallel_training_metrics.jsonl
```

### View Auto-Grounding Interventions
```bash
jq 'select(.grounding_event != null)' parallel_training_metrics.jsonl
```

### Save Checkpoint Manually
```bash
# Auto-saved every 100 steps, or press Ctrl+C to save
python run_training.py --resume  # Resume from latest
```

---

## 🐛 Troubleshooting

### "CUDA out of memory"
```bash
# Reduce batch size or thinking depth
export BATCH_SIZE=16
python run_training.py --steps 5000
```

### "API key not found"
```bash
# Ensure .env is in the right place
ls -la .env

# And that variables are exported
set -a && source .env && set +a  # Linux/macOS
# or manually in PowerShell
$env:BRAVE_SEARCH_API_KEY = (Select-String -Path .env -Pattern 'BRAVE_SEARCH_API_KEY=(.*)' -AllMatches | Select-Object -ExpandProperty Matches | % {$_.Groups[1].Value})
```

### "Training paused unexpectedly"
```bash
# Check collapse detector status
tail -100 parallel_training_metrics.jsonl | jq '.collapse_status'

# If warning_count >= 3, auto-grounding couldn't recover
# Check if advisor/context services are accessible
```

---

## 📚 Documentation

- **README.md** - Complete v5.2 architecture and all components
- **REPOSITORY_STRUCTURE.md** - Public vs private setup explained
- **L4_DEPLOYMENT_GUIDE.md** - Cloud deployment instructions (private branch)
- **QUICK_START.ps1/bat/sh** - Platform-specific setup helpers

---

## 🎓 Learning Resources

**Papers Referenced:**
1. [CTM Architecture](https://arxiv.org/abs/2505.05522) - Continuous Thought Machine
2. [Semantic Grounding](https://zenodo.org/records/18091864) - Haslam (2025)
3. [Recursive Memory](https://arxiv.org/abs/2512.24601) - RLM Protocol
4. [Manifold Hyper-Connections](https://arxiv.org/html/2512.24880v2) - mHC stability

**Watch Training:**
- https://humanaiconvention.com/ctm-monitor/

**Join Community:**
- GitHub Issues & Discussions
- Paper Reviews & Extensions

---

## ✅ Checklist Before Training

- [ ] Cloned repository
- [ ] Created .env file with API keys
- [ ] Created virtual environment
- [ ] Installed dependencies (`pip install -r requirements.txt`)
- [ ] Verified GPU (`nvidia-smi`)
- [ ] Verified API keys in .env
- [ ] Opened dashboard URL in browser
- [ ] Ready to run training command

---

## 🚀 You're Ready!

**Run this command to start:**

```bash
python run_training.py --steps 5000 --auto-pause --git-sync
```

**Then monitor at:**

```
https://humanaiconvention.com/ctm-monitor/
```

**Have questions?** Check the README.md or repository docs!

---

**Examiner-CTM v5.2** | Sovereign Logic Foundation with Auto-Grounding
**Created:** 2026-01-24 | **Status:** ✅ Production Ready
