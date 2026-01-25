"""
Collapse Detector: Temporal Signature Detection for Semantic Divergence
Based on: "Semantic Grounding and the Preservation of Information in Recursive Systems"
(Haslam, 2025) DOI: 10.5281/zenodo.18091864

Key Insight: OOD accuracy (reward) degrades BEFORE validation perplexity (loss) rises.
This temporal lag is the diagnostic hallmark of semantic collapse (informational autophagy).

The "confidently wrong" phase:
- Reward declining (loss of external fidelity)
- Loss stable or improving (maintained internal consistency)
- Model optimizes internal coherence while losing grounding

Stopping Criterion:
  IF reward_trend < 0 AND loss_trend <= 0 for N consecutive windows:
      PAUSE TRAINING (you're in the collapse danger zone)
"""

import json
import numpy as np
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Tuple
import threading
import time


class CollapseDetector:
    """
    Detects the temporal signature of semantic collapse.

    Monitors the divergence between:
    - External fidelity metrics (reward) - the "canary"
    - Internal consistency metrics (loss) - lags behind

    When reward declines while loss is stable, training should pause.
    """

    def __init__(
        self,
        window_size: int = 100,
        trend_window: int = 50,
        min_samples: int = 30,
        reward_decline_threshold: float = -0.01,  # Negative slope indicates decline
        loss_stable_threshold: float = 0.02,       # Loss trend near zero or negative
        consecutive_warnings: int = 3,             # Require N consecutive detections
        log_file: str = "collapse_detector.jsonl",
        auto_pause: bool = True,
        intervention_callback: Optional[callable] = None,  # Called BEFORE pause decision
        pause_callback: Optional[callable] = None
    ):
        """
        Args:
            window_size: Total history to maintain
            trend_window: Window for computing trends (rolling regression)
            min_samples: Minimum samples before detection activates
            reward_decline_threshold: Slope below this = reward declining
            loss_stable_threshold: Slope magnitude below this = loss stable
            consecutive_warnings: Number of consecutive detections before pause
            log_file: Path for collapse detection log
            auto_pause: Whether to automatically pause training
            intervention_callback: Callable invoked on warning BEFORE pause decision
                Signature: callback(step, warning_count, reward_trend, loss_trend) -> result
            pause_callback: Function to call when pause is triggered
        """
        self.window_size = window_size
        self.trend_window = trend_window
        self.min_samples = min_samples
        self.reward_decline_threshold = reward_decline_threshold
        self.loss_stable_threshold = loss_stable_threshold
        self.consecutive_warnings = consecutive_warnings
        self.log_file = Path(log_file)
        self.auto_pause = auto_pause
        self.intervention_callback = intervention_callback  # NEW
        self.pause_callback = pause_callback

        # === Data Storage ===
        self.rewards = deque(maxlen=window_size)
        self.losses = deque(maxlen=window_size)
        self.steps = deque(maxlen=window_size)
        self.timestamps = deque(maxlen=window_size)

        # === Trend History ===
        self.reward_trends = deque(maxlen=window_size)
        self.loss_trends = deque(maxlen=window_size)
        self.divergence_scores = deque(maxlen=window_size)

        # === Detection State ===
        self.warning_count = 0
        self.total_warnings = 0
        self.is_paused = False
        self.pause_step = None
        self.detection_history = []

        # === Threading for non-blocking pause ===
        self._pause_event = threading.Event()

        # === Statistics ===
        self.stats = {
            'total_samples': 0,
            'collapse_detections': 0,
            'pauses_triggered': 0,
            'optimal_step_estimate': None,
            'first_warning_step': None
        }

    def record(self, step: int, reward: float, loss: Optional[float],
               domain: str = None, metadata: dict = None):
        """
        Record a training step's metrics.

        Args:
            step: Training step number
            reward: External fidelity metric (OOD proxy)
            loss: Internal consistency metric (perplexity proxy)
            domain: Active domain (optional)
            metadata: Additional context (optional)
        """
        # Handle NaN loss
        if loss is None or (isinstance(loss, float) and np.isnan(loss)):
            # Use last valid loss or skip
            if self.losses:
                loss = self.losses[-1]
            else:
                return  # Can't compute trends without loss

        self.steps.append(step)
        self.rewards.append(reward)
        self.losses.append(loss)
        self.timestamps.append(datetime.utcnow().isoformat())
        self.stats['total_samples'] += 1

        # Compute trends if enough data
        if len(self.rewards) >= self.min_samples:
            reward_trend = self._compute_trend(list(self.rewards)[-self.trend_window:])
            loss_trend = self._compute_trend(list(self.losses)[-self.trend_window:])

            self.reward_trends.append(reward_trend)
            self.loss_trends.append(loss_trend)

            # Compute divergence score (reward declining faster than loss)
            divergence = loss_trend - reward_trend  # Positive = loss stable while reward drops
            self.divergence_scores.append(divergence)

            # Check for collapse signature
            detection = self._check_collapse_signature(
                step, reward_trend, loss_trend, divergence
            )

            # Log detection
            self._log_detection(step, reward, loss, reward_trend, loss_trend,
                              divergence, detection, domain)

            return detection

        return None

    def _compute_trend(self, values: List[float]) -> float:
        """
        Compute linear trend (slope) using least squares regression.

        Returns:
            float: Normalized slope (change per step)
        """
        if len(values) < 2:
            return 0.0

        n = len(values)
        x = np.arange(n)
        y = np.array(values)

        # Handle edge cases
        if np.std(y) < 1e-10:
            return 0.0

        # Normalize y to [0, 1] range for comparable slopes
        y_min, y_max = y.min(), y.max()
        if y_max - y_min > 1e-10:
            y_norm = (y - y_min) / (y_max - y_min)
        else:
            y_norm = y

        # Linear regression
        x_mean = x.mean()
        y_mean = y_norm.mean()

        numerator = np.sum((x - x_mean) * (y_norm - y_mean))
        denominator = np.sum((x - x_mean) ** 2)

        if abs(denominator) < 1e-10:
            return 0.0

        slope = numerator / denominator
        return slope

    def _check_collapse_signature(
        self,
        step: int,
        reward_trend: float,
        loss_trend: float,
        divergence: float
    ) -> Dict:
        """
        Check for the temporal signature of semantic collapse.

        Collapse signature (from Haslam 2025):
        - Reward declining (reward_trend < threshold)
        - Loss stable or improving (abs(loss_trend) < threshold OR loss_trend < 0)

        This is the "confidently wrong" phase where:
        - Model loses external fidelity (OOD accuracy drops)
        - Model maintains internal consistency (perplexity stable)
        """
        reward_declining = bool(reward_trend < self.reward_decline_threshold)
        loss_stable = bool(abs(loss_trend) < self.loss_stable_threshold or loss_trend < 0)

        signature_detected = reward_declining and loss_stable

        detection = {
            'step': step,
            'signature_detected': bool(signature_detected),
            'reward_trend': float(reward_trend) if reward_trend is not None else None,
            'loss_trend': float(loss_trend) if loss_trend is not None else None,
            'divergence': float(divergence) if divergence is not None else None,
            'reward_declining': reward_declining,
            'loss_stable': loss_stable,
            'warning_count': int(self.warning_count)
        }

        if signature_detected:
            self.warning_count += 1
            self.total_warnings += 1
            self.stats['collapse_detections'] += 1

            if self.stats['first_warning_step'] is None:
                self.stats['first_warning_step'] = step

            # Estimate optimal step (last step before sustained warnings)
            if self.warning_count == 1:
                self.stats['optimal_step_estimate'] = step - self.trend_window

            detection['consecutive_warnings'] = self.warning_count

            # === NEW: Intervention callback BEFORE pause decision ===
            # Allows auto-grounding injection on warnings #2, #3, etc.
            # Callback has chance to inject grounding BEFORE training pauses
            if self.intervention_callback and self.warning_count < self.consecutive_warnings:
                try:
                    intervention_result = self.intervention_callback(
                        step=step,
                        warning_count=self.warning_count,
                        reward_trend=reward_trend,
                        loss_trend=loss_trend
                    )
                    if intervention_result:
                        detection['intervention_triggered'] = True
                        detection['intervention_result'] = intervention_result
                except Exception as e:
                    print(f"[CollapseDetector] Intervention callback error: {e}")

            # Check if we should pause
            if self.warning_count >= self.consecutive_warnings:
                detection['pause_recommended'] = True

                if self.auto_pause and not self.is_paused:
                    self._trigger_pause(step, detection)
        else:
            # Reset warning count if signature not detected
            self.warning_count = 0
            detection['consecutive_warnings'] = 0
            detection['pause_recommended'] = False

        self.detection_history.append(detection)
        return detection

    def _trigger_pause(self, step: int, detection: Dict):
        """Trigger training pause."""
        self.is_paused = True
        self.pause_step = step
        self.stats['pauses_triggered'] += 1
        self._pause_event.set()

        print("\n" + "=" * 60)
        print("🚨 COLLAPSE SIGNATURE DETECTED - TRAINING PAUSED 🚨")
        print("=" * 60)
        print(f"Step: {step}")
        print(f"Reward trend: {detection['reward_trend']:.4f} (declining)")
        print(f"Loss trend: {detection['loss_trend']:.4f} (stable)")
        print(f"Consecutive warnings: {self.warning_count}")
        print(f"Estimated optimal step: {self.stats['optimal_step_estimate']}")
        print("\nThis is the 'confidently wrong' phase from Haslam (2025):")
        print("  - External fidelity declining (reward ↓)")
        print("  - Internal consistency stable (loss →)")
        print("\nRecommendation: Stop training and save checkpoint.")
        print("=" * 60 + "\n")

        if self.pause_callback:
            self.pause_callback(step, detection)

    def wait_if_paused(self, timeout: float = None) -> bool:
        """
        Block if training is paused.

        Args:
            timeout: Max seconds to wait (None = forever)

        Returns:
            bool: True if should continue, False if still paused after timeout
        """
        if self.is_paused:
            return not self._pause_event.wait(timeout)
        return True

    def resume(self):
        """Resume training after pause."""
        self.is_paused = False
        self._pause_event.clear()
        self.warning_count = 0  # Reset warnings
        print("[CollapseDetector] Training resumed")

    def should_stop(self) -> Tuple[bool, str]:
        """
        Check if training should stop.

        Returns:
            Tuple[bool, str]: (should_stop, reason)
        """
        if self.is_paused:
            return True, f"Collapse signature detected at step {self.pause_step}"
        return False, ""

    def _log_detection(self, step, reward, loss, reward_trend, loss_trend,
                       divergence, detection, domain):
        """Log detection to JSONL file."""
        # Helper to convert numpy types to native Python types for JSON
        def to_json_safe(val):
            if val is None:
                return None
            if hasattr(val, 'item'):  # numpy scalar
                return val.item()
            return val

        entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'step': int(step),
            'reward': to_json_safe(reward),
            'loss': to_json_safe(loss),
            'reward_trend': to_json_safe(reward_trend),
            'loss_trend': to_json_safe(loss_trend),
            'divergence': to_json_safe(divergence),
            'signature_detected': bool(detection['signature_detected']) if detection else False,
            'warning_count': int(self.warning_count),
            'domain': str(domain) if domain else None
        }

        with open(self.log_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry) + '\n')

    def get_status(self) -> Dict:
        """Get current detector status."""
        return {
            'total_samples': self.stats['total_samples'],
            'is_paused': self.is_paused,
            'warning_count': self.warning_count,
            'total_warnings': self.total_warnings,
            'collapse_detections': self.stats['collapse_detections'],
            'pauses_triggered': self.stats['pauses_triggered'],
            'optimal_step_estimate': self.stats['optimal_step_estimate'],
            'first_warning_step': self.stats['first_warning_step'],
            'current_reward_trend': self.reward_trends[-1] if self.reward_trends else None,
            'current_loss_trend': self.loss_trends[-1] if self.loss_trends else None,
            'current_divergence': self.divergence_scores[-1] if self.divergence_scores else None
        }

    def get_analysis(self) -> Dict:
        """Get comprehensive analysis of training trajectory."""
        if len(self.rewards) < self.min_samples:
            return {'status': 'insufficient_data', 'samples': len(self.rewards)}

        rewards = np.array(self.rewards)
        losses = np.array(self.losses)

        # Find inflection points
        reward_inflection = self._find_inflection(rewards)
        loss_inflection = self._find_inflection(losses)

        # Compute temporal lag (in steps)
        if reward_inflection and loss_inflection:
            lag = loss_inflection - reward_inflection
        else:
            lag = None

        return {
            'status': 'ok',
            'samples': len(self.rewards),
            'reward_stats': {
                'mean': float(rewards.mean()),
                'std': float(rewards.std()),
                'min': float(rewards.min()),
                'max': float(rewards.max()),
                'current': float(rewards[-1]),
                'trend': self.reward_trends[-1] if self.reward_trends else None,
                'inflection_step': reward_inflection
            },
            'loss_stats': {
                'mean': float(losses.mean()),
                'std': float(losses.std()),
                'min': float(losses.min()),
                'max': float(losses.max()),
                'current': float(losses[-1]),
                'trend': self.loss_trends[-1] if self.loss_trends else None,
                'inflection_step': loss_inflection
            },
            'temporal_lag': lag,
            'collapse_signature': {
                'detected': self.warning_count > 0,
                'consecutive_warnings': self.warning_count,
                'total_detections': self.stats['collapse_detections']
            },
            'recommendation': self._get_recommendation()
        }

    def _find_inflection(self, values: np.ndarray) -> Optional[int]:
        """Find the step where trend changes direction."""
        if len(values) < 10:
            return None

        # Use rolling gradient
        window = min(10, len(values) // 4)
        gradients = []

        for i in range(window, len(values)):
            grad = self._compute_trend(values[i-window:i].tolist())
            gradients.append(grad)

        gradients = np.array(gradients)

        # Find sign changes (inflection points)
        sign_changes = np.where(np.diff(np.sign(gradients)))[0]

        if len(sign_changes) > 0:
            # Return index in original array
            return int(sign_changes[0] + window + self.steps[0])
        return None

    def _get_recommendation(self) -> str:
        """Get training recommendation based on current state."""
        if self.is_paused:
            return f"STOP: Collapse signature detected. Optimal step ~{self.stats['optimal_step_estimate']}"
        elif self.warning_count > 0:
            return f"CAUTION: {self.warning_count}/{self.consecutive_warnings} warnings. Monitor closely."
        elif len(self.reward_trends) > 0 and self.reward_trends[-1] < 0:
            return "WATCH: Reward trend is negative. Early warning possible."
        else:
            return "OK: No collapse signature detected."


class CollapseDetectorIntegration:
    """
    Helper class to integrate CollapseDetector with CTM Trainer.
    """

    @staticmethod
    def create_pause_callback(trainer):
        """Create a callback that saves checkpoint and pauses trainer."""
        def on_pause(step, detection):
            print(f"[CollapseDetector] Saving checkpoint at step {step}...")
            if hasattr(trainer, 'save_checkpoint'):
                trainer.save_checkpoint(step)
            if hasattr(trainer, 'paused'):
                trainer.paused = True
        return on_pause

    @staticmethod
    def integrate_with_trainer(trainer, auto_pause=True):
        """
        Integrate collapse detector into UnifiedTrainer.

        Call this after trainer initialization.
        """
        detector = CollapseDetector(
            window_size=200,
            trend_window=50,
            min_samples=30,
            consecutive_warnings=3,
            auto_pause=auto_pause,
            log_file=str(Path(trainer.checkpoint_dir if hasattr(trainer, 'checkpoint_dir')
                             else '.') / 'collapse_detector.jsonl'),
            pause_callback=CollapseDetectorIntegration.create_pause_callback(trainer)
        )

        trainer.collapse_detector = detector
        trainer.paused = False

        print("[CollapseDetector] Integrated with trainer")
        print(f"  - Auto-pause: {auto_pause}")
        print(f"  - Warning threshold: {detector.consecutive_warnings} consecutive detections")
        return detector


# === Standalone Usage ===
if __name__ == "__main__":
    # Demo usage
    import random

    detector = CollapseDetector(
        window_size=100,
        trend_window=20,
        min_samples=15,
        consecutive_warnings=3,
        auto_pause=True
    )

    print("Simulating training with collapse...")

    # Phase 1: Normal training (steps 0-50)
    for step in range(50):
        reward = 0.5 + 0.3 * (step / 50) + random.gauss(0, 0.05)
        loss = 10.0 - 5.0 * (step / 50) + random.gauss(0, 0.2)
        detector.record(step, reward, loss)

    # Phase 2: Collapse phase - reward drops, loss stays stable
    print("\nEntering collapse phase...")
    for step in range(50, 100):
        # Reward declining (external fidelity dropping)
        reward = 0.8 - 0.4 * ((step - 50) / 50) + random.gauss(0, 0.03)
        # Loss stable or slightly improving (internal consistency maintained)
        loss = 5.0 - 0.1 * ((step - 50) / 50) + random.gauss(0, 0.1)

        result = detector.record(step, reward, loss)

        if detector.is_paused:
            print(f"\n[Step {step}] Training paused by collapse detector")
            break

    # Print analysis
    print("\n=== Collapse Analysis ===")
    analysis = detector.get_analysis()
    print(f"Reward trend: {analysis['reward_stats']['trend']:.4f}")
    print(f"Loss trend: {analysis['loss_stats']['trend']:.4f}")
    print(f"Temporal lag: {analysis['temporal_lag']}")
    print(f"Recommendation: {analysis['recommendation']}")
