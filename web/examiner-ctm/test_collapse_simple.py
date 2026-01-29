#!/usr/bin/env python3
"""
Simple test of collapse detection on historical data.
Skips file logging to avoid serialization issues.
"""

import json
from pathlib import Path
from collections import defaultdict
import sys

# Import collapse detector
sys.path.insert(0, str(Path.cwd()))

def test_historical_data():
    """Load and analyze metrics without using detector's logging."""

    metrics_file = Path("parallel_training_metrics.jsonl")
    if not metrics_file.exists():
        print(f"ERROR: Metrics file not found: {metrics_file}")
        return

    print("=" * 70)
    print("HISTORICAL METRICS ANALYSIS")
    print("=" * 70)

    data = {
        'total': 0,
        'by_domain': defaultdict(list),
        'reward_values': [],
        'loss_values': [],
        'steps': [],
    }

    print(f"\nReading {metrics_file.name}...")

    # Load all data
    with open(metrics_file, 'r') as f:
        for line_num, line in enumerate(f, 1):
            try:
                record = json.loads(line)
                data['total'] += 1

                step = record.get('step')
                domain = record.get('domain', 'unknown')
                reward = record.get('reward')
                loss = record.get('loss')

                data['by_domain'][domain].append({
                    'step': step,
                    'reward': reward,
                    'loss': loss
                })

                if reward is not None:
                    data['reward_values'].append(reward)
                if loss is not None:
                    data['loss_values'].append(loss)
                data['steps'].append(step)

                if line_num % 5000 == 0:
                    print(f"  Loaded {line_num:,} records...", end='\r')

            except json.JSONDecodeError:
                pass

    print(f"\nLoaded {data['total']:,} records\n")

    # === Analysis ===
    print("=" * 70)
    print("DATA SUMMARY")
    print("=" * 70)

    if not data['reward_values']:
        print("No reward data found")
        return

    import numpy as np

    reward_arr = np.array(data['reward_values'])
    loss_arr = np.array(data['loss_values']) if data['loss_values'] else np.array([0])

    print(f"Total records: {data['total']:,}")
    print(f"Final step: {max(data['steps'])}")
    print(f"Domains: {len(data['by_domain'])} ({', '.join(sorted(data['by_domain'].keys()))})")

    print(f"\nReward stats:")
    print(f"  Mean:     {np.mean(reward_arr):8.4f}")
    print(f"  Median:   {np.median(reward_arr):8.4f}")
    print(f"  Std:      {np.std(reward_arr):8.4f}")
    print(f"  Range:    [{np.min(reward_arr):8.4f}, {np.max(reward_arr):8.4f}]")

    print(f"\nLoss stats:")
    print(f"  Mean:     {np.mean(loss_arr):8.4f}")
    print(f"  Median:   {np.median(loss_arr):8.4f}")
    print(f"  Std:      {np.std(loss_arr):8.4f}")
    print(f"  Range:    [{np.min(loss_arr):8.4f}, {np.max(loss_arr):8.4f}]")

    # === Trend Analysis ===
    print("\n" + "=" * 70)
    print("TREND ANALYSIS (Last 100 samples)")
    print("=" * 70)

    window_size = min(100, len(data['reward_values']))
    recent_rewards = reward_arr[-window_size:]
    recent_losses = loss_arr[-window_size:] if len(loss_arr) >= window_size else loss_arr

    # Simple linear regression for trend
    def compute_trend(values):
        if len(values) < 2:
            return 0.0
        x = np.arange(len(values))
        # Normalize values to [0, 1]
        v_min, v_max = np.min(values), np.max(values)
        if v_max == v_min:
            return 0.0
        v_norm = (values - v_min) / (v_max - v_min)
        # Linear regression
        coeffs = np.polyfit(x, v_norm, 1)
        return float(coeffs[0])  # slope

    reward_trend = compute_trend(recent_rewards)
    loss_trend = compute_trend(recent_losses)

    print(f"\nLast {window_size} records:")
    print(f"  Reward trend: {reward_trend:8.6f} (negative = declining)")
    print(f"  Loss trend:   {loss_trend:8.6f} (negative = improving)")

    # === Collapse Signature Check ===
    print("\n" + "=" * 70)
    print("COLLAPSE SIGNATURE CHECK")
    print("=" * 70)

    REWARD_DECLINE_THRESHOLD = -0.01
    LOSS_STABLE_THRESHOLD = 0.02

    reward_declining = reward_trend < REWARD_DECLINE_THRESHOLD
    loss_stable = abs(loss_trend) < LOSS_STABLE_THRESHOLD or loss_trend < 0

    print(f"\nSignature criteria (Haslam 2025):")
    print(f"  Reward declining (trend < {REWARD_DECLINE_THRESHOLD}):")
    print(f"    {reward_trend:8.6f} -> {'YES' if reward_declining else 'NO'}")
    print(f"  Loss stable (|trend| < {LOSS_STABLE_THRESHOLD}):")
    print(f"    {loss_trend:8.6f} -> {'YES' if loss_stable else 'NO'}")

    if reward_declining and loss_stable:
        print(f"\n[WARNING] COLLAPSE SIGNATURE DETECTED!")
        print(f"  Model is declining in external fidelity (reward)")
        print(f"  While maintaining internal consistency (loss)")
        print(f"  This is the 'confidently wrong' phase")
    else:
        print(f"\n[OK] No collapse signature in recent data")
        print(f"  Training appears to be progressing normally")

    # === Per-Domain Analysis ===
    print("\n" + "=" * 70)
    print("PER-DOMAIN ANALYSIS")
    print("=" * 70)

    for domain in sorted(data['by_domain'].keys()):
        domain_data = data['by_domain'][domain]
        domain_rewards = [d['reward'] for d in domain_data if d['reward'] is not None]
        domain_losses = [d['loss'] for d in domain_data if d['loss'] is not None]

        if not domain_rewards:
            continue

        n_samples = len(domain_data)
        reward_mean = np.mean(domain_rewards)
        loss_mean = np.mean(domain_losses) if domain_losses else 0.0

        # Last 20 samples trend
        window = min(20, len(domain_rewards))
        recent_rew = np.array(domain_rewards[-window:])
        recent_loss = np.array(domain_losses[-window:]) if len(domain_losses) >= window else np.array(domain_losses)

        rew_trend = compute_trend(recent_rew)
        loss_trend_domain = compute_trend(recent_loss)

        warning = "[!]" if (rew_trend < -0.01 and abs(loss_trend_domain) < 0.02) else "[*]"
        print(f"\n{warning} {domain.upper():10} ({n_samples:4} records)")
        print(f"     Reward: mean={reward_mean:7.4f}, trend={rew_trend:8.6f}")
        print(f"     Loss:   mean={loss_mean:7.4f}, trend={loss_trend_domain:8.6f}")

    print("\n" + "=" * 70)

if __name__ == '__main__':
    test_historical_data()
