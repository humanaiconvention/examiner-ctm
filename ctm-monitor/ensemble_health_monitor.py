"""
Ensemble Health Monitoring (Phase 4.1)

Tracks advisor ensemble availability, reliability, and failover behavior.
Ensures graceful degradation when models become unavailable.

Models tracked:
1. OpenRouter: Qwen3-235B, Gemma3-27B, Claude-Sonnet-4.5
2. GCP Vertex: Qwen3-Next-80B, Llama4
3. Local: Claude Code CLI fallback
"""

import time
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from collections import defaultdict
import statistics


class ModelHealth:
    """Track health of a single model"""

    def __init__(self, model_id: str, provider: str):
        self.model_id = model_id
        self.provider = provider
        self.available = True
        self.last_check = datetime.now()
        self.last_success = datetime.now()
        self.last_error = None
        self.success_count = 0
        self.error_count = 0
        self.response_times = []  # milliseconds
        self.consecutive_failures = 0

    def record_success(self, response_time_ms: float) -> None:
        """Record successful query"""
        self.success_count += 1
        self.consecutive_failures = 0
        self.last_success = datetime.now()
        self.response_times.append(response_time_ms)
        self.available = True
        # Keep only last 100 response times
        if len(self.response_times) > 100:
            self.response_times = self.response_times[-100:]

    def record_failure(self, error: str) -> None:
        """Record failed query"""
        self.error_count += 1
        self.consecutive_failures += 1
        self.last_error = error

        # Mark unavailable after 3 consecutive failures
        if self.consecutive_failures >= 3:
            self.available = False

    def get_reliability(self) -> float:
        """
        Return reliability score (0.0 to 1.0).

        Based on success rate and recency.
        """
        total = self.success_count + self.error_count
        if total == 0:
            return 0.5  # Unknown

        success_rate = self.success_count / total

        # Penalize for consecutive failures
        penalty = max(0, self.consecutive_failures - 1) * 0.2
        reliability = max(0.0, success_rate - penalty)

        return min(1.0, reliability)

    def get_avg_response_time(self) -> float:
        """Return average response time in milliseconds"""
        if not self.response_times:
            return 0.0
        return statistics.mean(self.response_times)

    def get_p95_response_time(self) -> float:
        """Return 95th percentile response time"""
        if not self.response_times:
            return 0.0
        return sorted(self.response_times)[int(len(self.response_times) * 0.95)] if len(self.response_times) > 1 else self.response_times[0]

    def to_dict(self) -> Dict:
        """Export as dict"""
        return {
            "model_id": self.model_id,
            "provider": self.provider,
            "available": self.available,
            "reliability": self.get_reliability(),
            "success_count": self.success_count,
            "error_count": self.error_count,
            "consecutive_failures": self.consecutive_failures,
            "avg_response_time_ms": self.get_avg_response_time(),
            "p95_response_time_ms": self.get_p95_response_time(),
            "last_success": self.last_success.isoformat(),
            "last_error": self.last_error,
        }


class EnsembleHealthMonitor:
    """Monitor overall ensemble health and coordinate failover"""

    def __init__(self, storage_dir: str = "ensemble_health"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)

        self.models: Dict[str, ModelHealth] = {}
        self.query_log = []  # Recent queries for analysis
        self.outage_events = []  # Outage timeline
        self.failover_count = 0

        # Initialize known models
        self._init_known_models()

    def _init_known_models(self) -> None:
        """Initialize tracking for all ensemble models"""
        models = [
            ("openrouter", "qwen/qwen3-235b-a22b-2507"),
            ("openrouter", "google/gemma-3-27b-it"),
            ("openrouter", "anthropic/claude-sonnet-4.5"),
            ("gcp_qwen", "qwen3-next-80b"),
            ("gcp_llama", "meta/llama-4-maverick-17b-128e-instruct-maas"),
            ("local", "claude-code-cli"),
        ]

        for provider, model_id in models:
            key = f"{provider}:{model_id}"
            self.models[key] = ModelHealth(model_id, provider)

    def record_query(
        self,
        model_id: str,
        provider: str,
        query: str,
        pillar: str,
        success: bool,
        error: Optional[str] = None,
        response_time_ms: float = 0.0,
    ) -> None:
        """
        Record a query attempt to a model.

        Args:
            model_id: Model identifier
            provider: Provider name
            query: Query text (first 100 chars)
            pillar: Pillar domain
            success: Whether query succeeded
            error: Error message if failed
            response_time_ms: Response time in milliseconds
        """
        key = f"{provider}:{model_id}"

        if key not in self.models:
            self.models[key] = ModelHealth(model_id, provider)

        if success:
            self.models[key].record_success(response_time_ms)
        else:
            self.models[key].record_failure(error or "unknown error")

        # Log for analysis
        self.query_log.append({
            "timestamp": datetime.now().isoformat(),
            "model": key,
            "pillar": pillar,
            "success": success,
            "response_time_ms": response_time_ms,
        })

        # Keep only last 1000 queries
        if len(self.query_log) > 1000:
            self.query_log = self.query_log[-1000:]

    def get_available_models(self) -> List[ModelHealth]:
        """Return list of available models, sorted by reliability"""
        available = [m for m in self.models.values() if m.available]
        return sorted(available, key=lambda m: m.get_reliability(), reverse=True)

    def get_model_status(self, model_key: str) -> Optional[ModelHealth]:
        """Get status of specific model"""
        return self.models.get(model_key)

    def record_failover(self, failed_model: str, fallback_model: str, reason: str) -> None:
        """Record when failover occurs"""
        self.failover_count += 1

        self.outage_events.append({
            "timestamp": datetime.now().isoformat(),
            "failed_model": failed_model,
            "fallback_model": fallback_model,
            "reason": reason,
        })

        print(f"  [Failover] {failed_model} → {fallback_model}")
        print(f"    Reason: {reason}")

    def get_ensemble_reliability(self) -> float:
        """
        Return overall ensemble reliability.

        Based on availability of top models.
        """
        all_reliabilities = [m.get_reliability() for m in self.models.values()]
        if not all_reliabilities:
            return 0.5

        # Ensemble reliability = average of top 3 models
        sorted_reliabilities = sorted(all_reliabilities, reverse=True)
        top_3 = sorted_reliabilities[:min(3, len(sorted_reliabilities))]

        return statistics.mean(top_3)

    def check_ensemble_health(self) -> Dict:
        """
        Comprehensive health check of entire ensemble.

        Returns:
            Health report with recommendations
        """
        available_count = sum(1 for m in self.models.values() if m.available)
        total_count = len(self.models)
        availability_pct = (available_count / total_count * 100) if total_count > 0 else 0

        unhealthy_models = [
            m for m in self.models.values() if m.get_reliability() < 0.5 and m.available
        ]

        report = {
            "timestamp": datetime.now().isoformat(),
            "ensemble_reliability": self.get_ensemble_reliability(),
            "available_models": available_count,
            "total_models": total_count,
            "availability_pct": availability_pct,
            "unhealthy_models": [
                {"model": m.model_id, "reliability": m.get_reliability()}
                for m in unhealthy_models
            ],
            "failover_count": self.failover_count,
            "recent_outages": self.outage_events[-5:],  # Last 5 outages
            "recommendation": self._get_recommendation(available_count, total_count),
        }

        return report

    def _get_recommendation(self, available: int, total: int) -> str:
        """Get actionable recommendation based on ensemble state"""
        pct = (available / total * 100) if total > 0 else 0

        if pct == 100:
            return "All models operational. System healthy."
        elif pct >= 80:
            return "Minor degradation. System functional."
        elif pct >= 60:
            return "Significant degradation. Consider alerts."
        elif pct >= 40:
            return "CRITICAL: Multiple model failures. Manual intervention recommended."
        else:
            return "CRITICAL: Ensemble collapse. Fallback to local only."

    def should_trigger_alert(self) -> bool:
        """Return True if alert should be triggered"""
        available = sum(1 for m in self.models.values() if m.available)
        total = len(self.models)
        pct = (available / total * 100) if total > 0 else 0

        return pct < 60  # Alert when < 60% models available

    def get_model_recommendations(self) -> Dict[str, str]:
        """Get per-model recommendations"""
        recommendations = {}

        for key, model in self.models.items():
            if not model.available:
                recommendations[key] = "Model unavailable - investigate"
            elif model.get_reliability() < 0.5:
                recommendations[key] = "Low reliability - may failover"
            elif model.consecutive_failures >= 2:
                recommendations[key] = "Recent failures - monitor"
            elif model.get_p95_response_time() > 30000:  # 30 seconds
                recommendations[key] = "Slow responses - may need failover"
            else:
                recommendations[key] = "Healthy"

        return recommendations

    def export_report(self, filename: Optional[str] = None) -> None:
        """Export comprehensive report to JSON"""
        filename = filename or f"ensemble_health_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        filepath = self.storage_dir / filename

        report = {
            "timestamp": datetime.now().isoformat(),
            "ensemble_summary": self.check_ensemble_health(),
            "model_details": {key: m.to_dict() for key, m in self.models.items()},
            "model_recommendations": self.get_model_recommendations(),
            "query_log_sample": self.query_log[-100:],  # Last 100 queries
            "failover_history": self.outage_events,
        }

        with open(filepath, "w") as f:
            json.dump(report, f, indent=2)

        print(f"[Ensemble Health] Report exported to {filepath}")

    def get_stats(self) -> Dict:
        """Quick statistics"""
        total_queries = sum(m.success_count + m.error_count for m in self.models.values())
        total_successes = sum(m.success_count for m in self.models.values())
        success_rate = (total_successes / total_queries * 100) if total_queries > 0 else 0

        return {
            "total_queries": total_queries,
            "success_rate_pct": success_rate,
            "failover_count": self.failover_count,
            "ensemble_reliability": self.get_ensemble_reliability(),
            "available_models": sum(1 for m in self.models.values() if m.available),
            "total_models": len(self.models),
        }


# Integration helper
def create_ensemble_monitor() -> EnsembleHealthMonitor:
    """Factory function"""
    return EnsembleHealthMonitor()


if __name__ == "__main__":
    print("Testing Ensemble Health Monitor...\n")

    # Test 1: Initialize
    print("[Test 1] Initialize monitor")
    monitor = EnsembleHealthMonitor()
    print(f"  Tracking {len(monitor.models)} models")

    # Test 2: Record successes and failures
    print("\n[Test 2] Record query results")
    monitor.record_query(
        "qwen3-235b-a22b-2507", "openrouter",
        query="test query",
        pillar="LOGOS",
        success=True,
        response_time_ms=450,
    )
    monitor.record_query(
        "gemma-3-27b-it", "openrouter",
        query="test query",
        pillar="LOGOS",
        success=True,
        response_time_ms=320,
    )
    monitor.record_query(
        "claude-sonnet-4.5", "openrouter",
        query="test query",
        pillar="LOGOS",
        success=False,
        error="Rate limit exceeded",
    )
    print(f"  Recorded 3 queries (2 success, 1 failure)")

    # Test 3: Health check
    print("\n[Test 3] Ensemble health check")
    health = monitor.check_ensemble_health()
    print(f"  Overall reliability: {health['ensemble_reliability']:.2%}")
    print(f"  Available models: {health['available_models']}/{health['total_models']}")
    print(f"  Recommendation: {health['recommendation']}")

    # Test 4: Model status
    print("\n[Test 4] Individual model status")
    available = monitor.get_available_models()
    for model in available[:3]:
        print(f"  {model.model_id}: {model.get_reliability():.1%} reliable, {model.get_avg_response_time():.0f}ms avg")

    # Test 5: Failover
    print("\n[Test 5] Record failover")
    monitor.record_failover(
        "qwen3-235b-a22b-2507",
        "claude-sonnet-4.5",
        "Primary model timeout",
    )

    # Test 6: Statistics
    print("\n[Test 6] Quick statistics")
    stats = monitor.get_stats()
    print(f"  Total queries: {stats['total_queries']}")
    print(f"  Success rate: {stats['success_rate_pct']:.1f}%")
    print(f"  Failovers: {stats['failover_count']}")

    # Test 7: Export
    print("\n[Test 7] Export report")
    monitor.export_report()
