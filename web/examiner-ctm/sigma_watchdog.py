"""
Sigma Watchdog v5.0 - Spectral Diversity Monitor

Implements Gram log-determinant monitoring for manifold collapse detection.
Monitors per-specialist AND central model with tiered escalating intervention.

Intervention Tiers:
1. WARNING: log_det < -10 → Log to drift ledger
2. SOFT: log_det < -15 → Add spectral regularization to loss
3. HARD: log_det < -20 (3x consecutive) → Reinitialize from Central
"""

import torch
import torch.nn as nn
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import json
import os


class SigmaWatchdog:
    """
    Spectral Diversity Monitor using Gram Log-Determinant.
    
    The Gram matrix G = A @ A.T captures the similarity structure of activations.
    log(det(G)) measures the "volume" of the activation space:
    - High log_det → Diverse, well-spread activations
    - Low log_det → Collapsed, degenerate manifold
    """
    
    # Intervention thresholds
    THRESHOLD_WARNING = -10.0
    THRESHOLD_SOFT = -15.0
    THRESHOLD_HARD = -20.0
    CONSECUTIVE_HARD_REQUIRED = 3
    
    def __init__(
        self,
        domains: List[str],
        log_file: str = "epistemic_drift_ledger.jsonl",
        spectral_penalty_weight: float = 0.001
    ):
        self.domains = domains + ["CENTRAL"]  # Monitor specialists + central
        self.log_file = log_file
        self.spectral_penalty_weight = spectral_penalty_weight
        
        # Per-model tracking
        self.history: Dict[str, List[float]] = {d: [] for d in self.domains}
        self.consecutive_hard_violations: Dict[str, int] = {d: 0 for d in self.domains}
        self.intervention_counts: Dict[str, Dict[str, int]] = {
            d: {"warning": 0, "soft": 0, "hard": 0} for d in self.domains
        }
        
        # Rolling window for history
        self.history_max_len = 100
        
    def compute_gram_log_det(self, activations: torch.Tensor) -> float:
        """
        Compute log-determinant of the Gram matrix.
        
        Args:
            activations: (N, D) tensor of N activation vectors of dimension D
            
        Returns:
            log(det(G)) as a float
        """
        if activations.dim() == 1:
            activations = activations.unsqueeze(0)
            
        N, D = activations.shape
        
        # Need at least 2 samples for meaningful Gram matrix
        if N < 2:
            return 0.0
            
        # Gram matrix: G = A @ A.T, shape (N, N)
        G = activations @ activations.T
        
        # Add small regularization for numerical stability
        G = G + 1e-6 * torch.eye(N, device=G.device)
        
        # Compute log-determinant
        try:
            log_det = torch.logdet(G).item()
            if torch.isnan(torch.tensor(log_det)) or torch.isinf(torch.tensor(log_det)):
                log_det = -999.0  # Flag as problematic
        except RuntimeError:
            log_det = -999.0
            
        return log_det
    
    def check(
        self, 
        domain: str, 
        activations: torch.Tensor,
        step: int
    ) -> Tuple[str, Optional[torch.Tensor]]:
        """
        Check a model's activations for manifold collapse.
        
        Args:
            domain: Model identifier (e.g., "LOGOS", "CENTRAL")
            activations: (N, D) tensor of recent activations
            step: Current training step
            
        Returns:
            Tuple of (intervention_level, optional_penalty_tensor)
            intervention_level: "ok", "warning", "soft", or "hard"
        """
        log_det = self.compute_gram_log_det(activations)
        
        # Record history
        self.history[domain].append(log_det)
        if len(self.history[domain]) > self.history_max_len:
            self.history[domain] = self.history[domain][-self.history_max_len:]
        
        # Determine intervention level
        intervention = "ok"
        penalty = None
        
        if log_det < self.THRESHOLD_HARD:
            self.consecutive_hard_violations[domain] += 1
            if self.consecutive_hard_violations[domain] >= self.CONSECUTIVE_HARD_REQUIRED:
                intervention = "hard"
                self.intervention_counts[domain]["hard"] += 1
                self._log_event(domain, step, log_det, "HARD_RESET")
            else:
                intervention = "soft"
                penalty = self._compute_spectral_penalty(activations)
                self.intervention_counts[domain]["soft"] += 1
                self._log_event(domain, step, log_det, "SOFT_PENALTY")
                
        elif log_det < self.THRESHOLD_SOFT:
            self.consecutive_hard_violations[domain] = 0  # Reset consecutive count
            intervention = "soft"
            penalty = self._compute_spectral_penalty(activations)
            self.intervention_counts[domain]["soft"] += 1
            self._log_event(domain, step, log_det, "SOFT_PENALTY")
            
        elif log_det < self.THRESHOLD_WARNING:
            self.consecutive_hard_violations[domain] = 0
            intervention = "warning"
            self.intervention_counts[domain]["warning"] += 1
            self._log_event(domain, step, log_det, "WARNING")
            
        else:
            self.consecutive_hard_violations[domain] = 0
            
        return intervention, penalty
    
    def _compute_spectral_penalty(self, activations: torch.Tensor) -> torch.Tensor:
        """
        Compute spectral regularization penalty to encourage diversity.
        Maximizes the log-determinant of the Gram matrix.
        """
        if activations.dim() == 1:
            activations = activations.unsqueeze(0)
            
        N = activations.shape[0]
        if N < 2:
            return torch.tensor(0.0, device=activations.device)
            
        G = activations @ activations.T
        G = G + 1e-6 * torch.eye(N, device=G.device)
        
        # Penalty = -log_det (minimizing this maximizes diversity)
        try:
            penalty = -torch.logdet(G) * self.spectral_penalty_weight
        except RuntimeError:
            penalty = torch.tensor(0.0, device=activations.device)
            
        return penalty
    
    def _log_event(self, domain: str, step: int, log_det: float, event_type: str):
        """Log intervention event to drift ledger."""
        entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "step": step,
            "domain": domain,
            "event": f"SIGMA_{event_type}",
            "log_det": round(log_det, 4),
            "consecutive_violations": self.consecutive_hard_violations[domain],
            "thresholds": {
                "warning": self.THRESHOLD_WARNING,
                "soft": self.THRESHOLD_SOFT,
                "hard": self.THRESHOLD_HARD
            }
        }
        
        try:
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")
        except Exception as e:
            print(f"[SigmaWatchdog] Failed to log event: {e}")
    
    def should_hard_reset(self, domain: str) -> bool:
        """Check if a domain requires hard reset."""
        return self.consecutive_hard_violations.get(domain, 0) >= self.CONSECUTIVE_HARD_REQUIRED
    
    def get_status(self) -> Dict:
        """Get current watchdog status for all monitored models."""
        status = {}
        for domain in self.domains:
            history = self.history[domain]
            recent_avg = sum(history[-10:]) / len(history[-10:]) if history else 0.0
            
            status[domain] = {
                "recent_avg_log_det": round(recent_avg, 4),
                "consecutive_hard_violations": self.consecutive_hard_violations[domain],
                "intervention_counts": self.intervention_counts[domain],
                "health": self._health_status(recent_avg)
            }
        return status
    
    def _health_status(self, log_det: float) -> str:
        """Convert log_det to human-readable health status."""
        if log_det > self.THRESHOLD_WARNING:
            return "HEALTHY"
        elif log_det > self.THRESHOLD_SOFT:
            return "WARNING"
        elif log_det > self.THRESHOLD_HARD:
            return "CRITICAL"
        else:
            return "COLLAPSED"
    
    def reset_domain(self, domain: str):
        """Reset tracking for a domain after hard reset intervention."""
        self.consecutive_hard_violations[domain] = 0
        self.history[domain] = []
        print(f"[SigmaWatchdog] Reset tracking for {domain} after hard reset.")
