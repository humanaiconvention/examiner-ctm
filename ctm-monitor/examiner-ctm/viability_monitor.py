# Viability Monitor: C_eff(t) >= E(t) Constraint (Haslam, 2025)
# DOI: 10.5281/zenodo.18091864
#
# Implements the information-theoretic viability condition for recursive systems:
# - C_eff(t): Effective corrective bandwidth (grounding events/step)
# - E(t): Internal error generation rate (semantic drift velocity)
#
# E(t) is measured as weighted combination of multiple signals with adaptive weights

import torch
import json
import os
from collections import deque
from datetime import datetime

class ViabilityMonitor:
    """
    Tracks C_eff(t) >= E(t) viability condition across training.

    C_eff(t): Corrective capacity = grounding events per step
    E(t): Error rate = weighted combination of drift signals

    Adaptive weighting adjusts E(t) components based on predictive power.
    """

    def __init__(self,
                 window_size=100,
                 log_file="viability_ledger.jsonl",
                 initial_weights=None):
        """
        Args:
            window_size: Rolling window for rate calculations
            log_file: Path to viability ledger
            initial_weights: Dict of E(t) component weights (or None for equal)
        """
        self.window_size = window_size
        self.log_file = log_file

        # === C_eff(t) Tracking ===
        self.grounding_events = deque(maxlen=window_size)  # Events per step
        self.c_eff_history = deque(maxlen=window_size)

        # === E(t) Component Tracking ===
        # E1: Semantic reward degradation rate
        self.semantic_rewards = deque(maxlen=window_size)
        self.e1_history = deque(maxlen=window_size)

        # E2: Grounding penalty frequency
        self.grounding_penalties = deque(maxlen=window_size)
        self.e2_history = deque(maxlen=window_size)

        # E3: Hallucination accumulation
        self.hallucination_counts = deque(maxlen=window_size)
        self.e3_history = deque(maxlen=window_size)

        # E4: OOD degradation (optional, computed externally)
        self.ood_accuracy = deque(maxlen=window_size)
        self.e4_history = deque(maxlen=window_size)

        # === Weighted E(t) ===
        if initial_weights is None:
            # Equal weights initially
            self.weights = {
                'e1_semantic_degradation': 0.25,
                'e2_penalty_frequency': 0.25,
                'e3_hallucination': 0.25,
                'e4_ood_degradation': 0.25
            }
        else:
            self.weights = initial_weights

        self.e_total_history = deque(maxlen=window_size)

        # === Viability Tracking ===
        self.violations = []  # List of (step, C_eff, E, margin) when C_eff < E
        self.step_counter = 0

        # === Meta-Monitor: Adaptive Weight Adjustment ===
        self.collapse_indicators = deque(maxlen=window_size)  # 1 if collapse detected, 0 otherwise
        self.weight_update_frequency = 500  # Adjust weights every N steps
        self.last_weight_update = 0

        # Correlation tracking for weight adaptation
        self.component_correlations = {
            'e1_semantic_degradation': deque(maxlen=20),
            'e2_penalty_frequency': deque(maxlen=20),
            'e3_hallucination': deque(maxlen=20),
            'e4_ood_degradation': deque(maxlen=20)
        }

    # ========================================
    # C_eff(t): Corrective Capacity Tracking
    # ========================================

    def record_grounding_event(self, event_type, metadata=None):
        """
        Record external correction event.

        Args:
            event_type: str - 'corpus', 'advisor', 'context_match', 'verification'
            metadata: dict - additional info
        """
        current_step_events = 0
        if self.grounding_events and self.grounding_events[-1]['step'] == self.step_counter:
            current_step_events = self.grounding_events[-1]['count']
            self.grounding_events[-1]['count'] += 1
            self.grounding_events[-1]['types'].append(event_type)
        else:
            self.grounding_events.append({
                'step': self.step_counter,
                'count': 1,
                'types': [event_type]
            })

    def compute_c_eff(self):
        """
        Compute effective corrective rate over rolling window.

        Returns:
            float: Average grounding events per step
        """
        if len(self.grounding_events) == 0:
            return 0.0

        total_events = sum(e['count'] for e in self.grounding_events)
        c_eff = total_events / len(self.grounding_events)
        self.c_eff_history.append(c_eff)
        return c_eff

    # ========================================
    # E(t) Component Measurements
    # ========================================

    def record_semantic_reward(self, reward):
        """E1: Track semantic reward to compute degradation rate."""
        self.semantic_rewards.append(reward)

        if len(self.semantic_rewards) >= 2:
            # Compute degradation rate (negative slope)
            recent_rewards = list(self.semantic_rewards)[-min(20, len(self.semantic_rewards)):]
            if len(recent_rewards) >= 2:
                degradation = max(0, recent_rewards[0] - recent_rewards[-1]) / len(recent_rewards)
                self.e1_history.append(degradation)
                return degradation

        self.e1_history.append(0.0)
        return 0.0

    def record_grounding_penalty(self, penalty):
        """E2: Track grounding penalty frequency."""
        self.grounding_penalties.append(penalty)

        # Frequency of significant penalties (< -0.2)
        if len(self.grounding_penalties) >= 10:
            recent_penalties = list(self.grounding_penalties)[-min(50, len(self.grounding_penalties)):]
            penalty_freq = sum(1 for p in recent_penalties if p < -0.2) / len(recent_penalties)
            self.e2_history.append(penalty_freq)
            return penalty_freq

        self.e2_history.append(0.0)
        return 0.0

    def record_hallucination(self, is_hallucination):
        """E3: Track hallucination accumulation."""
        self.hallucination_counts.append(1 if is_hallucination else 0)

        if len(self.hallucination_counts) >= 10:
            recent = list(self.hallucination_counts)[-min(50, len(self.hallucination_counts)):]
            hallucination_rate = sum(recent) / len(recent)
            self.e3_history.append(hallucination_rate)
            return hallucination_rate

        self.e3_history.append(0.0)
        return 0.0

    def record_ood_accuracy(self, accuracy):
        """E4: Track OOD accuracy for degradation rate (optional)."""
        self.ood_accuracy.append(accuracy)

        if len(self.ood_accuracy) >= 2:
            # Compute degradation rate
            recent_ood = list(self.ood_accuracy)[-min(20, len(self.ood_accuracy)):]
            if len(recent_ood) >= 2:
                degradation = max(0, recent_ood[0] - recent_ood[-1]) / len(recent_ood)
                self.e4_history.append(degradation)
                return degradation

        self.e4_history.append(0.0)
        return 0.0

    # ========================================
    # E(t) Weighted Combination
    # ========================================

    def compute_e_total(self):
        """
        Compute weighted E(t) from all components.

        Returns:
            float: E(t) = weighted sum of drift signals
            dict: Individual components for transparency
        """
        components = {
            'e1_semantic_degradation': self.e1_history[-1] if self.e1_history else 0.0,
            'e2_penalty_frequency': self.e2_history[-1] if self.e2_history else 0.0,
            'e3_hallucination': self.e3_history[-1] if self.e3_history else 0.0,
            'e4_ood_degradation': self.e4_history[-1] if self.e4_history else 0.0
        }

        e_total = sum(self.weights[key] * components[key] for key in components.keys())
        self.e_total_history.append(e_total)

        return e_total, components

    # ========================================
    # Meta-Monitor: Adaptive Weight Adjustment
    # ========================================

    def record_collapse_indicator(self, is_collapsing):
        """
        Record whether system is exhibiting collapse symptoms.

        Args:
            is_collapsing: bool - True if collapse detected (e.g., OOD drop, perplexity spike)
        """
        self.collapse_indicators.append(1 if is_collapsing else 0)

    def update_adaptive_weights(self):
        """
        Meta-analysis: Adjust E(t) component weights based on predictive power.

        Strategy: Components that correlate better with collapse get higher weight.
        """
        if len(self.collapse_indicators) < 50:
            return  # Need sufficient data

        # Compute correlation of each component with collapse indicator
        collapse_array = torch.tensor(list(self.collapse_indicators), dtype=torch.float32)

        for component in ['e1_semantic_degradation', 'e2_penalty_frequency',
                          'e3_hallucination', 'e4_ood_degradation']:
            history = getattr(self, component.replace('_', '_history').replace('degradation_history', '1_history').replace('frequency_history', '2_history').replace('hallucination_history', '3_history').replace('degradation_history', '4_history'))

            # Map component name to history attribute
            if component == 'e1_semantic_degradation':
                history = self.e1_history
            elif component == 'e2_penalty_frequency':
                history = self.e2_history
            elif component == 'e3_hallucination':
                history = self.e3_history
            elif component == 'e4_ood_degradation':
                history = self.e4_history

            if len(history) >= 50:
                component_array = torch.tensor(list(history)[-len(collapse_array):], dtype=torch.float32)

                # Pad if needed
                if len(component_array) < len(collapse_array):
                    pad_size = len(collapse_array) - len(component_array)
                    component_array = torch.cat([torch.zeros(pad_size), component_array])

                # Compute correlation
                if component_array.std() > 1e-6 and collapse_array.std() > 1e-6:
                    correlation = torch.corrcoef(torch.stack([component_array, collapse_array]))[0, 1].item()
                    correlation = abs(correlation)  # Absolute correlation
                    self.component_correlations[component].append(correlation)

        # Update weights proportional to average correlation
        total_correlation = 0.0
        avg_correlations = {}

        for component in self.component_correlations.keys():
            if len(self.component_correlations[component]) > 0:
                avg_corr = sum(self.component_correlations[component]) / len(self.component_correlations[component])
                avg_correlations[component] = max(avg_corr, 0.01)  # Floor at 0.01
                total_correlation += avg_correlations[component]

        if total_correlation > 0:
            # Normalize to sum to 1.0
            for component in self.weights.keys():
                if component in avg_correlations:
                    self.weights[component] = avg_correlations[component] / total_correlation

        print(f"[MetaMonitor] Adaptive weights updated: {self.weights}")

    # ========================================
    # Viability Check
    # ========================================

    def check_viability(self):
        """
        Check if C_eff(t) >= E(t).

        Returns:
            dict: {
                'viable': bool,
                'c_eff': float,
                'e_total': float,
                'margin': float (C_eff - E),
                'components': dict of E components
            }
        """
        c_eff = self.compute_c_eff()
        e_total, components = self.compute_e_total()

        margin = c_eff - e_total
        viable = margin >= 0

        if not viable:
            self.violations.append({
                'step': self.step_counter,
                'c_eff': c_eff,
                'e_total': e_total,
                'margin': margin,
                'components': components
            })

        result = {
            'viable': viable,
            'c_eff': c_eff,
            'e_total': e_total,
            'margin': margin,
            'components': components,
            'weights': self.weights.copy()
        }

        # Log to viability ledger
        self.log_viability(result)

        # Meta-monitor: adaptive weight adjustment
        if self.step_counter - self.last_weight_update >= self.weight_update_frequency:
            self.update_adaptive_weights()
            self.last_weight_update = self.step_counter

        return result

    def log_viability(self, result):
        """Write viability check to JSONL ledger."""
        entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'step': self.step_counter,
            **result
        }

        with open(self.log_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry) + '\n')

    def increment_step(self):
        """Call at end of each training step."""
        self.step_counter += 1

    def get_status(self):
        """Return current viability status summary."""
        c_eff = self.c_eff_history[-1] if self.c_eff_history else 0.0
        e_total = self.e_total_history[-1] if self.e_total_history else 0.0

        return {
            'step': self.step_counter,
            'c_eff': c_eff,
            'e_total': e_total,
            'viable': c_eff >= e_total,
            'violation_count': len(self.violations),
            'weights': self.weights,
            'window_size': len(self.grounding_events)
        }
