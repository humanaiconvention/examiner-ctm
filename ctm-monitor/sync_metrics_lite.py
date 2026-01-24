#!/usr/bin/env python3
"""Lightweight version - only syncs last 1000 lines"""
import time
import subprocess
from pathlib import Path

SOURCE = Path.home() / "examiner-ctm" / "parallel_training_metrics.jsonl"
REPO = Path.home() / "ctm-monitor-data"
TAIL_LINES = 1000

def sync():
    if not SOURCE.exists():
        return

    # Create lite version with only last N lines
    result = subprocess.run(
        ["tail", "-n", str(TAIL_LINES), str(SOURCE)],
        capture_output=True, text=True, check=True
    )

    lite_file = REPO / "parallel_training_metrics.jsonl"
    lite_file.write_text(result.stdout)

    subprocess.run(["git", "add", "-A"], cwd=REPO, check=True)
    result = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=REPO)

    if result.returncode != 0:
        subprocess.run(["git", "commit", "-m", f"Update {int(time.time())}"], cwd=REPO, check=True)
        subprocess.run(["git", "push", "-f"], cwd=REPO, check=True)
        print(f"✓ {time.strftime('%H:%M:%S')}")

while True:
    try:
        sync()
        time.sleep(5)
    except KeyboardInterrupt:
        break
    except Exception as e:
        print(f"Error: {e}")
        time.sleep(5)
