#!/usr/bin/env python3
"""
Sync training metrics from L4 to GitHub for live monitoring.
Runs on the L4 GPU instance, pushes metrics every 5 seconds.
"""
import time
import shutil
import subprocess
from pathlib import Path

# Configuration
SOURCE_FILE = Path.home() / "examiner-ctm" / "parallel_training_metrics.jsonl"
REPO_DIR = Path.home() / "ctm-monitor-data"
REPO_URL = "https://github.com/humanaiconvention/ctm-monitor.git"
PUSH_INTERVAL = 5  # seconds
MAX_SNAPSHOTS = 5  # keep last 5 snapshots

def setup_repo():
    """Clone or pull the repo."""
    if not REPO_DIR.exists():
        print(f"Cloning {REPO_URL}...")
        subprocess.run(["git", "clone", REPO_URL, str(REPO_DIR)], check=True)
        subprocess.run(["git", "config", "user.email", "bot@humanaiconvention.com"], cwd=REPO_DIR, check=True)
        subprocess.run(["git", "config", "user.name", "L4 Training Bot"], cwd=REPO_DIR, check=True)
    else:
        print("Pulling latest...")
        subprocess.run(["git", "pull"], cwd=REPO_DIR, check=True)

def sync_metrics():
    """Copy metrics and push to GitHub."""
    if not SOURCE_FILE.exists():
        print(f"Warning: {SOURCE_FILE} not found, skipping...")
        return

    # Copy current metrics
    dest = REPO_DIR / "parallel_training_metrics.jsonl"
    shutil.copy2(SOURCE_FILE, dest)

    # Create timestamped snapshot
    timestamp = int(time.time())
    snapshot = REPO_DIR / f"snapshots" / f"metrics_{timestamp}.jsonl"
    snapshot.parent.mkdir(exist_ok=True)
    shutil.copy2(SOURCE_FILE, snapshot)

    # Clean old snapshots (keep last MAX_SNAPSHOTS)
    snapshots = sorted(snapshot.parent.glob("metrics_*.jsonl"))
    for old_snapshot in snapshots[:-MAX_SNAPSHOTS]:
        old_snapshot.unlink()
        print(f"Removed old snapshot: {old_snapshot.name}")

    # Git add, commit, push
    subprocess.run(["git", "add", "-A"], cwd=REPO_DIR, check=True)

    # Check if there are changes
    result = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=REPO_DIR)
    if result.returncode != 0:  # Changes exist
        subprocess.run([
            "git", "commit", "-m",
            f"Update metrics: {timestamp}"
        ], cwd=REPO_DIR, check=True)
        subprocess.run(["git", "push"], cwd=REPO_DIR, check=True)
        print(f"✓ Pushed update at {time.strftime('%H:%M:%S')}")
    else:
        print(f"○ No changes at {time.strftime('%H:%M:%S')}")

def main():
    print("=== CTM Monitor Sync ===")
    print(f"Source: {SOURCE_FILE}")
    print(f"Repo: {REPO_DIR}")
    print(f"Interval: {PUSH_INTERVAL}s")
    print()

    setup_repo()

    print("\nStarting sync loop (Ctrl+C to stop)...")
    try:
        while True:
            sync_metrics()
            time.sleep(PUSH_INTERVAL)
    except KeyboardInterrupt:
        print("\n\nSync stopped.")

if __name__ == "__main__":
    main()
