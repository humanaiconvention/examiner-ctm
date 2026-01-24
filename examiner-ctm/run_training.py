#!/usr/bin/env python3
"""
Examiner-CTM Training Script with Collapse Detection

This script starts training with automatic collapse detection based on:
"Semantic Grounding and the Preservation of Information in Recursive Systems"
(Haslam, 2025) DOI: 10.5281/zenodo.18091864

Key Features:
- Temporal signature detection (OOD/reward degrades before loss/perplexity rises)
- 1+7 collapse monitors (1 central + 7 per-pillar)
- Automatic pause on collapse signature
- Checkpoint management

Usage:
    python run_training.py --steps 5500 --auto-pause
    python run_training.py --steps 10000 --time-limit 8
    python run_training.py --resume --target-step 5500
"""

import argparse
import os
import sys
import subprocess
from pathlib import Path
from datetime import datetime

# Ensure we're in the correct directory
SCRIPT_DIR = Path(__file__).parent.absolute()
os.chdir(SCRIPT_DIR)

def check_requirements():
    """Check and install requirements if needed."""
    print("Checking requirements...")

    required_packages = [
        'torch', 'transformers', 'peft', 'datasets', 'accelerate',
        'trl', 'sentence-transformers', 'scipy', 'tqdm', 'einops'
    ]

    missing = []
    for pkg in required_packages:
        try:
            __import__(pkg.replace('-', '_'))
        except ImportError:
            missing.append(pkg)

    if missing:
        print(f"Installing missing packages: {missing}")
        subprocess.run([sys.executable, '-m', 'pip', 'install'] + missing, check=True)

    print("Requirements OK")


def main():
    parser = argparse.ArgumentParser(
        description="Examiner-CTM Training with Collapse Detection",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Fresh training to step 5500 with auto-pause on collapse
  python run_training.py --steps 5500 --auto-pause

  # Train for 8 hours maximum
  python run_training.py --steps 10000 --time-limit 8

  # Resume from checkpoint, train until collapse or step 5500
  python run_training.py --resume --target-step 5500

  # Train with git sync (for live dashboard)
  python run_training.py --steps 5500 --git-sync

Collapse Detection:
  The trainer monitors for the "confidently wrong" phase where:
  - Reward (external fidelity) is declining
  - Loss (internal consistency) remains stable

  This temporal lag is the diagnostic hallmark of semantic collapse.
  Training automatically pauses when this signature is detected.
        """
    )

    # Training parameters
    parser.add_argument('--steps', type=int, default=5500,
                        help='Total training steps (default: 5500)')
    parser.add_argument('--target-step', type=int, default=None,
                        help='Stop at this step regardless of collapse detection')
    parser.add_argument('--time-limit', type=float, default=None,
                        help='Maximum training time in hours')
    parser.add_argument('--resume', action='store_true',
                        help='Resume from latest checkpoint')

    # Collapse detection parameters
    parser.add_argument('--auto-pause', action='store_true', default=True,
                        help='Automatically pause on collapse signature (default: True)')
    parser.add_argument('--no-auto-pause', action='store_false', dest='auto_pause',
                        help='Disable automatic pause on collapse')
    parser.add_argument('--consecutive-warnings', type=int, default=3,
                        help='Number of consecutive warnings before pause (default: 3)')
    parser.add_argument('--trend-window', type=int, default=50,
                        help='Window size for trend calculation (default: 50)')

    # Sync parameters
    parser.add_argument('--git-sync', action='store_true',
                        help='Enable git sync for live dashboard')
    parser.add_argument('--sync-every', type=int, default=10,
                        help='Hub sync frequency in steps (default: 10)')

    # Model parameters
    parser.add_argument('--bootstrap-steps', type=int, default=0,
                        help='Bootstrap steps (LOGOS only) before full training')
    parser.add_argument('--checkpoint-dir', type=str, default='checkpoints',
                        help='Checkpoint directory (default: checkpoints)')

    args = parser.parse_args()

    # Check requirements
    check_requirements()

    # Import trainer (after requirements check)
    print("\nInitializing Examiner-CTM Trainer...")
    from ctm_trainer import UnifiedTrainer

    # Configuration banner
    print("\n" + "=" * 60)
    print("EXAMINER-CTM TRAINING CONFIGURATION")
    print("=" * 60)
    print(f"Steps: {args.steps}")
    print(f"Time limit: {args.time_limit or 'None'} hours")
    print(f"Auto-pause on collapse: {args.auto_pause}")
    print(f"Consecutive warnings threshold: {args.consecutive_warnings}")
    print(f"Trend window: {args.trend_window}")
    print(f"Git sync: {args.git_sync}")
    print(f"Resume: {args.resume}")
    print("=" * 60)

    # Initialize trainer
    trainer = UnifiedTrainer()

    # Update collapse detector settings
    if hasattr(trainer, 'collapse_detector'):
        trainer.collapse_detector.consecutive_warnings = args.consecutive_warnings
        trainer.collapse_detector.trend_window = args.trend_window
        trainer.collapse_detector.auto_pause = args.auto_pause
        print(f"\n[CollapseDetector] Configured:")
        print(f"  - Auto-pause: {args.auto_pause}")
        print(f"  - Consecutive warnings: {args.consecutive_warnings}")
        print(f"  - Trend window: {args.trend_window}")

    # Load checkpoint if resuming
    if args.resume:
        checkpoint_step = trainer.load_latest_checkpoint()
        if checkpoint_step:
            print(f"\n[Checkpoint] Resuming from step {checkpoint_step}")
        else:
            print("\n[Checkpoint] No checkpoint found, starting fresh")

    # Start training
    print(f"\n{'=' * 60}")
    print("STARTING TRAINING")
    print("Press Ctrl+C to stop gracefully")
    print(f"{'=' * 60}\n")

    try:
        trainer.train_parallel(
            steps=args.steps,
            sync_every=args.sync_every,
            time_limit_hours=args.time_limit,
            git_sync=args.git_sync,
            bootstrap_steps=args.bootstrap_steps
        )
    except KeyboardInterrupt:
        print("\n\n[INTERRUPTED] Saving checkpoint...")
        trainer.save_checkpoint(trainer.global_train_step)
        print("Checkpoint saved. Training can be resumed with --resume")

    # Print final status
    print("\n" + "=" * 60)
    print("TRAINING SESSION COMPLETE")
    print("=" * 60)

    if hasattr(trainer, 'collapse_detector'):
        status = trainer.get_collapse_status_all()
        print(f"\nCollapse Detector Final Status:")
        print(f"  Central warnings: {status['central']['warning_count']}")
        print(f"  Pillars with warnings: {status['pillars_warning_count']}/7")
        print(f"  Training paused: {status['training_paused']}")
        print(f"  Recommendation: {status['recommendation']}")

        if status['central'].get('optimal_step_estimate'):
            print(f"\n  Estimated optimal step: {status['central']['optimal_step_estimate']}")

    # NEW: Auto-Grounding Status
    if hasattr(trainer, 'auto_grounding'):
        print(f"\nAuto-Grounding Interventions:")
        trainer.auto_grounding.print_status()

    print(f"\nFinal step: {trainer.global_train_step}")
    print("=" * 60)


if __name__ == '__main__':
    main()
