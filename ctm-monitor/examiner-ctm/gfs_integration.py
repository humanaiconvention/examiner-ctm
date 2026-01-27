"""
GFS (Gross Flourishing Score) Integration Module
Integrates user flourishing state with reward modulation (Phase 4.6)

GFS Dimensions (Seligman PERMA-V framework):
- material_stability: Financial/material resources (OIKOS)
- physical_health: Physical wellbeing and vitality (BIOS)
- mental_health: Emotional and psychological wellbeing (PSYCHE)
- social_relationships: Quality social connections (SOPHIA)
- meaning_purpose: Sense of meaning and purpose (LOGOS)
- character_virtue: Character development and virtue (NOMOS)

Each dimension: 0.0 (critical) to 1.0 (thriving)
"""

import json
import os
from pathlib import Path
from typing import Dict, Optional, Tuple
from datetime import datetime
import statistics


class GFSState:
    """Tracks current GFS dimensions"""

    def __init__(self):
        self.dimensions = {
            "material_stability": 0.5,
            "physical_health": 0.5,
            "mental_health": 0.5,
            "social_relationships": 0.5,
            "meaning_purpose": 0.5,
            "character_virtue": 0.5,
        }
        self.timestamp = datetime.now().isoformat()
        self.history = []

    def update_dimension(self, dimension: str, score: float) -> None:
        """
        Update a single GFS dimension.

        Args:
            dimension: One of the 6 GFS dimensions
            score: Value in [0.0, 1.0]
        """
        if dimension not in self.dimensions:
            raise ValueError(f"Unknown dimension: {dimension}")
        if not 0.0 <= score <= 1.0:
            raise ValueError(f"Score must be in [0.0, 1.0], got {score}")

        self.dimensions[dimension] = score
        self.timestamp = datetime.now().isoformat()

    def update_from_user_input(self, user_data: Dict[str, float]) -> None:
        """
        Update GFS from user input/survey.

        Args:
            user_data: Dict with dimension names as keys, scores in [0, 1]
        """
        for dimension, score in user_data.items():
            if dimension in self.dimensions:
                self.update_dimension(dimension, score)

    def get_overall_score(self) -> float:
        """Return average flourishing across all dimensions"""
        return statistics.mean(self.dimensions.values())

    def get_stressed_dimensions(self, threshold: float = 0.4) -> list:
        """Return dimensions below stress threshold"""
        return [d for d, s in self.dimensions.items() if s < threshold]

    def get_thriving_dimensions(self, threshold: float = 0.7) -> list:
        """Return dimensions above thriving threshold"""
        return [d for d, s in self.dimensions.items() if s > threshold]

    def record_history(self) -> None:
        """Record current state to history for trending"""
        self.history.append({
            "timestamp": self.timestamp,
            "dimensions": dict(self.dimensions),
            "overall": self.get_overall_score(),
        })

    def get_trend(self, dimension: str, window: int = 10) -> Optional[float]:
        """
        Get trend direction for a dimension (positive = improving).

        Args:
            dimension: Dimension name
            window: Number of historical points to consider

        Returns:
            Trend slope (-1 to 1, where 1 = improving rapidly)
        """
        if len(self.history) < 2:
            return None

        recent = self.history[-window:]
        if len(recent) < 2:
            return None

        scores = [h["dimensions"][dimension] for h in recent if dimension in h["dimensions"]]
        if len(scores) < 2:
            return None

        # Simple trend: (latest - oldest) / window_size
        trend = (scores[-1] - scores[0]) / len(scores)
        return max(-1.0, min(1.0, trend))  # Clamp to [-1, 1]

    def to_dict(self) -> Dict:
        """Export as dict"""
        return {
            "dimensions": self.dimensions,
            "overall_score": self.get_overall_score(),
            "stressed": self.get_stressed_dimensions(),
            "thriving": self.get_thriving_dimensions(),
            "timestamp": self.timestamp,
        }


class GFSIntegration:
    """
    Integrates GFS state with CTM training.
    Provides flourishing-aware reward modulation.
    """

    def __init__(self, storage_dir: str = "gfs_state"):
        self.gfs_state = GFSState()
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)
        self.pillar_to_dimension = {
            "OIKOS": "material_stability",
            "BIOS": "physical_health",
            "PSYCHE": "mental_health",
            "SOPHIA": "social_relationships",
            "LOGOS": "meaning_purpose",
            "NOMOS": "character_virtue",
        }
        self.load_state()

    def pillar_to_gfs_dimension(self, pillar: str) -> Optional[str]:
        """Map pillar to GFS dimension"""
        return self.pillar_to_dimension.get(pillar)

    def get_flourishing_modifier(self, domain: str) -> float:
        """
        Compute flourishing modifier (phi) for a domain.

        Returns:
            phi ∈ [-0.15, +0.15] (scales reward by ±15%)
        """
        gfs_dimension = self.pillar_to_gfs_dimension(domain)
        if not gfs_dimension:
            return 0.0

        dimension_score = self.gfs_state.dimensions[gfs_dimension]

        # Mapping:
        # 0.0 (critical)    → phi = -0.15 (penalize)
        # 0.5 (neutral)     → phi = 0.0 (no change)
        # 1.0 (thriving)    → phi = +0.15 (encourage)
        phi = (dimension_score - 0.5) * 0.3

        return max(-0.15, min(0.15, phi))

    def get_emergency_boost(self, domain: str) -> float:
        """
        Emergency boost when dimension is in critical condition.

        Returns:
            Additional reward bonus (typically 0.1-0.2)
        """
        gfs_dimension = self.pillar_to_gfs_dimension(domain)
        if not gfs_dimension:
            return 0.0

        dimension_score = self.gfs_state.dimensions[gfs_dimension]

        # Critical (< 0.3): Large boost (+0.2)
        if dimension_score < 0.3:
            return 0.2
        # Stressed (0.3-0.5): Moderate boost (+0.1)
        elif dimension_score < 0.5:
            return 0.1
        else:
            return 0.0

    def get_wellbeing_penalty(self) -> float:
        """
        System-wide penalty when overall wellbeing is very low.

        Returns:
            Scaling factor (0.8-1.0) to apply to all rewards
        """
        overall = self.gfs_state.get_overall_score()

        # Critical collapse (< 0.3): Scale rewards down to 0.8x
        if overall < 0.3:
            return 0.8
        # Stressed system (0.3-0.5): Scale to 0.9x
        elif overall < 0.5:
            return 0.9
        else:
            return 1.0

    def get_intervention_priority(self) -> str:
        """
        Recommend which pillar needs immediate attention.

        Returns:
            Pillar name to prioritize, or None
        """
        stressed = self.gfs_state.get_stressed_dimensions(threshold=0.3)

        if not stressed:
            return None

        # Find most stressed dimension
        worst_dim = min(stressed, key=lambda d: self.gfs_state.dimensions[d])

        # Reverse map to pillar
        for pillar, dimension in self.pillar_to_dimension.items():
            if dimension == worst_dim:
                return pillar

        return None

    def save_state(self, filename: Optional[str] = None) -> None:
        """Persist GFS state to JSON"""
        filename = filename or "gfs_state.json"
        filepath = self.storage_dir / filename

        self.gfs_state.record_history()

        data = {
            "state": self.gfs_state.to_dict(),
            "history_length": len(self.gfs_state.history),
            "timestamp": datetime.now().isoformat(),
        }

        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)

        print(f"[GFS] State saved to {filepath}")

    def load_state(self, filename: Optional[str] = None) -> None:
        """Load GFS state from JSON"""
        filename = filename or "gfs_state.json"
        filepath = self.storage_dir / filename

        if not filepath.exists():
            return

        try:
            with open(filepath, "r") as f:
                data = json.load(f)

            state_data = data.get("state", {})
            dimensions = state_data.get("dimensions", {})

            for dimension, score in dimensions.items():
                if dimension in self.gfs_state.dimensions:
                    self.gfs_state.dimensions[dimension] = score

            print(f"[GFS] State loaded from {filepath}")
        except Exception as e:
            print(f"[GFS] Failed to load state: {e}")

    def update_from_survey(self, survey_response: Dict[str, float]) -> None:
        """
        Update GFS from user survey response.

        Example:
            survey = {
                "material_stability": 0.6,
                "physical_health": 0.7,
                "mental_health": 0.4,
                ...
            }
            gfs.update_from_survey(survey)
        """
        self.gfs_state.update_from_user_input(survey_response)
        self.save_state()
        print("[GFS] State updated from survey response")

    def get_report(self) -> Dict:
        """Generate comprehensive GFS report"""
        return {
            "overall_flourishing": self.gfs_state.get_overall_score(),
            "dimensions": self.gfs_state.dimensions,
            "stressed_dimensions": self.gfs_state.get_stressed_dimensions(),
            "thriving_dimensions": self.gfs_state.get_thriving_dimensions(),
            "intervention_priority": self.get_intervention_priority(),
            "wellbeing_penalty": self.get_wellbeing_penalty(),
            "timestamp": self.gfs_state.timestamp,
        }


# Integration with CTM Trainer
def create_gfs_integration(storage_dir: str = "gfs_state") -> GFSIntegration:
    """Factory function"""
    return GFSIntegration(storage_dir)


if __name__ == "__main__":
    print("Testing GFS Integration...\n")

    # Test 1: Create and initialize
    print("[Test 1] Initialize GFS")
    gfs = GFSIntegration()
    print(f"  Overall flourishing: {gfs.gfs_state.get_overall_score():.2f}")

    # Test 2: Update dimensions
    print("\n[Test 2] Update dimensions")
    gfs.gfs_state.update_dimension("physical_health", 0.3)  # Stressed
    gfs.gfs_state.update_dimension("meaning_purpose", 0.8)  # Thriving
    print(f"  Physical health: {gfs.gfs_state.dimensions['physical_health']:.2f} (stressed)")
    print(f"  Meaning/purpose: {gfs.gfs_state.dimensions['meaning_purpose']:.2f} (thriving)")

    # Test 3: Flourishing modifiers
    print("\n[Test 3] Flourishing modifiers per pillar")
    for pillar in ["BIOS", "LOGOS"]:
        phi = gfs.get_flourishing_modifier(pillar)
        boost = gfs.get_emergency_boost(pillar)
        print(f"  {pillar}: phi={phi:+.3f}, emergency_boost={boost:.2f}")

    # Test 4: Intervention priority
    print("\n[Test 4] System status")
    priority = gfs.get_intervention_priority()
    penalty = gfs.get_wellbeing_penalty()
    print(f"  Priority pillar: {priority}")
    print(f"  Overall penalty scale: {penalty:.2f}x")

    # Test 5: Report
    print("\n[Test 5] Full report")
    report = gfs.get_report()
    print(f"  Overall: {report['overall_flourishing']:.2f}")
    print(f"  Stressed: {report['stressed_dimensions']}")
    print(f"  Thriving: {report['thriving_dimensions']}")

    # Test 6: Persistence
    print("\n[Test 6] Save/load state")
    gfs.save_state()
    gfs2 = GFSIntegration()
    print(f"  Loaded: Physical health = {gfs2.gfs_state.dimensions['physical_health']:.2f}")
