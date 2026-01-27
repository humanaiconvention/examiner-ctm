"""
AMER-RCL: Adaptive Multi-Expert Reasoning Curriculum Learning

A sophisticated curriculum system that adapts problem difficulty based on:
- Trajectory analysis (solution path quality)
- Skill mastery tracking (prerequisite chains)
- Cross-pillar transfer learning
- Dynamic difficulty adjustment

Architecture:
    AMERRCLCurriculum
    ├── Skill Tree Manager (prerequisite chains)
    ├── Trajectory Analyzer (solution path quality)
    ├── Difficulty Estimator (per-problem adaptive scoring)
    ├── Transfer Learning Tracker (cross-pillar skill transfer)
    └── Adaptive Sampler (difficulty-aware problem selection)

References:
- Curriculum Learning: Bengio et al. (2009)
- Multi-Task Transfer: Caruana (1997)
- Adaptive Difficulty: Graves et al. (2017)
"""

import torch
import numpy as np
from typing import Dict, List, Tuple, Optional, Set
from dataclasses import dataclass, field
from collections import defaultdict, deque
import json
from pathlib import Path
from datetime import datetime


@dataclass
class Skill:
    """Represents a learnable skill with prerequisites"""
    name: str
    pillar: str  # LOGOS, PHYSIS, etc.
    difficulty: float  # 0.0 (easy) to 1.0 (hard)
    prerequisites: List[str] = field(default_factory=list)
    mastery_threshold: float = 0.75  # Accuracy needed to consider "mastered"

    # Dynamic tracking
    attempts: int = 0
    successes: int = 0
    avg_thinking_steps: float = 0.0
    last_attempt_time: Optional[datetime] = None

    def get_mastery(self) -> float:
        """Get current mastery level (0.0-1.0)"""
        if self.attempts == 0:
            return 0.0
        return self.successes / self.attempts

    def is_mastered(self) -> bool:
        """Check if skill is mastered"""
        return self.get_mastery() >= self.mastery_threshold and self.attempts >= 5

    def update(self, success: bool, thinking_steps: int):
        """Update skill statistics"""
        self.attempts += 1
        if success:
            self.successes += 1

        # Update average thinking steps (EMA)
        alpha = 0.2
        self.avg_thinking_steps = (1 - alpha) * self.avg_thinking_steps + alpha * thinking_steps
        self.last_attempt_time = datetime.now()


@dataclass
class Problem:
    """Represents a curriculum problem with metadata"""
    problem_id: str
    pillar: str
    text: str
    solution: str
    skills_required: List[str]

    # Adaptive difficulty
    base_difficulty: float  # Initial difficulty estimate
    current_difficulty: float  # Adjusted based on performance

    # Performance tracking
    attempts: int = 0
    successes: int = 0
    avg_reward: float = 0.0

    def update_difficulty(self, success: bool, reward: float, thinking_steps: int):
        """Dynamically adjust difficulty based on performance"""
        self.attempts += 1
        if success:
            self.successes += 1

        # Update average reward (EMA)
        alpha = 0.2
        self.avg_reward = (1 - alpha) * self.avg_reward + alpha * reward

        # Adjust difficulty based on success rate
        # If too easy (success rate > 0.8), increase difficulty
        # If too hard (success rate < 0.3), decrease difficulty
        if self.attempts >= 3:
            success_rate = self.successes / self.attempts
            if success_rate > 0.8:
                self.current_difficulty = min(1.0, self.current_difficulty + 0.05)
            elif success_rate < 0.3:
                self.current_difficulty = max(0.1, self.current_difficulty - 0.05)


@dataclass
class TrajectoryStep:
    """Single step in reasoning trajectory"""
    step: int
    thought_state: str  # Text representation
    reward: float
    pillar: str
    thinking_depth: int


@dataclass
class Trajectory:
    """Complete solution trajectory with quality metrics"""
    problem_id: str
    pillar: str
    steps: List[TrajectoryStep]
    final_reward: float
    success: bool
    total_thinking_steps: int

    # Quality metrics
    reward_variance: float = 0.0  # Lower = more consistent
    efficiency: float = 0.0  # Reward per thinking step

    def compute_quality_metrics(self):
        """Compute trajectory quality metrics"""
        if not self.steps:
            return

        # Reward variance (consistency)
        rewards = [step.reward for step in self.steps]
        self.reward_variance = float(np.var(rewards))

        # Efficiency (reward per thinking step)
        if self.total_thinking_steps > 0:
            self.efficiency = self.final_reward / self.total_thinking_steps
        else:
            self.efficiency = 0.0


class SkillTree:
    """Manages skill prerequisites and mastery tracking"""

    def __init__(self):
        self.skills: Dict[str, Skill] = {}
        self.skill_graph: Dict[str, Set[str]] = defaultdict(set)  # skill -> prerequisites

    def add_skill(self, skill: Skill):
        """Add a skill to the tree"""
        self.skills[skill.name] = skill

        # Build prerequisite graph
        for prereq in skill.prerequisites:
            self.skill_graph[skill.name].add(prereq)

    def get_available_skills(self, pillar: Optional[str] = None) -> List[Skill]:
        """Get skills that are available (prerequisites met)"""
        available = []

        for skill_name, skill in self.skills.items():
            # Filter by pillar if specified
            if pillar and skill.pillar != pillar:
                continue

            # Check if prerequisites are mastered
            prereqs_met = all(
                self.skills[prereq].is_mastered()
                for prereq in skill.prerequisites
                if prereq in self.skills
            )

            if prereqs_met and not skill.is_mastered():
                available.append(skill)

        return available

    def get_skill_path(self, skill_name: str) -> List[str]:
        """Get prerequisite path to a skill (BFS)"""
        if skill_name not in self.skills:
            return []

        visited = set()
        queue = deque([skill_name])
        path = []

        while queue:
            current = queue.popleft()
            if current in visited:
                continue

            visited.add(current)
            path.append(current)

            # Add prerequisites to queue
            for prereq in self.skill_graph.get(current, []):
                if prereq not in visited:
                    queue.append(prereq)

        return path[::-1]  # Reverse to get correct order

    def get_mastery_report(self) -> Dict[str, float]:
        """Get mastery levels for all skills"""
        return {
            skill_name: skill.get_mastery()
            for skill_name, skill in self.skills.items()
        }


class TrajectoryAnalyzer:
    """Analyzes solution trajectories for quality and patterns"""

    def __init__(self, max_trajectories: int = 1000):
        self.trajectories: Dict[str, List[Trajectory]] = defaultdict(list)  # pillar -> trajectories
        self.max_trajectories = max_trajectories

    def record_trajectory(self, trajectory: Trajectory):
        """Record a trajectory for analysis"""
        trajectory.compute_quality_metrics()

        # Add to pillar-specific history
        self.trajectories[trajectory.pillar].append(trajectory)

        # Maintain rolling window
        if len(self.trajectories[trajectory.pillar]) > self.max_trajectories:
            self.trajectories[trajectory.pillar].pop(0)

    def get_average_quality(self, pillar: str, recent_n: int = 100) -> Dict[str, float]:
        """Get average trajectory quality metrics for a pillar"""
        if pillar not in self.trajectories or not self.trajectories[pillar]:
            return {"efficiency": 0.0, "consistency": 0.0, "success_rate": 0.0}

        recent = self.trajectories[pillar][-recent_n:]

        avg_efficiency = np.mean([t.efficiency for t in recent])
        avg_variance = np.mean([t.reward_variance for t in recent])
        success_rate = np.mean([1.0 if t.success else 0.0 for t in recent])

        return {
            "efficiency": float(avg_efficiency),
            "consistency": 1.0 - min(1.0, float(avg_variance)),  # Higher = more consistent
            "success_rate": float(success_rate)
        }

    def get_trend(self, pillar: str, window: int = 50) -> str:
        """Get performance trend for a pillar"""
        if pillar not in self.trajectories or len(self.trajectories[pillar]) < window * 2:
            return "stable"

        recent = self.trajectories[pillar][-window:]
        older = self.trajectories[pillar][-window*2:-window]

        recent_success = np.mean([1.0 if t.success else 0.0 for t in recent])
        older_success = np.mean([1.0 if t.success else 0.0 for t in older])

        if recent_success > older_success + 0.1:
            return "improving"
        elif recent_success < older_success - 0.1:
            return "declining"
        else:
            return "stable"


class TransferLearningTracker:
    """Tracks skill transfer across pillars"""

    def __init__(self):
        # Track which skills help with which other skills
        self.transfer_matrix: Dict[Tuple[str, str], float] = {}  # (skill_a, skill_b) -> correlation
        self.cross_pillar_benefits: Dict[Tuple[str, str], float] = {}  # (pillar_a, pillar_b) -> transfer strength

    def record_transfer(self, source_skill: str, target_skill: str, correlation: float):
        """Record transfer learning correlation between skills"""
        self.transfer_matrix[(source_skill, target_skill)] = correlation

    def record_cross_pillar_benefit(self, source_pillar: str, target_pillar: str, benefit: float):
        """Record cross-pillar transfer benefit"""
        self.cross_pillar_benefits[(source_pillar, target_pillar)] = benefit

    def get_transfer_benefit(self, source_skill: str, target_skill: str) -> float:
        """Get transfer learning benefit from source to target skill"""
        return self.transfer_matrix.get((source_skill, target_skill), 0.0)

    def get_cross_pillar_benefit(self, source_pillar: str, target_pillar: str) -> float:
        """Get cross-pillar transfer benefit"""
        return self.cross_pillar_benefits.get((source_pillar, target_pillar), 0.0)

    def suggest_next_pillar(self, current_pillar: str, available_pillars: List[str]) -> str:
        """Suggest next pillar to train based on transfer learning"""
        best_pillar = current_pillar
        best_benefit = 0.0

        for pillar in available_pillars:
            if pillar == current_pillar:
                continue

            benefit = self.get_cross_pillar_benefit(current_pillar, pillar)
            if benefit > best_benefit:
                best_benefit = benefit
                best_pillar = pillar

        return best_pillar


class AMERRCLCurriculum:
    """
    Adaptive Multi-Expert Reasoning Curriculum Learning

    Main curriculum orchestrator that coordinates:
    - Skill tree management
    - Trajectory analysis
    - Difficulty adaptation
    - Transfer learning
    - Problem selection
    """

    def __init__(
        self,
        pillars: List[str],
        storage_dir: str = "amer_rcl_state",
        trajectory_window: int = 1000,
    ):
        self.pillars = pillars
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)

        # Core components
        self.skill_tree = SkillTree()
        self.trajectory_analyzer = TrajectoryAnalyzer(max_trajectories=trajectory_window)
        self.transfer_tracker = TransferLearningTracker()

        # Problem bank
        self.problems: Dict[str, Problem] = {}  # problem_id -> Problem
        self.pillar_problems: Dict[str, List[str]] = defaultdict(list)  # pillar -> problem_ids

        # Adaptive sampling
        self.sampling_temperature: float = 1.0  # Higher = more exploration

        # Initialize default skill tree
        self._initialize_default_skills()

    def _initialize_default_skills(self):
        """Initialize default skill tree for 7 pillars"""

        # LOGOS (Logic & Math)
        self.skill_tree.add_skill(Skill("basic_arithmetic", "LOGOS", difficulty=0.2))
        self.skill_tree.add_skill(Skill("algebra", "LOGOS", difficulty=0.4, prerequisites=["basic_arithmetic"]))
        self.skill_tree.add_skill(Skill("formal_logic", "LOGOS", difficulty=0.5))
        self.skill_tree.add_skill(Skill("proofs", "LOGOS", difficulty=0.7, prerequisites=["algebra", "formal_logic"]))
        self.skill_tree.add_skill(Skill("advanced_calculus", "LOGOS", difficulty=0.8, prerequisites=["algebra"]))

        # PHYSIS (Physics)
        self.skill_tree.add_skill(Skill("kinematics", "PHYSIS", difficulty=0.3))
        self.skill_tree.add_skill(Skill("dynamics", "PHYSIS", difficulty=0.5, prerequisites=["kinematics"]))
        self.skill_tree.add_skill(Skill("thermodynamics", "PHYSIS", difficulty=0.6))
        self.skill_tree.add_skill(Skill("quantum_mechanics", "PHYSIS", difficulty=0.9, prerequisites=["dynamics"]))

        # BIOS (Biology)
        self.skill_tree.add_skill(Skill("cell_biology", "BIOS", difficulty=0.3))
        self.skill_tree.add_skill(Skill("genetics", "BIOS", difficulty=0.5, prerequisites=["cell_biology"]))
        self.skill_tree.add_skill(Skill("physiology", "BIOS", difficulty=0.6, prerequisites=["cell_biology"]))

        # NOMOS (Law)
        self.skill_tree.add_skill(Skill("legal_principles", "NOMOS", difficulty=0.4))
        self.skill_tree.add_skill(Skill("case_analysis", "NOMOS", difficulty=0.6, prerequisites=["legal_principles"]))
        self.skill_tree.add_skill(Skill("statutory_interpretation", "NOMOS", difficulty=0.7, prerequisites=["legal_principles"]))

        # PSYCHE (Psychology)
        self.skill_tree.add_skill(Skill("cognitive_basics", "PSYCHE", difficulty=0.3))
        self.skill_tree.add_skill(Skill("behavioral_analysis", "PSYCHE", difficulty=0.5, prerequisites=["cognitive_basics"]))
        self.skill_tree.add_skill(Skill("social_psychology", "PSYCHE", difficulty=0.6))

        # SOPHIA (Philosophy)
        self.skill_tree.add_skill(Skill("ethical_reasoning", "SOPHIA", difficulty=0.5))
        self.skill_tree.add_skill(Skill("metaphysics", "SOPHIA", difficulty=0.7, prerequisites=["ethical_reasoning"]))
        self.skill_tree.add_skill(Skill("epistemology", "SOPHIA", difficulty=0.7))

        # OIKOS (Economics)
        self.skill_tree.add_skill(Skill("microeconomics", "OIKOS", difficulty=0.4))
        self.skill_tree.add_skill(Skill("macroeconomics", "OIKOS", difficulty=0.5, prerequisites=["microeconomics"]))
        self.skill_tree.add_skill(Skill("game_theory", "OIKOS", difficulty=0.7, prerequisites=["microeconomics"]))

    def add_problem(self, problem: Problem):
        """Add a problem to the curriculum"""
        self.problems[problem.problem_id] = problem
        self.pillar_problems[problem.pillar].append(problem.problem_id)

    def sample_problem(self, pillar: str, current_mastery: Optional[Dict[str, float]] = None) -> Optional[Problem]:
        """
        Sample a problem for training using adaptive difficulty

        Strategy:
        1. Get available skills (prerequisites met, not mastered)
        2. Filter problems by skill requirements
        3. Score problems by difficulty match
        4. Sample with temperature-based exploration
        """
        if pillar not in self.pillar_problems or not self.pillar_problems[pillar]:
            return None

        # Get available skills for this pillar
        available_skills = self.skill_tree.get_available_skills(pillar=pillar)

        if not available_skills:
            # If all skills mastered or none available, sample from all problems
            problem_ids = self.pillar_problems[pillar]
        else:
            # Filter problems that require available skills
            available_skill_names = {skill.name for skill in available_skills}
            problem_ids = [
                pid for pid in self.pillar_problems[pillar]
                if any(skill in available_skill_names for skill in self.problems[pid].skills_required)
            ]

            if not problem_ids:
                problem_ids = self.pillar_problems[pillar]

        # Compute difficulty match scores
        # Prefer problems slightly above current mastery (zone of proximal development)
        if current_mastery:
            avg_mastery = np.mean(list(current_mastery.values()))
        else:
            avg_mastery = 0.5

        target_difficulty = min(1.0, avg_mastery + 0.1)  # Slightly above current level

        scores = []
        for pid in problem_ids:
            problem = self.problems[pid]

            # Difficulty match (prefer close to target)
            diff_match = 1.0 - abs(problem.current_difficulty - target_difficulty)

            # Diversity bonus (prefer less-attempted problems)
            diversity = 1.0 / (1.0 + problem.attempts)

            # Combine scores
            score = 0.7 * diff_match + 0.3 * diversity
            scores.append(score)

        # Temperature-based sampling
        scores = np.array(scores)
        probs = np.exp(scores / self.sampling_temperature)
        probs = probs / probs.sum()

        # Sample problem
        selected_idx = np.random.choice(len(problem_ids), p=probs)
        selected_id = problem_ids[selected_idx]

        return self.problems[selected_id]

    def record_attempt(
        self,
        problem_id: str,
        success: bool,
        reward: float,
        thinking_steps: int,
        trajectory: Optional[Trajectory] = None,
    ):
        """Record a problem attempt and update curriculum"""
        if problem_id not in self.problems:
            return

        problem = self.problems[problem_id]

        # Update problem difficulty
        problem.update_difficulty(success, reward, thinking_steps)

        # Update skill mastery
        for skill_name in problem.skills_required:
            if skill_name in self.skill_tree.skills:
                self.skill_tree.skills[skill_name].update(success, thinking_steps)

        # Record trajectory if provided
        if trajectory:
            self.trajectory_analyzer.record_trajectory(trajectory)

    def get_curriculum_state(self, pillar: Optional[str] = None) -> Dict:
        """Get current curriculum state for monitoring"""
        state = {
            "skill_mastery": self.skill_tree.get_mastery_report(),
            "available_skills": [
                skill.name for skill in self.skill_tree.get_available_skills(pillar=pillar)
            ],
        }

        if pillar:
            state["pillar"] = pillar
            state["trajectory_quality"] = self.trajectory_analyzer.get_average_quality(pillar)
            state["performance_trend"] = self.trajectory_analyzer.get_trend(pillar)

        return state

    def suggest_next_pillar(self, current_pillar: str) -> str:
        """Suggest next pillar based on transfer learning"""
        return self.transfer_tracker.suggest_next_pillar(current_pillar, self.pillars)

    def save_state(self):
        """Save curriculum state to disk"""
        state_file = self.storage_dir / "amer_rcl_state.json"

        # Serialize state
        state = {
            "skill_mastery": self.skill_tree.get_mastery_report(),
            "problem_attempts": {
                pid: {
                    "attempts": p.attempts,
                    "successes": p.successes,
                    "current_difficulty": p.current_difficulty,
                }
                for pid, p in self.problems.items()
            },
            "sampling_temperature": self.sampling_temperature,
        }

        with open(state_file, "w") as f:
            json.dump(state, f, indent=2)

    def load_state(self):
        """Load curriculum state from disk"""
        state_file = self.storage_dir / "amer_rcl_state.json"

        if not state_file.exists():
            return

        with open(state_file, "r") as f:
            state = json.load(f)

        # Restore problem attempts
        for pid, data in state.get("problem_attempts", {}).items():
            if pid in self.problems:
                self.problems[pid].attempts = data["attempts"]
                self.problems[pid].successes = data["successes"]
                self.problems[pid].current_difficulty = data["current_difficulty"]

        # Restore sampling temperature
        self.sampling_temperature = state.get("sampling_temperature", 1.0)


# Factory function
def create_amer_rcl_curriculum(
    pillars: List[str],
    storage_dir: str = "amer_rcl_state",
) -> AMERRCLCurriculum:
    """Create AMER-RCL curriculum instance"""
    curriculum = AMERRCLCurriculum(pillars, storage_dir)
    curriculum.load_state()
    return curriculum


if __name__ == "__main__":
    print("AMER-RCL Curriculum System")
    print("Adaptive Multi-Expert Reasoning Curriculum Learning")
    print("\nFeatures:")
    print("  - Skill tree with prerequisite chains")
    print("  - Trajectory-based quality analysis")
    print("  - Adaptive difficulty adjustment")
    print("  - Cross-pillar transfer learning")
    print("  - Zone of proximal development sampling")
    print("\nUsage:")
    print("  curriculum = create_amer_rcl_curriculum(pillars=['LOGOS', ...])")
    print("  problem = curriculum.sample_problem('LOGOS', current_mastery)")
    print("  curriculum.record_attempt(problem_id, success, reward, steps, trajectory)")
