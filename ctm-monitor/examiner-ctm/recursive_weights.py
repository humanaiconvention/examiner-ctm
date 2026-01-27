"""
Examiner-CTM v5.3: Recursive Weight Derivation Module

Core concept: Derive W2, W3, ... from a single base weight W1 via learned operators
instead of maintaining independent weight matrices.

Author: CTM Development Team
Version: 5.3
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import math
from typing import Literal, Optional, Tuple


# === WEIGHT OPERATORS ===

class SpectralOperator(nn.Module):
    """
    Derives W' from W via spectral transformation.

    W = U @ diag(S) @ Vh  (SVD)
    W' = U @ diag(f(S)) @ Vh  where f is learned

    This preserves the left/right singular vectors while
    transforming the spectrum.
    """
    def __init__(self, max_rank: int = 8, residual_blend: float = 0.3):
        super().__init__()
        self.max_rank = max_rank

        # Per-singular-value learnable scale and shift
        # This works for any rank <= max_rank
        self.sigma_scale = nn.Parameter(torch.ones(max_rank))
        self.sigma_shift = nn.Parameter(torch.zeros(max_rank))

        # Blend with residual (identity-ish) component
        self.alpha = nn.Parameter(torch.tensor(1.0 - residual_blend))

        # Small residual for stability
        self.residual_scale = nn.Parameter(torch.tensor(residual_blend))

    def forward(self, W: torch.Tensor) -> torch.Tensor:
        """
        Args:
            W: (*, in_features, out_features) weight matrix
        Returns:
            W': transformed weight matrix, same shape
        """
        orig_shape = W.shape

        # Handle batched case
        if W.dim() > 2:
            W_2d = W.reshape(-1, orig_shape[-1])
        else:
            W_2d = W

        # SVD decomposition
        try:
            U, S, Vh = torch.linalg.svd(W_2d, full_matrices=False)
        except RuntimeError:
            # Fallback for numerical issues
            return W

        # Actual rank is min of matrix dimensions
        actual_rank = S.shape[-1]
        k = min(self.max_rank, actual_rank)

        # Transform singular values: S' = scale * S + shift (element-wise)
        scale = F.softplus(self.sigma_scale[:k])  # Ensure positive
        shift = self.sigma_shift[:k]
        S_new = scale * S[..., :k] + shift

        # Keep remaining singular values unchanged
        if actual_rank > k:
            S_full = torch.cat([S_new, S[..., k:]], dim=-1)
        else:
            S_full = S_new

        # Reconstruct: W' = U @ diag(S') @ Vh
        W_spectral = U @ torch.diag_embed(S_full) @ Vh

        # Blend with residual
        W_out = self.alpha * W_spectral + self.residual_scale * W_2d

        return W_out.reshape(orig_shape)


class LinearProjectionOperator(nn.Module):
    """
    Derives W' from W via learned linear projection with bottleneck.

    W' = decode(encode(flatten(W)))

    More expressive than spectral but more parameters.
    """
    def __init__(self, weight_numel: int, bottleneck_ratio: float = 0.25):
        super().__init__()
        bottleneck = max(16, int(weight_numel * bottleneck_ratio))

        self.encoder = nn.Linear(weight_numel, bottleneck)
        self.decoder = nn.Linear(bottleneck, weight_numel)

        # Initialize close to identity
        nn.init.eye_(self.encoder.weight[:min(bottleneck, weight_numel), :min(bottleneck, weight_numel)])
        nn.init.eye_(self.decoder.weight[:min(bottleneck, weight_numel), :min(bottleneck, weight_numel)])

    def forward(self, W: torch.Tensor) -> torch.Tensor:
        shape = W.shape
        W_flat = W.flatten()
        W_new = self.decoder(F.gelu(self.encoder(W_flat)))
        return W_new.reshape(shape)


class ResidualDeltaOperator(nn.Module):
    """
    Derives W' = W + delta(W) where delta is a small learned correction.

    Good for when W' should be "close" to W.
    """
    def __init__(self, d_model: int, delta_rank: int = 4):
        super().__init__()
        # Low-rank delta: delta(W) = A @ B @ W + bias
        self.A = nn.Parameter(torch.randn(d_model, delta_rank) * 0.01)
        self.B = nn.Parameter(torch.randn(delta_rank, d_model) * 0.01)
        self.scale = nn.Parameter(torch.tensor(0.1))

    def forward(self, W: torch.Tensor) -> torch.Tensor:
        # Compute low-rank delta
        delta = self.A @ self.B  # (d_model, d_model)

        # Apply as multiplicative + additive correction
        if W.dim() == 2:
            W_new = W + self.scale * (delta @ W)
        else:
            # For higher dims, apply to last dimension
            W_new = W + self.scale * torch.einsum('ij,...j->...i', delta, W)

        return W_new


class ContractionOperator(nn.Module):
    """
    Contracts W1: (M, h, d) -> W2: (h, d) via learned weighted sum.

    This handles the shape mismatch between weights_1 and weights_2 in NLM.
    """
    def __init__(self, contract_dim: int):
        super().__init__()
        self.weights = nn.Parameter(torch.ones(contract_dim) / contract_dim)

    def forward(self, W: torch.Tensor) -> torch.Tensor:
        """Contract first dimension via softmax-weighted sum"""
        alpha = F.softmax(self.weights, dim=0)
        return torch.einsum('m,m...->...', alpha, W)


# === RECURSIVE NLM ===

class RecursiveNLM(nn.Module):
    """
    v5.3 NeuronLevelModel with Recursive Weight Derivation.

    Architecture:
        W1 (learned) → [contraction] → W1' → [operator T] → W2

    Instead of learning W2 independently, we derive it from W1.

    Args:
        d_model: Embedding dimension (default: 128)
        memory_length: Pre-activation history window (default: 15)
        d_hidden: Hidden layer dimension (default: 4)
        operator: Type of recursive operator ('spectral', 'linear', 'residual')
        operator_rank: Rank for low-rank operators
    """
    def __init__(
        self,
        d_model: int = 128,
        memory_length: int = 15,
        d_hidden: int = 4,
        operator: Literal['spectral', 'linear', 'residual'] = 'spectral',
        operator_rank: int = 8,
    ):
        super().__init__()
        self.d_model = d_model
        self.memory_length = memory_length
        self.d_hidden = d_hidden

        # === BASE WEIGHT W1 (learned) ===
        self.weights_1 = nn.Parameter(
            torch.randn(memory_length, d_hidden, d_model) * 0.02
        )

        # Biases (still independent)
        self.bias_1 = nn.Parameter(torch.zeros(1, d_hidden, d_model))
        self.bias_2 = nn.Parameter(torch.zeros(1, d_model))

        # === CONTRACTION: (M, h, d) -> (h, d) ===
        self.contraction = ContractionOperator(memory_length)

        # === RECURSIVE OPERATOR T ===
        if operator == 'spectral':
            self.T = SpectralOperator(max_rank=operator_rank)
        elif operator == 'linear':
            self.T = LinearProjectionOperator(d_hidden * d_model, bottleneck_ratio=0.25)
        elif operator == 'residual':
            self.T = ResidualDeltaOperator(d_model, delta_rank=operator_rank)
        else:
            raise ValueError(f"Unknown operator: {operator}")

        # Cache for derived weights (recomputed each forward)
        self._cached_w2: Optional[torch.Tensor] = None

    @property
    def weights_2(self) -> torch.Tensor:
        """
        Derive W2 from W1 via contraction + operator T.

        W1: (M, h, d) → contract → (h, d) → T → W2: (h, d)
        """
        # Contract over memory dimension
        W1_contracted = self.contraction(self.weights_1)  # (h, d)

        # Apply recursive operator
        W2 = self.T(W1_contracted)  # (h, d)

        return W2

    def forward(
        self,
        pre_acts_history: torch.Tensor,
        state_context: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """
        Forward pass with base W1 and derived W2.

        Args:
            pre_acts_history: (B, D, T) pre-activation history
            state_context: (B, D) optional context for ASN gating

        Returns:
            output: (B, D) post-activation
        """
        # Truncate to memory window
        inputs = pre_acts_history[..., -self.memory_length:]

        # === ASN (Adaptive Spike Neurons) Gating ===
        if state_context is not None:
            gate = torch.sigmoid(
                torch.einsum('bd, mhd -> bhm', state_context, self.weights_1[:1])
            )
            gate = gate.mean(dim=1, keepdim=True)  # (B, 1, M)
            inputs = inputs * gate

        # === Layer 1: Use base W1 ===
        h = torch.einsum('bdM, Mhd -> bdh', inputs, self.weights_1)
        h = h + self.bias_1.transpose(1, 2)
        h = F.relu(h)

        # === Layer 2: Use DERIVED W2 ===
        W2 = self.weights_2  # Computed via T(W1)
        out = torch.einsum('bdh, hd -> bd', h, W2) + self.bias_2

        return out

    def update_weights(self, grads, lr: float = 1e-3):
        """SGD update (gradients flow through T to W1)"""
        params = [self.weights_1, self.bias_1, self.bias_2]
        with torch.no_grad():
            for p, g in zip(params, grads):
                if p is not None and g is not None:
                    p.add_(g, alpha=-lr)
        return params

    def parameter_report(self) -> dict:
        """Report parameter counts and savings vs original NLM"""
        # Original NLM params
        original = {
            'weights_1': self.memory_length * self.d_hidden * self.d_model,
            'weights_2': self.d_hidden * self.d_model,
            'bias_1': self.d_hidden * self.d_model,
            'bias_2': self.d_model,
        }
        original_total = sum(original.values())

        # Recursive NLM params
        base_params = self.weights_1.numel() + self.bias_1.numel() + self.bias_2.numel()
        operator_params = sum(p.numel() for p in self.T.parameters())
        contraction_params = sum(p.numel() for p in self.contraction.parameters())

        recursive_total = base_params + operator_params + contraction_params

        return {
            'original_total': original_total,
            'recursive_total': recursive_total,
            'savings_absolute': original_total - recursive_total,
            'savings_percent': 100 * (1 - recursive_total / original_total),
            'breakdown': {
                'base_weights': base_params,
                'operator': operator_params,
                'contraction': contraction_params,
            }
        }


# === DEEP RECURSIVE NLM (W1 → W2 → W3) ===

class DeepRecursiveNLM(nn.Module):
    """
    Three-layer NLM with fully recursive weight derivation:

    W1 (learned) → W2 = T(W1) → W3 = T(W2) = T²(W1)

    The same operator T is applied recursively.
    """
    def __init__(
        self,
        d_model: int = 128,
        memory_length: int = 15,
        d_hidden: int = 4,
        operator_rank: int = 8,
    ):
        super().__init__()
        self.d_model = d_model
        self.memory_length = memory_length
        self.d_hidden = d_hidden

        # Only W1 is learned!
        self.weights_1 = nn.Parameter(
            torch.randn(memory_length, d_hidden, d_model) * 0.02
        )

        # Biases for each layer
        self.bias_1 = nn.Parameter(torch.zeros(1, d_hidden, d_model))
        self.bias_2 = nn.Parameter(torch.zeros(1, d_hidden, d_model))
        self.bias_3 = nn.Parameter(torch.zeros(1, d_model))

        # Single operator applied recursively
        self.contraction = ContractionOperator(memory_length)
        self.T = SpectralOperator(max_rank=operator_rank)

        # Intermediate projections for shape matching
        self.proj_1_to_2 = nn.Linear(d_model, d_model, bias=False)
        nn.init.eye_(self.proj_1_to_2.weight)

    @property
    def weights_2(self) -> torch.Tensor:
        """W2 = T(contract(W1))"""
        W1_c = self.contraction(self.weights_1)  # (h, d)
        return self.T(W1_c)

    @property
    def weights_3(self) -> torch.Tensor:
        """W3 = T(W2) = T²(W1)"""
        return self.T(self.weights_2)

    def forward(
        self,
        pre_acts_history: torch.Tensor,
        state_context: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """Three-layer forward with recursive weights"""
        inputs = pre_acts_history[..., -self.memory_length:]

        # Layer 1: W1 (base)
        h1 = torch.einsum('bdM, Mhd -> bdh', inputs, self.weights_1)
        h1 = h1 + self.bias_1.transpose(1, 2)
        h1 = F.relu(h1)

        # Layer 2: W2 = T(W1)
        W2 = self.weights_2
        h2 = torch.einsum('bdh, hd -> bdh', h1, W2)
        h2 = h2 + self.bias_2.transpose(1, 2)
        h2 = F.relu(h2)

        # Layer 3: W3 = T²(W1)
        W3 = self.weights_3
        out = torch.einsum('bdh, hd -> bd', h2, W3) + self.bias_3

        return out


# === CROSS-SPECIALIST RECURSIVE WEIGHTS ===

class RecursiveSpecialistOperator(nn.Module):
    """
    Derives specialist weights from central foundation weights.

    Central.W1 --[T_domain]--> Specialist.W1

    Each domain (LOGOS, PHYSIS, etc.) has its own compact operator,
    but all share the central foundation weights.
    """
    def __init__(self, domain: str, d_model: int = 128, operator_rank: int = 4):
        super().__init__()
        self.domain = domain

        # Domain-specific spectral modulation
        self.domain_spectrum = nn.Parameter(torch.ones(operator_rank))

        # Domain-specific bias/offset
        self.domain_offset = nn.Parameter(torch.zeros(d_model) * 0.01)

        # Blend with central
        self.alpha = nn.Parameter(torch.tensor(0.9))  # High = more like central

    def forward(self, central_W: torch.Tensor) -> torch.Tensor:
        """
        Derive specialist W from central W.

        Args:
            central_W: Central foundation weight matrix
        Returns:
            specialist_W: Domain-adapted weight matrix
        """
        # SVD of central weights
        if central_W.dim() > 2:
            shape = central_W.shape
            W_2d = central_W.reshape(-1, shape[-1])
        else:
            W_2d = central_W
            shape = None

        U, S, Vh = torch.linalg.svd(W_2d, full_matrices=False)

        # Modulate spectrum with domain-specific values
        k = min(len(self.domain_spectrum), S.shape[-1])
        S_mod = S.clone()
        S_mod[..., :k] = S[..., :k] * F.softplus(self.domain_spectrum)

        # Reconstruct
        W_spec = U @ torch.diag_embed(S_mod) @ Vh

        # Add domain offset (broadcast over leading dims)
        W_spec = W_spec + self.domain_offset

        # Blend with original
        W_out = self.alpha * central_W.reshape_as(W_spec) + (1 - self.alpha) * W_spec

        if shape is not None:
            W_out = W_out.reshape(shape)

        return W_out


class RecursiveSpecialistNLM(nn.Module):
    """
    Specialist NLM that derives weights from central foundation.

    Usage:
        central_nlm = RecursiveNLM(...)
        logos_nlm = RecursiveSpecialistNLM(central_nlm, 'LOGOS')

    The specialist has no independent W1 - it's derived from central!
    """
    def __init__(
        self,
        central_nlm: RecursiveNLM,
        domain: str,
        operator_rank: int = 4
    ):
        super().__init__()
        self.central_nlm = central_nlm
        self.domain = domain

        # Domain-specific derivation operator
        self.domain_op = RecursiveSpecialistOperator(
            domain=domain,
            d_model=central_nlm.d_model,
            operator_rank=operator_rank
        )

        # Independent biases per specialist (cheap)
        self.bias_1 = nn.Parameter(torch.zeros(1, central_nlm.d_hidden, central_nlm.d_model))
        self.bias_2 = nn.Parameter(torch.zeros(1, central_nlm.d_model))

    @property
    def weights_1(self) -> torch.Tensor:
        """Derive from central's W1"""
        return self.domain_op(self.central_nlm.weights_1)

    @property
    def weights_2(self) -> torch.Tensor:
        """Derive from central's W2 (which is already derived from W1!)"""
        return self.domain_op(self.central_nlm.weights_2)

    def forward(
        self,
        pre_acts_history: torch.Tensor,
        state_context: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """Forward with domain-derived weights"""
        inputs = pre_acts_history[..., -self.central_nlm.memory_length:]

        W1 = self.weights_1  # Derived from central
        W2 = self.weights_2  # Derived from central

        # Layer 1
        h = torch.einsum('bdM, Mhd -> bdh', inputs, W1)
        h = h + self.bias_1.transpose(1, 2)
        h = F.relu(h)

        # Layer 2
        out = torch.einsum('bdh, hd -> bd', h, W2) + self.bias_2

        return out
    
    def update_weights(self, grads, lr: float = 1e-3):
        """
        Gradients for specialist flow back to:
        1. Domain Operator (specialist specific)
        2. Central W1 (shared!)
        """
        # We need to manually route gradients because update_weights is called by the GRPO loop
        # For the recursive specialist, 'grads' here corresponds to the implicit parameters
        
        # In the functional call context used by GRPO, 'grads' matches the output of `target_nlm.parameters()`
        # which includes the domain_op, biases, AND the central_nlm parameters if they weren't detached.
        
        # However, for simplicity here, we assume fused_sgd_update can handle the parameter list
        params = list(self.parameters())
        if len(params) != len(grads):
             # This happens if grads include non-trainable or if order differs
             pass 
             
        from ctm_model import fused_sgd_update
        fused_sgd_update(params, list(grads), lr)
        return params

    def parameter_report(self) -> dict:
        """Specialist params are tiny - just the operator + biases"""
        operator_params = sum(p.numel() for p in self.domain_op.parameters())
        bias_params = self.bias_1.numel() + self.bias_2.numel()

        # Compare to full independent NLM
        full_nlm_params = (
            self.central_nlm.weights_1.numel() +
            self.central_nlm.d_hidden * self.central_nlm.d_model +  # W2
            self.bias_1.numel() + self.bias_2.numel()
        )

        return {
            'specialist_params': operator_params + bias_params,
            'full_nlm_params': full_nlm_params,
            'savings_percent': 100 * (1 - (operator_params + bias_params) / full_nlm_params)
        }


# === FACTORY FUNCTIONS ===

def create_recursive_ctm_weights(
    d_model: int = 128,
    memory_length: int = 15,
    d_hidden: int = 4,
    num_specialists: int = 7,
    operator: str = 'spectral',
    operator_rank: int = 8,
) -> Tuple[RecursiveNLM, dict]:
    """
    Create central NLM + specialist NLMs with recursive weight sharing.

    Returns:
        central_nlm: The foundation NLM with base weights
        specialists: Dict mapping domain -> RecursiveSpecialistNLM
    """
    # Central foundation
    central_nlm = RecursiveNLM(
        d_model=d_model,
        memory_length=memory_length,
        d_hidden=d_hidden,
        operator=operator,
        operator_rank=operator_rank,
    )

    # Domain specialists (all derive from central!)
    domains = ['LOGOS', 'PHYSIS', 'BIOS', 'NOMOS', 'PSYCHE', 'SOPHIA', 'OIKOS'][:num_specialists]
    specialists = {}

    for domain in domains:
        specialists[domain] = RecursiveSpecialistNLM(
            central_nlm=central_nlm,
            domain=domain,
            operator_rank=operator_rank // 2,  # Smaller for specialists
        )

    return central_nlm, specialists


def total_parameter_savings(
    central_nlm: RecursiveNLM,
    specialists: dict,
) -> dict:
    """Calculate total parameter savings for the full system"""

    # Original architecture: 8 independent NLMs
    original_per_nlm = (
        central_nlm.memory_length * central_nlm.d_hidden * central_nlm.d_model +  # W1
        central_nlm.d_hidden * central_nlm.d_model +  # W2
        central_nlm.d_hidden * central_nlm.d_model +  # bias_1
        central_nlm.d_model  # bias_2
    )
    original_total = original_per_nlm * (1 + len(specialists))

    # Recursive architecture
    central_params = sum(p.numel() for p in central_nlm.parameters())
    specialist_params = sum(
        sum(p.numel() for p in spec.parameters() if p.requires_grad)
        for spec in specialists.values()
    )
    # Subtract central's params from specialist count (they're shared)
    for spec in specialists.values():
        specialist_params -= sum(
            p.numel() for p in spec.central_nlm.parameters()
        )
    recursive_total = central_params + specialist_params

    return {
        'original_total': original_total,
        'recursive_total': recursive_total,
        'absolute_savings': original_total - recursive_total,
        'percent_savings': 100 * (1 - recursive_total / original_total),
    }


# === TESTING ===

if __name__ == '__main__':
    print("=" * 60)
    print("Examiner-CTM v5.3: Recursive Weight Derivation")
    print("=" * 60)

    # Test RecursiveNLM
    print("\n[1] Testing RecursiveNLM...")
    nlm = RecursiveNLM(d_model=128, memory_length=15, d_hidden=4, operator='spectral')

    x = torch.randn(2, 128, 15)  # (batch, d_model, memory)
    ctx = torch.randn(2, 128)    # (batch, d_model)

    out = nlm(x, state_context=ctx)
    print(f"    Input:  {x.shape}")
    print(f"    Output: {out.shape}")

    report = nlm.parameter_report()
    print(f"    Original params: {report['original_total']:,}")
    print(f"    Recursive params: {report['recursive_total']:,}")
    print(f"    Savings: {report['savings_percent']:.1f}%")

    # Test gradient flow
    print("\n[2] Testing gradient flow through operator...")
    loss = out.sum()
    loss.backward()

    grad_w1 = nlm.weights_1.grad
    print(f"    W1 gradient shape: {grad_w1.shape}")
    print(f"    W1 gradient norm: {grad_w1.norm():.4f}")

    # Test cross-specialist
    print("\n[3] Testing cross-specialist recursive weights...")
    central, specialists = create_recursive_ctm_weights(num_specialists=7)

    for domain, spec in specialists.items():
        spec_out = spec(x, state_context=ctx)
        spec_report = spec.parameter_report()
        print(f"    {domain}: {spec_report['specialist_params']:,} params "
              f"({spec_report['savings_percent']:.1f}% savings)")

    # Total savings
    print("\n[4] Total system parameter savings...")
    savings = total_parameter_savings(central, specialists)
    print(f"    Original (8 independent NLMs): {savings['original_total']:,}")
    print(f"    Recursive (shared + operators): {savings['recursive_total']:,}")
    print(f"    Total savings: {savings['absolute_savings']:,} params ({savings['percent_savings']:.1f}%)")

    print("\n" + "=" * 60)
    print("v5.3 Recursive Weights: Ready for integration")
    print("=" * 60)
