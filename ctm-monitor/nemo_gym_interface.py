"""
Custom GymEnv Interface (v5.0)
Wraps CTM specialists as standard gym.Env for standardized RL.

Provides:
- Standard gym.Env API (reset, step, done, reward)
- Multi-agent orchestration
- Automatic logging and telemetry
- Foundation for NeMo Gym integration

Compatible with:
- Gymnasium 0.29+ (preferred)
- OpenAI Gym 0.26+ (legacy)
- NVIDIA NeMo
- Standard RL algorithms (PPO, GRPO, A3C, etc.)
"""

import numpy as np
import torch
from typing import Tuple, Dict, Any, Optional
from dataclasses import dataclass
import json
from pathlib import Path
from datetime import datetime

# Gymnasium (modern) or gym (legacy) import
try:
    import gymnasium as gym
    from gymnasium import spaces
except ImportError:
    import gym
    from gym import spaces


@dataclass
class EpisodeMetrics:
    """Track per-episode metrics"""
    episode_id: int
    pillar: str
    steps: int
    total_reward: float
    avg_reward: float
    episode_length: int
    success: bool
    timestamp: str


class CTMPillarEnvironment(gym.Env):
    """
    Gym environment wrapping a CTM specialist (pillar).

    Standard gym.Env interface:
    - observation_space: Box (text embeddings)
    - action_space: Discrete (think steps)
    - reset(): Start new episode with curriculum problem
    - step(action): Execute thinking step, receive reward
    - done: Terminal condition (solve problem or max steps)
    """

    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        pillar: str,
        model: torch.nn.Module,
        curriculum: "ReasoningCurriculum",
        semantic_reward,
        max_steps: int = 100,
        device: str = "cuda",
    ):
        """
        Initialize pillar environment.

        Args:
            pillar: Pillar name (LOGOS, PHYSIS, BIOS, NOMOS, PSYCHE, SOPHIA, OIKOS)
            model: CTM model
            curriculum: ReasoningCurriculum instance
            semantic_reward: Reward function
            max_steps: Maximum steps per episode
            device: Computation device (cuda/cpu)
        """
        super().__init__()

        self.pillar = pillar
        self.model = model
        self.curriculum = curriculum
        self.semantic_reward = semantic_reward
        self.max_steps = max_steps
        self.device = device

        # Gym spaces
        # Observation: Embedding of current thought (d_model,)
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(model.d_model,), dtype=np.float32
        )

        # Action: Number of thinking steps (1 to max_steps)
        self.action_space = spaces.Discrete(max_steps)

        # Episode state
        self.current_problem = None
        self.current_thought = ""
        self.step_count = 0
        self.episode_reward = 0.0
        self.episode_id = 0

        # Metrics
        self.episode_metrics = []

    def reset(self) -> np.ndarray:
        """
        Reset environment to start new episode.

        Returns:
            Initial observation (embedding of problem statement)
        """
        self.episode_id += 1
        self.step_count = 0
        self.episode_reward = 0.0

        # Sample problem from curriculum
        self.current_problem = self.curriculum.get_problem(self.pillar)

        # Initialize thought with problem statement
        self.current_thought = self.current_problem["question"]

        # Get embedding as observation
        observation = self._get_observation()

        return observation

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, Dict[str, Any]]:
        """
        Execute one step in the environment.

        Args:
            action: Number of thinking steps (0 to max_steps-1)

        Returns:
            observation: Next observation (embedding)
            reward: Reward for this step
            done: Whether episode is terminal
            info: Additional information
        """
        self.step_count += 1

        # Execute thinking
        num_steps = action + 1  # Action 0 = 1 step, etc.
        for _ in range(num_steps):
            self.current_thought = self.model.think(self.current_thought, self.pillar)

        # Compute reward
        reward = float(
            self.semantic_reward.compute(
                output=self.current_thought,
                expected=self.current_problem.get("answer", ""),
                context=self.current_problem.get("context", ""),
            )
        )

        self.episode_reward += reward

        # Check terminal conditions
        done = self._is_terminal()

        # Get next observation
        observation = self._get_observation()

        # Info for logging
        info = {
            "pillar": self.pillar,
            "step": self.step_count,
            "reward": reward,
            "episode_reward": self.episode_reward,
            "episode_id": self.episode_id,
            "done": done,
        }

        return observation, reward, done, info

    def _is_terminal(self) -> bool:
        """Check if episode is done"""
        if self.step_count >= self.max_steps:
            return True

        # Check if solved (similarity > threshold)
        similarity = float(self.semantic_reward.last_similarity)
        if similarity > 0.85:
            return True

        return False

    def _get_observation(self) -> np.ndarray:
        """Get embedding of current thought as observation"""
        with torch.no_grad():
            # Encode thought to embedding
            inputs = self.model.tokenizer(
                self.current_thought,
                return_tensors="pt",
                truncation=True,
                max_length=512,
            ).to(self.device)

            outputs = self.model(inputs.input_ids)
            embedding = outputs.mean(dim=1)[0].cpu().numpy()

        return embedding.astype(np.float32)

    def render(self, mode: str = "human") -> None:
        """Render current episode state"""
        if mode == "human":
            print(f"\n[{self.pillar}] Episode {self.episode_id}, Step {self.step_count}")
            print(f"Thought: {self.current_thought[:200]}...")
            print(f"Episode Reward: {self.episode_reward:.4f}")

    def get_metrics(self) -> Dict[str, Any]:
        """Get current episode metrics"""
        return {
            "episode_id": self.episode_id,
            "pillar": self.pillar,
            "steps": self.step_count,
            "total_reward": self.episode_reward,
            "avg_reward": self.episode_reward / max(self.step_count, 1),
            "success": self._is_terminal() and self.step_count < self.max_steps,
        }

    def close(self) -> None:
        """Cleanup"""
        pass


class MultiPillarEnvironment(gym.Env):
    """
    Multi-agent environment coordinating all 7 pillars.

    Manages:
    - Pillar environment orchestration
    - Load balancing between pillars
    - Shared reward aggregation
    - Cross-pillar metrics
    """

    def __init__(
        self,
        model: torch.nn.Module,
        curriculum: "ReasoningCurriculum",
        semantic_reward,
        max_steps: int = 100,
        device: str = "cuda",
    ):
        """Initialize multi-pillar environment"""
        super().__init__()

        self.pillars = ["LOGOS", "PHYSIS", "BIOS", "NOMOS", "PSYCHE", "SOPHIA", "OIKOS"]
        self.device = device

        # Create individual pillar environments
        self.environments = {
            pillar: CTMPillarEnvironment(
                pillar=pillar,
                model=model,
                curriculum=curriculum,
                semantic_reward=semantic_reward,
                max_steps=max_steps,
                device=device,
            )
            for pillar in self.pillars
        }

        # Current active pillar (round-robin)
        self.current_pillar_idx = 0

        # Aggregated metrics
        self.episode_rewards = {pillar: [] for pillar in self.pillars}
        self.episode_steps = {pillar: [] for pillar in self.pillars}

    def reset(self) -> Dict[str, np.ndarray]:
        """Reset all pillar environments"""
        observations = {}
        for pillar, env in self.environments.items():
            observations[pillar] = env.reset()
        return observations

    def step(self, actions: Dict[str, int]) -> Tuple[Dict, Dict, Dict, Dict]:
        """
        Execute one step across all pillars.

        Args:
            actions: Dict mapping pillar -> action

        Returns:
            observations, rewards, dones, infos
        """
        observations = {}
        rewards = {}
        dones = {}
        infos = {}

        for pillar, action in actions.items():
            obs, reward, done, info = self.environments[pillar].step(action)
            observations[pillar] = obs
            rewards[pillar] = reward
            dones[pillar] = done
            infos[pillar] = info

            # Track metrics
            if done:
                metrics = self.environments[pillar].get_metrics()
                self.episode_rewards[pillar].append(metrics["total_reward"])
                self.episode_steps[pillar].append(metrics["steps"])

        return observations, rewards, dones, infos

    def get_aggregate_metrics(self) -> Dict[str, Any]:
        """Get metrics across all pillars"""
        metrics = {}
        for pillar in self.pillars:
            if self.episode_rewards[pillar]:
                metrics[pillar] = {
                    "avg_reward": np.mean(self.episode_rewards[pillar]),
                    "avg_steps": np.mean(self.episode_steps[pillar]),
                    "episodes": len(self.episode_rewards[pillar]),
                }

        return metrics

    def render(self, mode: str = "human") -> None:
        """Render all pillar states"""
        if mode == "human":
            print("\n=== Multi-Pillar Status ===")
            for pillar, env in self.environments.items():
                metrics = env.get_metrics()
                print(f"{pillar}: Episode {metrics['episode_id']}, "
                      f"Steps {metrics['steps']}, Reward {metrics['total_reward']:.4f}")

    def close(self) -> None:
        """Cleanup all environments"""
        for env in self.environments.values():
            env.close()


class GymEnvironmentManager:
    """
    Central manager for gym environments and orchestration.
    """

    def __init__(
        self,
        model: torch.nn.Module,
        curriculum: "ReasoningCurriculum",
        semantic_reward,
        device: str = "cuda",
    ):
        """Initialize environment manager"""
        self.model = model
        self.curriculum = curriculum
        self.semantic_reward = semantic_reward
        self.device = device

        # Multi-pillar environment
        self.multi_env = MultiPillarEnvironment(
            model=model,
            curriculum=curriculum,
            semantic_reward=semantic_reward,
            device=device,
        )

        # Logging
        self.log_dir = Path("nemo_gym_logs")
        self.log_dir.mkdir(exist_ok=True)

    def run_episode_batch(self, num_episodes: int) -> Dict[str, Any]:
        """
        Run batch of episodes across all pillars.

        Args:
            num_episodes: Number of episodes per pillar

        Returns:
            Aggregated metrics and statistics
        """
        observations = self.multi_env.reset()

        all_metrics = {pillar: [] for pillar in self.multi_env.pillars}

        for episode in range(num_episodes):
            # Sample actions for each pillar (random for now)
            actions = {
                pillar: self.multi_env.environments[pillar].action_space.sample()
                for pillar in self.multi_env.pillars
            }

            # Execute step
            observations, rewards, dones, infos = self.multi_env.step(actions)

            # Track metrics
            for pillar in self.multi_env.pillars:
                if dones[pillar]:
                    metrics = self.multi_env.environments[pillar].get_metrics()
                    all_metrics[pillar].append(metrics)

                    # Reset pillar environment
                    observations[pillar] = self.multi_env.environments[pillar].reset()

        # Aggregate results
        results = {
            "total_episodes": num_episodes * len(self.multi_env.pillars),
            "pillars": {}
        }

        for pillar in self.multi_env.pillars:
            if all_metrics[pillar]:
                rewards = [m["total_reward"] for m in all_metrics[pillar]]
                steps = [m["steps"] for m in all_metrics[pillar]]

                results["pillars"][pillar] = {
                    "episodes": len(all_metrics[pillar]),
                    "avg_reward": float(np.mean(rewards)),
                    "avg_steps": float(np.mean(steps)),
                    "max_reward": float(np.max(rewards)),
                    "min_reward": float(np.min(rewards)),
                }

        return results

    def log_episode_metrics(self, metrics: Dict[str, Any]) -> None:
        """Log episode metrics to file"""
        log_file = self.log_dir / f"metrics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

        with open(log_file, "w") as f:
            json.dump(metrics, f, indent=2)

        print(f"[GymEnv] Metrics logged to {log_file}")

    def export_environment_config(self) -> Dict[str, Any]:
        """Export environment configuration"""
        return {
            "pillars": self.multi_env.pillars,
            "observation_space": {
                "type": "Box",
                "shape": self.multi_env.environments["LOGOS"].observation_space.shape,
                "dtype": str(self.multi_env.environments["LOGOS"].observation_space.dtype),
            },
            "action_space": {
                "type": "Discrete",
                "n": self.multi_env.environments["LOGOS"].action_space.n,
            },
            "device": self.device,
        }


# Factory functions
def create_pillar_environment(
    pillar: str,
    model: torch.nn.Module,
    curriculum,
    semantic_reward,
    max_steps: int = 100,
) -> CTMPillarEnvironment:
    """Create single pillar gym environment"""
    return CTMPillarEnvironment(
        pillar=pillar,
        model=model,
        curriculum=curriculum,
        semantic_reward=semantic_reward,
        max_steps=max_steps,
    )


def create_multi_pillar_environment(
    model: torch.nn.Module,
    curriculum,
    semantic_reward,
    max_steps: int = 100,
) -> MultiPillarEnvironment:
    """Create multi-pillar gym environment"""
    return MultiPillarEnvironment(
        model=model,
        curriculum=curriculum,
        semantic_reward=semantic_reward,
        max_steps=max_steps,
    )


def create_gym_manager(
    model: torch.nn.Module,
    curriculum,
    semantic_reward,
) -> GymEnvironmentManager:
    """Create gym environment manager"""
    return GymEnvironmentManager(
        model=model,
        curriculum=curriculum,
        semantic_reward=semantic_reward,
    )


if __name__ == "__main__":
    print("Gym Environment Interface (v5.0)")
    print("Provides standard gym.Env API for CTM pillars")
    print("\nUsage:")
    print("  env = create_pillar_environment('LOGOS', model, curriculum, reward)")
    print("  obs = env.reset()")
    print("  obs, reward, done, info = env.step(action)")
    print("\nAll 7 pillars are gym.Env compatible and can be used with")
    print("standard RL algorithms (PPO, GRPO, A3C, etc.)")
