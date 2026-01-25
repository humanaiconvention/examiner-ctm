#!/usr/bin/env python3
import subprocess
import os
import sys
from datetime import datetime

def push_metrics():
    """Commit and push metrics to git-sync."""
    try:
        # 1. Add metrics
        subprocess.run(["git", "add", "parallel_training_metrics.jsonl"], check=False)
        
        # 2. Commit
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        msg = f"CTM Heartbeat: {timestamp} | Syncing Logic Foundation Metrics"
        subprocess.run(["git", "commit", "-m", msg], check=False)
        
        # 3. Push
        # We use --force if necessary or just a regular push
        # For L4 git-sync, we usually just do a regular push
        result = subprocess.run(["git", "push"], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"[Git Sync] Push failed: {result.stderr}")
        else:
            print("[Git Sync] Metrics pushed successfully")
            
    except Exception as e:
        print(f"[Git Sync] Error: {e}")

if __name__ == "__main__":
    push_metrics()
