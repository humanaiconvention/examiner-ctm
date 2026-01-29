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
        
        # 3. Push to all remotes
        remotes = ["origin", "website", "private"]
        for remote in remotes:
            print(f"[Git Sync] Pushing to {remote}...")
            # Push the branch we are on to the corresponding branch on each remote
            # We assume current branch is the one we want to sync
            result = subprocess.run(["git", "push", remote, "HEAD:live" if remote != "private" else "HEAD:parallel-ctm-marathon", "--force"], capture_output=True, text=True)
            if result.returncode != 0:
                print(f"[Git Sync] Push to {remote} failed: {result.stderr}")
            else:
                print(f"[Git Sync] Pushed to {remote} successfully")
            
    except Exception as e:
        print(f"[Git Sync] Error: {e}")

if __name__ == "__main__":
    push_metrics()
