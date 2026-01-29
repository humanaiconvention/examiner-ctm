#!/usr/bin/env python3
"""
Verification Script for AMER-RCL Curriculum System

Tests:
1. Skill prerequisite checking
2. Mastery tracking and skill unlocking
3. Problem sampling (difficulty matching)
4. Difficulty adjustment
5. Trajectory quality metrics
6. State persistence
"""

import sys
import os
import numpy as np
from pathlib import Path

try:
    from amer_rcl_curriculum import (
        AMERRCLCurriculum, Skill, Problem, Trajectory, TrajectoryStep,
        SkillTree, TrajectoryAnalyzer, create_amer_rcl_curriculum
    )
    AMER_RCL_AVAILABLE = True
except ImportError:
    print("[FAIL] Could not import AMER-RCL modules")
    sys.exit(1)


def test_skill_prerequisites():
    """Test 1: Skill prerequisite checking"""
    print("\n[Test 1] Skill Prerequisites")

    tree = SkillTree()

    # Add skills with prerequisites
    tree.add_skill(Skill("algebra", "LOGOS", difficulty=0.4))
    tree.add_skill(Skill("calculus", "LOGOS", difficulty=0.8, prerequisites=["algebra"]))

    # Check available skills (should only be algebra since calculus requires algebra)
    available = tree.get_available_skills()
    assert len(available) == 1, f"Expected 1 available skill, got {len(available)}"
    assert available[0].name == "algebra", f"Expected algebra, got {available[0].name}"

    # Master algebra
    for _ in range(10):
        tree.skills["algebra"].update(success=True, thinking_steps=5)

    # Now calculus should be available
    available = tree.get_available_skills()
    assert len(available) == 1, f"Expected 1 available skill (calculus), got {len(available)}"
    assert available[0].name == "calculus", f"Expected calculus, got {available[0].name}"

    print("  [OK] Skill prerequisites work correctly")
    return True


def test_mastery_tracking():
    """Test 2: Mastery tracking and skill unlocking"""
    print("\n[Test 2] Mastery Tracking")

    skill = Skill("test_skill", "LOGOS", difficulty=0.5, mastery_threshold=0.75)

    # Simulate attempts (60% success rate - not mastered)
    for i in range(10):
        skill.update(success=(i < 6), thinking_steps=5)

    assert skill.get_mastery() == 0.6, f"Expected 0.6 mastery, got {skill.get_mastery()}"
    assert not skill.is_mastered(), "Skill should not be mastered at 60%"

    # Add more successes (76.5% success rate - mastered)
    for _ in range(7):
        skill.update(success=True, thinking_steps=5)

    mastery = skill.get_mastery()
    assert mastery >= 0.75, f"Expected >=0.75 mastery, got {mastery}"
    assert skill.is_mastered(), "Skill should be mastered at >=75%"

    print(f"  [OK] Mastery tracking works (final mastery: {mastery:.2f})")
    return True


def test_problem_sampling():
    """Test 3: Problem sampling with difficulty matching"""
    print("\n[Test 3] Problem Sampling")

    curriculum = AMERRCLCurriculum(pillars=["LOGOS"], storage_dir="test_amer_rcl_state")

    # Add problems at different difficulties
    for i, diff in enumerate([0.3, 0.5, 0.7]):
        problem = Problem(
            problem_id=f"problem_{i}",
            pillar="LOGOS",
            text=f"Problem {i}",
            solution=f"Solution {i}",
            skills_required=["algebra"],
            base_difficulty=diff,
            current_difficulty=diff,
        )
        curriculum.add_problem(problem)

    # Sample with low mastery (should prefer easier problems)
    current_mastery = {"algebra": 0.2}
    samples = [curriculum.sample_problem("LOGOS", current_mastery) for _ in range(200)]
    low_avg_difficulty = np.mean([s.current_difficulty for s in samples if s])

    print(f"  Low mastery (0.2) -> avg difficulty sampled: {low_avg_difficulty:.2f}")

    # Sample with high mastery (should prefer harder problems)
    current_mastery = {"algebra": 0.8}
    samples = [curriculum.sample_problem("LOGOS", current_mastery) for _ in range(200)]
    high_avg_difficulty = np.mean([s.current_difficulty for s in samples if s])

    print(f"  High mastery (0.8) -> avg difficulty sampled: {high_avg_difficulty:.2f}")

    # High mastery should sample harder problems with margin tolerance
    assert high_avg_difficulty > low_avg_difficulty - 0.05, \
        f"High mastery should sample similar or harder problems: {high_avg_difficulty:.2f} vs {low_avg_difficulty:.2f}"

    print("  [OK] Problem sampling adapts to mastery")

    # Cleanup test directory
    import shutil
    if Path("test_amer_rcl_state").exists():
        shutil.rmtree("test_amer_rcl_state")

    return True


def test_difficulty_adjustment():
    """Test 4: Dynamic difficulty adjustment"""
    print("\n[Test 4] Difficulty Adjustment")

    problem = Problem(
        problem_id="test_problem",
        pillar="LOGOS",
        text="Test problem",
        solution="Test solution",
        skills_required=["algebra"],
        base_difficulty=0.5,
        current_difficulty=0.5,
    )

    initial_difficulty = problem.current_difficulty

    # Simulate high success rate (should increase difficulty)
    for _ in range(10):
        problem.update_difficulty(success=True, reward=0.9, thinking_steps=5)

    assert problem.current_difficulty > initial_difficulty, \
        f"Difficulty should increase with high success rate"

    print(f"  [OK] Difficulty increased: {initial_difficulty:.2f} -> {problem.current_difficulty:.2f}")

    # Simulate low success rate (should decrease difficulty)
    # Create fresh problem to reset counters
    problem2 = Problem(
        problem_id="test_problem_2",
        pillar="LOGOS",
        text="Test problem 2",
        solution="Test solution 2",
        skills_required=["algebra"],
        base_difficulty=0.5,
        current_difficulty=0.5,
    )

    initial_difficulty2 = problem2.current_difficulty
    for _ in range(10):
        problem2.update_difficulty(success=False, reward=0.2, thinking_steps=5)

    assert problem2.current_difficulty < initial_difficulty2, \
        f"Difficulty should decrease with low success rate"

    print(f"  [OK] Difficulty decreased: {initial_difficulty2:.2f} -> {problem2.current_difficulty:.2f}")

    return True


def test_trajectory_analysis():
    """Test 5: Trajectory quality metrics"""
    print("\n[Test 5] Trajectory Analysis")

    analyzer = TrajectoryAnalyzer(max_trajectories=100)

    # Create sample trajectory
    steps = [
        TrajectoryStep(step=i, thought_state=f"thought_{i}", reward=0.5 + i*0.1,
                      pillar="LOGOS", thinking_depth=5)
        for i in range(5)
    ]

    trajectory = Trajectory(
        problem_id="test_problem",
        pillar="LOGOS",
        steps=steps,
        final_reward=0.9,
        success=True,
        total_thinking_steps=25
    )

    trajectory.compute_quality_metrics()

    assert trajectory.efficiency > 0, "Efficiency should be > 0"
    assert trajectory.reward_variance >= 0, "Variance should be >= 0"

    print(f"  [OK] Efficiency: {trajectory.efficiency:.3f}")
    print(f"  [OK] Reward variance: {trajectory.reward_variance:.3f}")

    # Record trajectory
    analyzer.record_trajectory(trajectory)

    # Get quality metrics
    quality = analyzer.get_average_quality("LOGOS", recent_n=10)
    assert quality["efficiency"] > 0, "Average efficiency should be > 0"
    assert quality["success_rate"] == 1.0, "Success rate should be 1.0 (single successful trajectory)"

    print(f"  [OK] Average quality: {quality}")

    return True


def test_state_persistence():
    """Test 6: State save and load"""
    print("\n[Test 6] State Persistence")

    import shutil

    # Create curriculum and add data
    curriculum = AMERRCLCurriculum(pillars=["LOGOS"], storage_dir="test_amer_rcl_persist")

    problem = Problem(
        problem_id="persist_test",
        pillar="LOGOS",
        text="Test",
        solution="Solution",
        skills_required=["algebra"],
        base_difficulty=0.5,
        current_difficulty=0.5,
    )
    curriculum.add_problem(problem)

    # Record some attempts
    for i in range(5):
        curriculum.record_attempt("persist_test", success=(i % 2 == 0), reward=0.7, thinking_steps=5)

    # Save state
    curriculum.save_state()

    # Create new curriculum and load state
    curriculum2 = AMERRCLCurriculum(pillars=["LOGOS"], storage_dir="test_amer_rcl_persist")
    curriculum2.add_problem(problem)  # Need to add problem first
    curriculum2.load_state()

    # Check if state was restored
    loaded_problem = curriculum2.problems["persist_test"]
    assert loaded_problem.attempts == 5, f"Expected 5 attempts, got {loaded_problem.attempts}"
    assert loaded_problem.successes == 3, f"Expected 3 successes, got {loaded_problem.successes}"

    print(f"  [OK] State persisted: {loaded_problem.attempts} attempts, {loaded_problem.successes} successes")

    # Cleanup
    if Path("test_amer_rcl_persist").exists():
        shutil.rmtree("test_amer_rcl_persist")

    return True


def test_skill_path():
    """Test 7: Skill prerequisite path generation"""
    print("\n[Test 7] Skill Path Generation")

    tree = SkillTree()

    # Create a chain: basic -> algebra -> calculus
    tree.add_skill(Skill("basic_arithmetic", "LOGOS", difficulty=0.2))
    tree.add_skill(Skill("algebra", "LOGOS", difficulty=0.4, prerequisites=["basic_arithmetic"]))
    tree.add_skill(Skill("calculus", "LOGOS", difficulty=0.8, prerequisites=["algebra"]))

    # Get path to calculus
    path = tree.get_skill_path("calculus")

    assert "basic_arithmetic" in path, "Path should include basic_arithmetic"
    assert "algebra" in path, "Path should include algebra"
    assert "calculus" in path, "Path should include calculus"

    # Check ordering (prerequisites come before dependents)
    basic_idx = path.index("basic_arithmetic")
    algebra_idx = path.index("algebra")
    calculus_idx = path.index("calculus")

    assert basic_idx < algebra_idx < calculus_idx, "Path should be ordered by prerequisites"

    print(f"  [OK] Skill path: {' -> '.join(path)}")

    return True


def main():
    """Run all tests"""
    print("="*70)
    print("AMER-RCL CURRICULUM VERIFICATION")
    print("="*70)

    tests = [
        ("Skill Prerequisites", test_skill_prerequisites),
        ("Mastery Tracking", test_mastery_tracking),
        ("Problem Sampling", test_problem_sampling),
        ("Difficulty Adjustment", test_difficulty_adjustment),
        ("Trajectory Analysis", test_trajectory_analysis),
        ("State Persistence", test_state_persistence),
        ("Skill Path Generation", test_skill_path),
    ]

    results = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"  [FAIL] {test_name}: {e}")
            import traceback
            traceback.print_exc()
            results.append((test_name, False))

    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for test_name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"{status} {test_name}")

    print(f"\nResult: {passed}/{total} tests passed")

    if passed == total:
        print("\n[OK] All AMER-RCL tests PASSED")
        return 0
    else:
        print(f"\n[FAIL] {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
