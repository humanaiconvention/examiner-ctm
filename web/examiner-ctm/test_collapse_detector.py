#!/usr/bin/env python3
"""
Test Collapse Detector on Historical Metrics Data

Replays the parallel_training_metrics.jsonl through the collapse detection system
to verify it works correctly and identify collapse signatures in historical data.
"""

import json
import sys
from pathlib import Path
from collections import defaultdict
from collapse_detector import CollapseDetector

def test_collapse_detector():
    """Load metrics and run through collapse detector."""

    metrics_file = Path("parallel_training_metrics.jsonl")
    if not metrics_file.exists():
        print(f"ERROR: Metrics file not found: {metrics_file}")
        return

    print("=" * 70)
    print("COLLAPSE DETECTOR TEST - Historical Metrics Replay")
    print("=" * 70)

    # Initialize detectors (same config as training script)
    central_detector = CollapseDetector(
        window_size=200,
        trend_window=50,
        min_samples=30,
        reward_decline_threshold=-0.01,
        loss_stable_threshold=0.02,
        consecutive_warnings=3,
        log_file="test_collapse_detector_central.jsonl",
        auto_pause=True,
        pause_callback=None
    )

    # Per-pillar detectors
    pillar_detectors = {}
    for pillar in ['LOGOS', 'PHYSIS', 'BIOS', 'NOMOS', 'PSYCHE', 'SOPHIA', 'OIKOS']:
        pillar_detectors[pillar] = CollapseDetector(
            window_size=100,
            trend_window=30,
            min_samples=20,
            reward_decline_threshold=-0.015,
            loss_stable_threshold=0.025,
            consecutive_warnings=5,
            log_file=f"test_collapse_detector_{pillar.lower()}.jsonl",
            auto_pause=False,
            pause_callback=None
        )

    # Statistics
    stats = {
        'total_records': 0,
        'by_domain': defaultdict(int),
        'reward_mean': 0.0,
        'loss_mean': 0.0,
        'reward_min': float('inf'),
        'reward_max': float('-inf'),
        'loss_min': float('inf'),
        'loss_max': float('-inf'),
        'last_step': 0,
        'collapse_signatures': [],
    }

    print(f"\nLoading metrics from: {metrics_file}")

    try:
        with open(metrics_file, 'r') as f:
            for line_num, line in enumerate(f, 1):
                try:
                    record = json.loads(line)
                    stats['total_records'] += 1

                    step = record.get('step')
                    domain = record.get('domain', 'unknown')
                    reward = record.get('reward')
                    loss = record.get('loss')

                    stats['by_domain'][domain] += 1
                    stats['last_step'] = max(stats['last_step'], step)

                    if reward is not None:
                        stats['reward_min'] = min(stats['reward_min'], reward)
                        stats['reward_max'] = max(stats['reward_max'], reward)
                        stats['reward_mean'] += reward

                    if loss is not None:
                        stats['loss_min'] = min(stats['loss_min'], loss)
                        stats['loss_max'] = max(stats['loss_max'], loss)
                        stats['loss_mean'] += loss

                    # Record to central detector
                    central_detection = central_detector.record(
                        step=step,
                        reward=float(reward) if reward is not None else None,
                        loss=float(loss) if loss is not None else None,
                        domain=domain
                    )

                    # Check for collapse signature
                    if central_detection and central_detection.get('signature_detected'):
                        stats['collapse_signatures'].append({
                            'step': step,
                            'domain': domain,
                            'reward': reward,
                            'loss': loss,
                            'detection': central_detection
                        })

                    # Record to pillar detector if applicable
                    if domain in pillar_detectors:
                        pillar_detectors[domain].record(
                            step=step,
                            reward=float(reward) if reward is not None else None,
                            loss=float(loss) if loss is not None else None,
                            domain=domain
                        )

                    # Progress indicator
                    if line_num % 1000 == 0:
                        print(f"  > Processed {line_num:,} records (Step {step})...", end='\r')

                except json.JSONDecodeError:
                    pass  # Skip malformed lines

    except FileNotFoundError:
        print(f"ERROR: File not found: {metrics_file}")
        return

    # Compute averages
    if stats['total_records'] > 0:
        stats['reward_mean'] /= stats['total_records']
        stats['loss_mean'] /= stats['total_records']

    print(f"\nProcessed {stats['total_records']:,} records\n")

    # === Results ===
    print("=" * 70)
    print("DATA SUMMARY")
    print("=" * 70)
    print(f"Total records: {stats['total_records']:,}")
    print(f"Final step: {stats['last_step']}")
    print(f"Domains processed: {len(stats['by_domain'])}")
    print(f"  {', '.join(f'{d}:{c}' for d, c in sorted(stats['by_domain'].items()))}")

    print(f"\nReward statistics:")
    print(f"  Mean: {stats['reward_mean']:.4f}")
    print(f"  Range: [{stats['reward_min']:.4f}, {stats['reward_max']:.4f}]")

    print(f"\nLoss statistics:")
    print(f"  Mean: {stats['loss_mean']:.4f}")
    print(f"  Range: [{stats['loss_min']:.4f}, {stats['loss_max']:.4f}]")

    # === Central Detector Status ===
    print("\n" + "=" * 70)
    print("CENTRAL DETECTOR STATUS")
    print("=" * 70)
    central_status = central_detector.get_status()
    print(f"Warning count: {central_status['warning_count']}")
    print(f"Total warnings (all-time): {central_status['total_warnings']}")
    print(f"Paused: {central_status['is_paused']}")

    if central_status['warning_count'] > 0:
        print(f"[WARNING] COLLAPSE SIGNATURE DETECTED")
        print(f"   Consecutive warnings: {central_status['warning_count']}/{central_detector.consecutive_warnings}")
        if central_status['is_paused']:
            print(f"   [PAUSE] TRAINING WOULD BE PAUSED")

    # === Pillar Detector Status ===
    print("\n" + "=" * 70)
    print("PILLAR DETECTOR STATUS (7 Sovereign Pillars)")
    print("=" * 70)

    pillars_with_warnings = 0
    for pillar, detector in sorted(pillar_detectors.items()):
        status = detector.get_status()
        warning_indicator = "[!] " if status['warning_count'] > 0 else "[*] "
        print(f"{warning_indicator} {pillar:8} - Warnings: {status['warning_count']}, Total: {status['total_warnings']}, Paused: {status['is_paused']}")
        if status['warning_count'] > 0:
            pillars_with_warnings += 1

    print(f"\nPillars with active warnings: {pillars_with_warnings}/7")

    # === Collapse Signature History ===
    if stats['collapse_signatures']:
        print("\n" + "=" * 70)
        print(f"COLLAPSE SIGNATURES DETECTED ({len(stats['collapse_signatures'])} instances)")
        print("=" * 70)

        for sig in stats['collapse_signatures'][-20:]:  # Show last 20
            print(f"\nStep {sig['step']} ({sig['domain']}):")
            print(f"  Reward: {sig['reward']:.4f} | Loss: {sig['loss']:.4f}")
            det = sig['detection']
            if det:
                print(f"  Reward trend: {det.get('reward_trend', 0):.6f}")
                print(f"  Loss trend: {det.get('loss_trend', 0):.6f}")
    else:
        print("\nNo collapse signatures detected in historical data")

    # === Recommendations ===
    print("\n" + "=" * 70)
    print("RECOMMENDATIONS")
    print("=" * 70)

    if central_detector.is_paused or central_status['warning_count'] > 0:
        print("[WARNING] Historical data shows collapse signature patterns")
        optimal = central_status.get('optimal_step_estimate')
        if optimal:
            print(f"   Estimated optimal stopping point: Step {optimal}")
        print("\n   Recommendation: Resume training from checkpoint with stricter")
        print("   collapse detection thresholds, or train new model with updated")
        print("   corpus to improve grounding capacity C_eff(t)")
    else:
        print("[OK] Historical data shows normal training progression")
        print("   Model did not exhibit collapse signatures during this period")
        print("\n   Recommendation: Safe to continue training or restart with same")
        print("   configuration. Monitor collapse detection during training.")

    print("\n" + "=" * 70)

if __name__ == '__main__':
    test_collapse_detector()
