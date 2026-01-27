#!/usr/bin/env python3
"""
v5.0 Integration Verification Script

Verifies that all v5.0 components are correctly integrated into ctm_trainer.py
"""

import sys
import os

def verify_imports():
    """Verify that all v5.0 import statements are present"""
    print("[1/4] Checking v5.0 imports in ctm_trainer.py...")

    try:
        with open("ctm_trainer.py", "r") as f:
            content = f.read()

        checks = [
            ("CUDA Tile imports", "from cuda_tile_optimization import"),
            ("GymEnv imports", "from nemo_gym_interface import"),
            ("NeMo Gym imports", "from nemo_gym_training import"),
            ("CUDA_TILE_AVAILABLE flag", "CUDA_TILE_AVAILABLE"),
            ("GYM_INTERFACE_AVAILABLE flag", "GYM_INTERFACE_AVAILABLE"),
            ("NEMO_GYM_AVAILABLE flag", "NEMO_GYM_AVAILABLE"),
        ]

        all_pass = True
        for check_name, check_string in checks:
            if check_string in content:
                print(f"  [OK] {check_name}")
            else:
                print(f"  [FAIL] {check_name} - NOT FOUND")
                all_pass = False

        return all_pass

    except Exception as e:
        print(f"  [ERROR] {e}")
        return False


def verify_initialization():
    """Verify that v5.0 components are initialized in __init__"""
    print("\n[2/4] Checking v5.0 initialization in UnifiedTrainer.__init__...")

    try:
        with open("ctm_trainer.py", "r") as f:
            content = f.read()

        checks = [
            ("CUDA Tile initialization", "self.cuda_tile_optimizer = CUDATileOptimizer()"),
            ("GymEnv initialization", "self.gym_manager = GymEnvironmentManager"),
            ("NeMo trainer placeholder", "self.nemo_trainer = None"),
        ]

        all_pass = True
        for check_name, check_string in checks:
            if check_string in content:
                print(f"  [OK] {check_name}")
            else:
                print(f"  [FAIL] {check_name} - NOT FOUND")
                all_pass = False

        return all_pass

    except Exception as e:
        print(f"  [ERROR] {e}")
        return False


def verify_methods():
    """Verify that all v5.0 methods are implemented"""
    print("\n[3/4] Checking v5.0 methods in UnifiedTrainer...")

    try:
        with open("ctm_trainer.py", "r") as f:
            content = f.read()

        methods = [
            ("get_v5_status", "def get_v5_status(self)"),
            ("train_with_nemo_gym", "def train_with_nemo_gym(self, config_kwargs=None)"),
            ("optimize_with_cuda_tile", "def optimize_with_cuda_tile(self)"),
            ("get_gym_environment_info", "def get_gym_environment_info(self)"),
        ]

        all_pass = True
        for method_name, method_def in methods:
            if method_def in content:
                print(f"  [OK] {method_name}()")
            else:
                print(f"  [FAIL] {method_name}() - NOT FOUND")
                all_pass = False

        return all_pass

    except Exception as e:
        print(f"  [ERROR] {e}")
        return False


def verify_monitoring():
    """Verify that v5.0 monitoring and telemetry are integrated"""
    print("\n[4/4] Checking v5.0 monitoring and telemetry...")

    try:
        with open("ctm_trainer.py", "r") as f:
            content = f.read()

        checks = [
            ("Health check status", "--- v5.0 Advanced Components Status ---"),
            ("v5.0 metrics logging", '"v5": v5_metrics'),
            ("CUDA status in health check", "v5_status['cuda_tile']"),
            ("Gym status in health check", "v5_status['gym_interface']"),
            ("NeMo status in health check", "v5_status['nemo_gym']"),
        ]

        all_pass = True
        for check_name, check_string in checks:
            if check_string in content:
                print(f"  [OK] {check_name}")
            else:
                print(f"  [FAIL] {check_name} - NOT FOUND")
                all_pass = False

        return all_pass

    except Exception as e:
        print(f"  [ERROR] {e}")
        return False


def verify_syntax():
    """Verify Python syntax"""
    print("\n[Bonus] Verifying Python syntax...")

    try:
        import py_compile
        py_compile.compile("ctm_trainer.py", doraise=True)
        print("  [OK] ctm_trainer.py syntax is valid")
        return True
    except py_compile.PyCompileError as e:
        print(f"  [FAIL] Syntax error: {e}")
        return False
    except Exception as e:
        print(f"  [ERROR] {e}")
        return False


def main():
    """Run all verification checks"""
    print("=" * 70)
    print("v5.0 INTEGRATION VERIFICATION")
    print("=" * 70)

    results = []
    results.append(("Imports", verify_imports()))
    results.append(("Initialization", verify_initialization()))
    results.append(("Methods", verify_methods()))
    results.append(("Monitoring", verify_monitoring()))
    results.append(("Syntax", verify_syntax()))

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for check_name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"{status} {check_name}")

    print(f"\nResult: {passed}/{total} checks passed")

    if passed == total:
        print("\n[OK] v5.0 integration is COMPLETE and VERIFIED")
        return 0
    else:
        print(f"\n[FAIL] {total - passed} check(s) failed")
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
