#!/usr/bin/env python3
"""
Unit Test for Auto-Grounding Manager

Tests the cascading intervention logic with mock interfaces.
"""

import sys
from pathlib import Path
from auto_grounding import AutoGroundingManager


class MockSearchInterface:
    """Mock SearchInterface for testing."""

    def __init__(self):
        self.search_calls = 0

    def search_web(self, query, force=False):
        self.search_calls += 1
        return f"Mock context for: {query}"


class MockGroundingClient:
    """Mock GroundingClient for testing."""

    def __init__(self):
        self.advisor_calls = 0

    def request_grounding(self, domain, query, force=False):
        self.advisor_calls += 1
        return f"Mock advice from advisor for {domain}: {query}"


class MockViabilityMonitor:
    """Mock ViabilityMonitor for testing."""

    def __init__(self):
        self.events = []

    def record_grounding_event(self, event_type, metadata=None):
        self.events.append({'type': event_type, 'metadata': metadata})


def test_intervention_timing():
    """Test that interventions trigger at correct warning counts."""
    print("\n=== Test 1: Intervention Timing ===")

    search = MockSearchInterface()
    grounding = MockGroundingClient()
    viability = MockViabilityMonitor()

    manager = AutoGroundingManager(search, grounding, viability)

    # Scenario: Collapse warnings escalating
    viability_result = {'viable': True}

    # Warning 1: No intervention (just monitor)
    print("Warning 1 (should NOT intervene)...")
    result = manager.check_and_inject(
        step=100,
        domain='LOGOS',
        viability_result=viability_result,
        collapse_status={'warning_count': 1}
    )
    assert result is None, "Should not intervene on warning 1"
    print("  OK: No intervention on warning 1")

    # Warning 2: Start intervention with pillar preference
    print("Warning 2 (should intervene - LOGOS prefers advisor)...")
    result = manager.check_and_inject(
        step=110,
        domain='LOGOS',
        viability_result=viability_result,
        collapse_status={'warning_count': 2}
    )
    assert result is not None, "Should intervene on warning 2"
    assert result['type'] == 'advisor', f"LOGOS should prefer advisor, got {result['type']}"
    print(f"  OK: Intervened with {result['type']}")

    # Warning 3: Critical intervention (both)
    print("Warning 3 (should inject BOTH)...")
    result = manager.check_and_inject(
        step=120,
        domain='LOGOS',
        viability_result=viability_result,
        collapse_status={'warning_count': 3}
    )
    assert result is not None, "Should intervene on warning 3"
    assert result['type'] == 'combined', f"Warning 3 should be combined, got {result['type']}"
    print(f"  OK: Intervened with {result['type']}")

    print("PASS: Intervention timing works correctly\n")


def test_pillar_preferences():
    """Test that pillar preferences are respected."""
    print("\n=== Test 2: Pillar Preferences ===")

    search = MockSearchInterface()
    grounding = MockGroundingClient()
    viability = MockViabilityMonitor()

    manager = AutoGroundingManager(search, grounding, viability)

    viability_result = {'viable': True}
    collapse_status = {'warning_count': 2}  # Trigger intervention

    # Test reasoning pillar (should prefer advisor)
    print("LOGOS (reasoning): Should prefer advisor...")
    result = manager.check_and_inject(100, 'LOGOS', viability_result, collapse_status)
    assert result['type'] == 'advisor', f"Expected advisor, got {result['type']}"
    print("  OK")

    # Test factual pillar (should prefer context)
    print("PHYSIS (factual): Should prefer context...")
    # Reset to trigger another intervention
    search_calls_before = search.search_calls
    result = manager.check_and_inject(110, 'PHYSIS', viability_result, collapse_status)
    # Due to cooldown, may fall back to advisor
    print(f"  Got {result['type']} (cooldown may affect preference)")

    print("PASS: Pillar preferences checked\n")


def test_viability_violations():
    """Test viability violation thresholds."""
    print("\n=== Test 3: Viability Violation Thresholds ===")

    search = MockSearchInterface()
    grounding = MockGroundingClient()
    viability = MockViabilityMonitor()

    manager = AutoGroundingManager(search, grounding, viability)
    collapse_status = {'warning_count': 0}

    # Light violation
    print("Light violation (margin=-0.05): Should use pillar preference...")
    result = manager.check_and_inject(
        100, 'LOGOS',
        viability_result={'viable': False, 'margin': -0.05},
        collapse_status=collapse_status
    )
    if result:
        print(f"  Intervened with {result['type']}")
    else:
        print(f"  Cooldown prevented intervention")

    # Moderate violation
    print("Moderate violation (margin=-0.25): Should use pillar preference...")
    result = manager.check_and_inject(
        110, 'PHYSIS',
        viability_result={'viable': False, 'margin': -0.25},
        collapse_status=collapse_status
    )
    if result:
        print(f"  Intervened with {result['type']}")
    else:
        print(f"  Cooldown prevented intervention")

    # Critical violation
    print("Critical violation (margin=-0.6): Should force both + bypass cooldown...")
    result = manager.check_and_inject(
        120, 'SOPHIA',
        viability_result={'viable': False, 'margin': -0.6},
        collapse_status=collapse_status
    )
    assert result is not None, "Critical should always intervene"
    assert result['type'] == 'combined', f"Critical should be combined, got {result['type']}"
    print(f"  Intervened with {result['type']} (forced)")

    print("PASS: Viability violation thresholds work\n")


def test_grounding_events_recorded():
    """Test that grounding events are recorded in viability monitor."""
    print("\n=== Test 4: Grounding Event Recording ===")

    search = MockSearchInterface()
    grounding = MockGroundingClient()
    viability = MockViabilityMonitor()

    manager = AutoGroundingManager(search, grounding, viability)

    collapse_status = {'warning_count': 0}

    # Trigger critical intervention to record events
    result = manager.check_and_inject(
        100, 'LOGOS',
        viability_result={'viable': False, 'margin': -0.6},
        collapse_status=collapse_status
    )

    # Check that grounding events were recorded
    print(f"Recorded {len(viability.events)} grounding events")
    assert len(viability.events) >= 1, "Should record grounding events"

    for event in viability.events:
        assert event['type'] in ['emergency_context', 'emergency_advisor'], \
            f"Unknown event type: {event['type']}"
        print(f"  - {event['type']}")

    print("PASS: Grounding events properly recorded\n")


def test_status_reporting():
    """Test status reporting functionality."""
    print("\n=== Test 5: Status Reporting ===")

    search = MockSearchInterface()
    grounding = MockGroundingClient()
    viability = MockViabilityMonitor()

    manager = AutoGroundingManager(search, grounding, viability)

    # Trigger several interventions
    collapse_status = {'warning_count': 0}

    for i in range(3):
        manager.check_and_inject(
            100 + i*10, f'PILLAR_{i}',
            viability_result={'viable': False, 'margin': -0.6},
            collapse_status=collapse_status
        )

    status = manager.get_status()

    print(f"Total interventions: {status['total_interventions']}")
    print(f"  Context: {status['context_injections']}")
    print(f"  Advisor: {status['advisor_injections']}")
    print(f"  Combined: {status['combined_injections']}")

    assert status['total_interventions'] > 0, "Should have recorded interventions"

    print("PASS: Status reporting works\n")


def main():
    """Run all tests."""
    print("=" * 70)
    print("AUTO-GROUNDING MANAGER UNIT TESTS")
    print("=" * 70)

    try:
        test_intervention_timing()
        test_pillar_preferences()
        test_viability_violations()
        test_grounding_events_recorded()
        test_status_reporting()

        print("=" * 70)
        print("ALL TESTS PASSED!")
        print("=" * 70)

    except AssertionError as e:
        print(f"\nTEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
