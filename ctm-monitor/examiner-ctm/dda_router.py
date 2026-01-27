"""
DDA Router v5.0 - Hybrid Dynamic Domain Attention

Implements:
1. Dynamic prototype updates (every 1000 steps)
2. Hybrid routing: Deterministic + scheduled probabilistic exploration
3. Pillar entropy regularization for collapse prevention
"""

import torch
import torch.nn.functional as F
from typing import Dict, List, Tuple, Optional
import random


class DDARouter:
    """
    Dynamic Domain Attention Router with Hybrid Routing Strategy.
    
    Routing Modes:
    - DETERMINISTIC: Highest cosine similarity wins
    - PROBABILISTIC: Sample from softmax distribution (exploration)
    - HYBRID: Deterministic + periodic probabilistic (default)
    """
    
    def __init__(
        self, 
        domains: List[str],
        d_model: int = 128,
        temperature: float = 0.5,
        exploration_frequency: int = 100,
        prototype_refresh_frequency: int = 1000,
        top_k: int = 3,
        entropy_weight: float = 0.01
    ):
        self.domains = domains
        self.d_model = d_model
        self.temperature = temperature
        self.exploration_frequency = exploration_frequency
        self.prototype_refresh_frequency = prototype_refresh_frequency
        self.top_k = top_k
        self.entropy_weight = entropy_weight
        
        # Domain prototypes (centroids)
        self.prototypes: Dict[str, torch.Tensor] = {}
        
        # Activation history for online prototype updates
        self.activation_history: Dict[str, List[torch.Tensor]] = {d: [] for d in domains}
        self.activation_history_max = 100  # Keep last N activations per domain
        
        # Step counter
        self.step = 0
        
    def initialize_prototypes(self, embedding_fn, tokenizer, curriculum):
        """
        Initialize domain prototypes from sample problems.
        
        Args:
            embedding_fn: Function to embed text (model.embedding)
            tokenizer: Tokenizer for encoding text
            curriculum: ReasoningCurriculum with get_problem(domain)
        """
        print("Initializing DDA prototypes...")
        device = next(iter(embedding_fn.parameters())).device
        
        with torch.no_grad():
            for domain in self.domains:
                samples = []
                for _ in range(5):
                    q, _ = curriculum.get_problem(domain)
                    if q:
                        samples.append(q)
                
                if not samples:
                    # Fallback: use domain name as seed
                    samples = [f"This is a problem about {domain}."]
                
                embeddings = []
                for q in samples:
                    ids = tokenizer(q, return_tensors="pt", truncation=True, max_length=128).input_ids.to(device)
                    emb = embedding_fn(ids).mean(dim=1)  # Mean pool
                    embeddings.append(emb)
                
                # Centroid = mean of embeddings
                self.prototypes[domain] = torch.cat(embeddings, dim=0).mean(dim=0)
        
        print(f"Initialized {len(self.prototypes)} domain prototypes.")
    
    def refresh_prototypes(self):
        """
        Refresh prototypes from accumulated activation history.
        Called every `prototype_refresh_frequency` steps.
        """
        print(f"[DDA] Refreshing prototypes at step {self.step}...")
        
        for domain, history in self.activation_history.items():
            if len(history) >= 10:  # Minimum samples for stable update
                # Online centroid update
                stacked = torch.stack(history[-50:], dim=0)  # Use last 50
                new_centroid = stacked.mean(dim=0)
                
                # EMA blend with existing prototype (stability)
                if domain in self.prototypes:
                    alpha = 0.3  # 30% new, 70% old
                    self.prototypes[domain] = (1 - alpha) * self.prototypes[domain] + alpha * new_centroid
                else:
                    self.prototypes[domain] = new_centroid
                    
        print(f"[DDA] Prototypes refreshed for {len(self.prototypes)} domains.")
    
    def record_activation(self, domain: str, activation: torch.Tensor):
        """Record activation for online prototype updates."""
        if domain in self.activation_history:
            self.activation_history[domain].append(activation.detach().clone())
            # Trim to max size
            if len(self.activation_history[domain]) > self.activation_history_max:
                self.activation_history[domain] = self.activation_history[domain][-self.activation_history_max:]
    
    def get_attention_weights(self, input_embedding: torch.Tensor) -> Dict[str, float]:
        """
        Compute attention weights over domains.
        
        Args:
            input_embedding: (D,) or (1, D) tensor
            
        Returns:
            Dict mapping domain names to attention weights
        """
        if input_embedding.dim() == 2:
            input_embedding = input_embedding.squeeze(0)
            
        scores = {}
        for domain, prototype in self.prototypes.items():
            sim = F.cosine_similarity(
                input_embedding.unsqueeze(0), 
                prototype.unsqueeze(0)
            ).item()
            scores[domain] = sim
        
        # Softmax with temperature
        raw_scores = torch.tensor(list(scores.values()))
        weights = F.softmax(raw_scores / self.temperature, dim=0)
        
        return {domain: weights[i].item() for i, domain in enumerate(scores.keys())}
    
    def route(self, input_embedding: torch.Tensor) -> Tuple[List[str], Dict[str, float]]:
        """
        Route input to specialists using hybrid strategy.
        
        Args:
            input_embedding: (D,) or (1, D) tensor
            
        Returns:
            Tuple of (selected_domains, attention_weights)
        """
        self.step += 1
        
        # Check for prototype refresh
        if self.step % self.prototype_refresh_frequency == 0 and self.step > 0:
            self.refresh_prototypes()
        
        # Get attention weights
        weights = self.get_attention_weights(input_embedding)
        
        # Hybrid routing decision
        use_exploration = (self.step % self.exploration_frequency == 0)
        
        if use_exploration:
            # PROBABILISTIC: Sample top-K from distribution
            probs = torch.tensor(list(weights.values()))
            indices = torch.multinomial(probs, min(self.top_k, len(probs)), replacement=False)
            selected = [list(weights.keys())[i] for i in indices]
        else:
            # DETERMINISTIC: Top-K by weight
            sorted_domains = sorted(weights.items(), key=lambda x: x[1], reverse=True)
            selected = [d for d, _ in sorted_domains[:self.top_k]]
        
        return selected, weights
    
    def pillar_entropy_loss(self, attention_weights: Dict[str, float]) -> torch.Tensor:
        """
        Compute entropy regularization loss.
        Penalizes peaked distributions to encourage multi-pillar engagement.
        
        Returns:
            Scalar loss tensor (negative entropy, to be minimized)
        """
        probs = torch.tensor(list(attention_weights.values()))
        # Avoid log(0)
        probs = probs + 1e-8
        probs = probs / probs.sum()
        
        entropy = -(probs * torch.log(probs)).sum()
        
        # Return negative entropy scaled by weight
        # Minimizing this maximizes entropy (encourages diversity)
        return -self.entropy_weight * entropy
    
    def get_routing_stats(self) -> Dict:
        """Get current routing statistics."""
        return {
            "step": self.step,
            "num_domains": len(self.domains),
            "prototypes_initialized": len(self.prototypes),
            "activation_history_sizes": {d: len(h) for d, h in self.activation_history.items()},
            "next_refresh_in": self.prototype_refresh_frequency - (self.step % self.prototype_refresh_frequency),
            "next_exploration_in": self.exploration_frequency - (self.step % self.exploration_frequency)
        }
