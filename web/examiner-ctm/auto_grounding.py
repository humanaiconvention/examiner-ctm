"""
Auto-Grounding Injection System for Collapse Prevention

Implements cascading intervention strategy when collapse signatures or viability
violations are detected. Automatically injects external grounding BEFORE resorting
to training pause.

Design Philosophy: C_eff(t) >= E(t) - actively increase corrective bandwidth
before giving up (Haslam, 2025).

Key Features:
- Moderate intervention timing (start at warning 2, pause at warning 3)
- Adaptive rate limiting (respect cooldowns except critical violations)
- Pillar-specific intervention preferences
- Automatic fallback strategies when preferred method is on cooldown
"""

import time
import json
from typing import Optional, Dict, Any
from pathlib import Path
from datetime import datetime


class AutoGroundingManager:
    """
    Orchestrates emergency grounding injections based on collapse signatures
    or viability violations.

    Two main triggers:
    1. Viability violations (C_eff < E) - proactive, every 10 steps
    2. Collapse warnings - reactive, when reward/loss divergence detected

    Three intervention levels:
    - Light: Context search (low cost, fast)
    - Moderate: Advisor ensemble (higher cost, more power)
    - Critical: Both + force bypass (maximum corrective bandwidth)
    """

    def __init__(
        self,
        search_interface,
        grounding_client,
        viability_monitor,
        log_file: str = "auto_grounding.jsonl"
    ):
        """
        Initialize Auto-Grounding Manager.

        Args:
            search_interface: SearchInterface instance for web searches
            grounding_client: GroundingClient instance for advisor queries
            viability_monitor: ViabilityMonitor instance for C_eff/E(t) tracking
            log_file: Path for intervention logging
        """
        self.search = search_interface
        self.grounding = grounding_client
        self.viability = viability_monitor
        self.log_file = Path(log_file)

        # Intervention severity thresholds (C_eff - E margin)
        self.thresholds = {
            'light': -0.1,          # Minor viability violation
            'moderate': -0.3,       # Moderate viability violation
            'critical': -0.5        # Critical violation
        }

        # Cooldown tracking (adaptive - bypass for critical only)
        self.last_context_injection = 0.0
        self.last_advisor_injection = 0.0
        self.context_cooldown = 60.0  # seconds
        self.advisor_cooldown = 120.0  # seconds

        # Pillar-specific preferences (USER CONFIRMED)
        # Reasoning pillars prefer advisor (5 model ensemble)
        # Factual pillars prefer context (web search)
        self.pillar_preferences = {
            'LOGOS': 'advisor',     # Formal logic -> reasoning models
            'SOPHIA': 'advisor',    # Wisdom -> philosophical reasoning
            'PHYSIS': 'context',    # Nature -> material facts
            'BIOS': 'context',      # Life -> biological facts
            'NOMOS': 'advisor',     # Law -> jurisprudential reasoning
            'PSYCHE': 'advisor',    # Mind -> affective/cognitive heuristics
            'OIKOS': 'context'      # Economics -> scarcity data
        }

        # Intervention statistics
        self.interventions = {
            'context': 0,
            'advisor': 0,
            'combined': 0,
            'fallback_to_advisor': 0,
            'fallback_to_context': 0
        }
        self.intervention_history = []

    def check_and_inject(
        self,
        step: int,
        domain: str,
        viability_result: Dict[str, Any],
        collapse_status: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Main entry point - check if intervention needed and inject grounding.

        Called from two places:
        1. Viability monitor (every 10 steps) - proactive C_eff < E detection
        2. Collapse detector callback (warning #2, #3) - reactive divergence detection

        Priority:
        1. Viability violations (C_eff < E margin)
        2. Collapse signature warnings (reward/loss divergence)

        Args:
            step: Current training step
            domain: Active pillar/domain name
            viability_result: From viability_monitor.check_viability()
                Contains: 'viable', 'c_eff', 'e_total', 'margin', 'components'
            collapse_status: From collapse_detector.get_status()
                Contains: 'warning_count', 'is_paused', 'reward_trend', 'loss_trend'

        Returns:
            Dict with intervention details:
            {
                'type': 'context'|'advisor'|'combined',
                'reason': description of why intervened,
                'step': step number,
                'domain': domain name,
                'context': (if type='context' or 'combined'),
                'advice': (if type='advisor' or 'combined')
            }
            Or None if no intervention triggered.
        """

        # Priority 1: Viability violations (C_eff < E)
        # These are structural problems with corrective capacity
        if not viability_result['viable']:
            margin = viability_result['margin']

            if margin < self.thresholds['critical']:
                # Critical: Force both context + advisor, bypass rate limits
                return self._inject_combined(
                    step=step,
                    domain=domain,
                    reason='critical_viability',
                    force=True  # ADAPTIVE: bypass cooldowns for critical
                )

            elif margin < self.thresholds['moderate']:
                # Moderate: Use pillar preference, respect cooldowns
                return self._inject_pillar_preferred(
                    step=step,
                    domain=domain,
                    reason='moderate_viability'
                )

            elif margin < self.thresholds['light']:
                # Light: Use pillar preference, respect cooldowns
                return self._inject_pillar_preferred(
                    step=step,
                    domain=domain,
                    reason='light_viability'
                )

        # Priority 2: Collapse signature warnings (USER: moderate timing)
        # Only trigger intervention on warning #2+, pause on #3+
        warning_count = collapse_status.get('warning_count', 0)

        if warning_count == 1:
            # First warning: Monitor only, no intervention yet
            return None

        elif warning_count == 2:
            # Second warning: Start intervention using pillar preference
            return self._inject_pillar_preferred(
                step=step,
                domain=domain,
                reason='collapse_warning_2'
            )

        elif warning_count >= 3:
            # Critical: Inject both before collapse detector pause
            return self._inject_combined(
                step=step,
                domain=domain,
                reason='collapse_critical',
                force=True  # ADAPTIVE: bypass cooldowns at critical
            )

        return None

    def _inject_pillar_preferred(
        self,
        step: int,
        domain: str,
        reason: str
    ) -> Optional[Dict[str, Any]]:
        """
        Inject using pillar's preferred grounding method with smart fallback.

        Strategy:
        - Try preferred method (advisor or context)
        - If preferred on cooldown, try alternative
        - If both on cooldown, return None (wait for next cycle)

        This ensures we get SOME grounding even if preferred is blocked.

        Args:
            step: Current training step
            domain: Pillar name
            reason: String describing why intervening

        Returns:
            Intervention result dict or None
        """
        preference = self.pillar_preferences.get(domain, 'context')

        if preference == 'advisor':
            # Try advisor first
            result = self._inject_advisor(step, domain, reason, force=False)

            if result is None:
                # Advisor on cooldown, try context as fallback
                result = self._inject_context(step, domain, reason, force=False)
                if result is not None:
                    self.interventions['fallback_to_context'] += 1
                    print(f"[AUTO-GROUNDING] {domain} advisor on cooldown, "
                          f"falling back to context injection")

            return result

        else:  # 'context'
            # Try context first
            result = self._inject_context(step, domain, reason, force=False)

            if result is None:
                # Context on cooldown, try advisor as fallback
                result = self._inject_advisor(step, domain, reason, force=False)
                if result is not None:
                    self.interventions['fallback_to_advisor'] += 1
                    print(f"[AUTO-GROUNDING] {domain} context on cooldown, "
                          f"falling back to advisor injection")

            return result

    def _inject_context(
        self,
        step: int,
        domain: str,
        reason: str,
        force: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Light intervention: Inject search-based external context.

        Triggers web search for domain-specific grounding information.
        Cheaper and faster than advisor ensemble, good for factual domains.

        Args:
            step: Current training step
            domain: Pillar/domain name
            reason: String describing why intervening
            force: If True, bypass cooldown (only for critical violations)

        Returns:
            Dict with context data or None if on cooldown
        """
        # Adaptive cooldown: respect unless force=True (critical violations)
        if not force:
            time_since_last = time.time() - self.last_context_injection
            if time_since_last < self.context_cooldown:
                return None  # Still on cooldown

        # Perform web search for grounding
        try:
            context = self.search.search_web(
                query=f"{domain} grounding semantic context",
                force=force
            )
        except Exception as e:
            print(f"[AUTO-GROUNDING] Context search failed: {e}")
            return None

        # Record grounding event for C_eff calculation
        self.viability.record_grounding_event(
            event_type='emergency_context',
            metadata={
                'step': step,
                'domain': domain,
                'reason': reason,
                'force': force
            }
        )

        self.last_context_injection = time.time()
        self.interventions['context'] += 1

        result = {
            'type': 'context',
            'reason': reason,
            'step': step,
            'domain': domain,
            'context': context
        }

        self._log_intervention(result)
        return result

    def _inject_advisor(
        self,
        step: int,
        domain: str,
        reason: str,
        force: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Moderate intervention: Inject advisor ensemble consultation.

        Queries 5 SOTA models (Qwen, Gemma, Claude, Llama) in parallel.
        More expensive but provides higher-quality reasoning.

        Args:
            step: Current training step
            domain: Pillar/domain name
            reason: String describing why intervening
            force: If True, bypass cooldown (only for critical violations)

        Returns:
            Dict with advisor advice or None if on cooldown
        """
        # Adaptive cooldown: respect unless force=True
        if not force:
            time_since_last = time.time() - self.last_advisor_injection
            if time_since_last < self.advisor_cooldown:
                return None  # Still on cooldown

        # Consult advisor ensemble
        try:
            advice = self.grounding.request_grounding(
                domain=domain,
                query=f"Critical grounding needed: {reason} at step {step}",
                force=force
            )
        except Exception as e:
            print(f"[AUTO-GROUNDING] Advisor consultation failed: {e}")
            return None

        # Record grounding event for C_eff calculation
        self.viability.record_grounding_event(
            event_type='emergency_advisor',
            metadata={
                'step': step,
                'domain': domain,
                'reason': reason,
                'force': force
            }
        )

        self.last_advisor_injection = time.time()
        self.interventions['advisor'] += 1

        result = {
            'type': 'advisor',
            'reason': reason,
            'step': step,
            'domain': domain,
            'advice': advice
        }

        self._log_intervention(result)
        return result

    def _inject_combined(
        self,
        step: int,
        domain: str,
        reason: str,
        force: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Critical intervention: Inject both context + advisor (maximum corrective power).

        Used only when viability margin < -0.5 or collapse warnings reach #3.
        Bypasses rate limits to ensure maximum C_eff increase.

        Args:
            step: Current training step
            domain: Pillar/domain name
            reason: String describing why intervening
            force: If True, bypass cooldowns (adaptive - critical only)

        Returns:
            Dict with both context and advice
        """
        context_result = self._inject_context(step, domain, reason, force=force)
        advisor_result = self._inject_advisor(step, domain, reason, force=force)

        self.interventions['combined'] += 1

        result = {
            'type': 'combined',
            'reason': reason,
            'step': step,
            'domain': domain,
            'context': context_result.get('context') if context_result else None,
            'advice': advisor_result.get('advice') if advisor_result else None
        }

        self._log_intervention(result)
        return result

    def _log_intervention(self, result: Dict[str, Any]):
        """Log intervention to JSONL file and memory."""
        entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'step': result.get('step'),
            'domain': result.get('domain'),
            'type': result.get('type'),
            'reason': result.get('reason'),
        }

        self.intervention_history.append(entry)

        # Append to JSONL log
        try:
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(entry) + '\n')
        except Exception as e:
            print(f"[AUTO-GROUNDING] Failed to log intervention: {e}")

    def get_status(self) -> Dict[str, Any]:
        """Get current auto-grounding status summary."""
        total_interventions = (
            self.interventions['context'] +
            self.interventions['advisor'] +
            self.interventions['combined']
        )

        return {
            'total_interventions': total_interventions,
            'context_injections': self.interventions['context'],
            'advisor_injections': self.interventions['advisor'],
            'combined_injections': self.interventions['combined'],
            'fallback_to_advisor': self.interventions['fallback_to_advisor'],
            'fallback_to_context': self.interventions['fallback_to_context'],
            'last_context_injection': self.last_context_injection,
            'last_advisor_injection': self.last_advisor_injection,
            'context_cooldown_remaining': max(
                0,
                self.context_cooldown - (time.time() - self.last_context_injection)
            ),
            'advisor_cooldown_remaining': max(
                0,
                self.advisor_cooldown - (time.time() - self.last_advisor_injection)
            )
        }

    def print_status(self):
        """Print formatted auto-grounding status."""
        status = self.get_status()
        print("\n--- Auto-Grounding Intervention Status ---")
        print(f"Total interventions: {status['total_interventions']}")
        print(f"  Context injections: {status['context_injections']}")
        print(f"  Advisor injections: {status['advisor_injections']}")
        print(f"  Combined (critical): {status['combined_injections']}")
        print(f"  Fallbacks (to advisor): {status['fallback_to_advisor']}")
        print(f"  Fallbacks (to context): {status['fallback_to_context']}")
        print(f"Cooldown status:")
        print(f"  Context ready in: {status['context_cooldown_remaining']:.1f}s")
        print(f"  Advisor ready in: {status['advisor_cooldown_remaining']:.1f}s")
