# Examiner-CTM: L4 Deployment Guide

This guide describes how to deploy and run the **parallel-ctm-marathon** branch on an NVIDIA L4 instance.

## 1. Instance Setup

- **GPU**: NVIDIA L4 (24GB VRAM)
- **OS**: Ubuntu 22.04+ (or Windows Server with CUDA)
- **Python**: 3.10+
- **Disk**: 50GB+ (for checkpoints and corpus)

## 2. Clone Repository

```bash
git clone https://github.com/humanaiconvention/examiner.git
cd examiner
git checkout parallel-ctm-marathon
```

## 3. Configuration

Fill in your API keys in the `.env` file:

```bash
cp .env.example .env
nano .env  # Fill in BRAVE_SEARCH_API_KEY, OPENROUTER_API_KEY, etc.
```

## 4. Install Dependencies

```bash
# Recommendation: use a virtual environment
python -m venv venv
source venv/bin/activate  # Linux
# or: venv\Scripts\activate  # Windows

pip install -r examiner-ctm/requirements.txt
```

## 5. Launch Training

To start the marathon with **Auto-Grounding** and **Collapse Detection**:

```bash
cd examiner-ctm
python run_training.py --steps 5500 --auto-pause --git-sync
```

### Flag Details:
- `--steps 5500`: Target step count for the marathon.
- `--auto-pause`: Automatically pause training if semantic collapse is detected (Haslam 2025).
- `--git-sync`: Auto-push metrics to GitHub for the Live Monitor dashboard.

## 6. Monitor Progress

Open the monitor dashboard at:
[https://humanaiconvention.com/ctm-monitor/](https://humanaiconvention.com/ctm-monitor/)

Or view local metrics:
```bash
tail -f parallel_training_metrics.jsonl | jq '.'
```

## 7. Troubleshooting

- **OOM Errors**: The `ctm_trainer` includes health checks that purge memory at >95% usage. If OOM persists, reduce `batch_size` in `ctm_trainer.py`.
- **Git Sync Errors**: Ensure the L4 machine is authenticated with GitHub (SSH key or PAT) to allow pushing to the private repo.
- **Drift Detected**: If Sigma Watchdog triggers a HARD warning, the model has collapsed. It will automatically attempt a re-initialization from the central foundation.
