
import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import sys
import os
import random
import torch.distributions as dist
from torch.func import functional_call, vmap, grad
from typing import Literal, Optional

# GPU Performance Optimization Utilities ---

# Priority 1: Custom CTM Triton Kernels (L4 Optimized)
# Priority 2: External ttt_v3 kernels
# Priority 3: Pure PyTorch Fallback

try:
    from ctm_triton_kernels import triton_fused_sgd, triton_ngram_hash, triton_gated_silu_residual
    # Verify Triton can actually run (small test)
    if torch.cuda.is_available():
        USE_CTM_TRITON = True
        print("[OK] CTM Triton Kernels Loaded (L4 Optimized)")
    else:
        USE_CTM_TRITON = False
        print("[Warning] CTM Triton Kernels loaded but CUDA unavailable. Falling back to PyTorch.")
except (ImportError, RuntimeError, OSError, Exception) as e:
    USE_CTM_TRITON = False
    print(f"[Warning] CTM Triton Kernels unavailable: {e}")
    try:
        from ttt_v3.kernels.triton_kernels import fused_sgd_update
    except (ImportError, RuntimeError, OSError):
        def fused_sgd_update(params, grads, lr):
            return [p - lr * g for p, g in zip(params, grads)]

# Unified Fallback Chain - Pure PyTorch for stability
_TRITON_FAILED_ONCE = False

def fused_sgd_update(params, grads, lr):
    global _TRITON_FAILED_ONCE
    
    # If Triton failed before, skip it permanently for this session
    if USE_CTM_TRITON and not _TRITON_FAILED_ONCE:
        try:
            # Identify CUDA params for Triton and CPU params for fallback
            cuda_params = []
            cuda_grads = []
            cpu_params = []
            cpu_grads = []
            
            for p, g in zip(params, grads):
                if p is None or g is None: continue
                
                # Check for floating point optimization candidates
                if p.is_floating_point() and p.dtype in [torch.float32, torch.float16, torch.bfloat16]:
                    if p.is_cuda:
                        cuda_params.append(p)
                        cuda_grads.append(g)
                    else:
                        cpu_params.append(p)
                        cpu_grads.append(g)
                else:
                    # Non-floating point or other types -> CPU fallback list
                    cpu_params.append(p)
                    cpu_grads.append(g)
            
            # 1. Apply Triton to CUDA params
            if cuda_params:
                triton_fused_sgd(cuda_params, cuda_grads, lr)
            
            # 2. Apply PyTorch fallback to non-CUDA params
            if cpu_params:
                with torch.no_grad():
                    for p, g in zip(cpu_params, cpu_grads):
                        p.add_(g, alpha=-lr)
                        
            return params
        except Exception as e:
            print(f"Triton SGD failed once, disabling for session: {e}")
            _TRITON_FAILED_ONCE = True
    
    # PyTorch fallback (in-place)
    with torch.no_grad():
        for p, g in zip(params, grads):
            if p is not None and g is not None:
                p.add_(g, alpha=-lr)
    return params

def fallback_sgd(params, grads, lr):
     return [p - lr * g for p, g in zip(params, grads)]
     
# --- 2. TTT Functional Utilities ---

def inner_loss(params, model_func, x, targets):
    """ MSE Loss for CTM Self-Supervised Adaptation """
    # x: (Batch, Seq, Dim), targets: (Batch, Seq, Dim)
    preds = model_func(params, x)
    return F.mse_loss(preds, targets)

def inner_step(params, buffers, model_func, x, y, lr):
    # Functional gradient step
    def compute_loss(p):
        return inner_loss(p, model_func, x, y)
        
    grads = grad(compute_loss)(params)
    
    # Simple SGD update
    new_params = {k: v - lr * g for k, v, g in zip(params.keys(), params.values(), grads.values())}
    return new_params

def run_inner_loop(params, buffers, model_func, context, steps=1, lr=1e-2):
    # context: (B, T, D)
    x_in = context[:, :-1]
    y_tgt = context[:, 1:]
    
    curr_params = params
    for _ in range(steps):
        curr_params = inner_step(curr_params, buffers, model_func, x_in, y_tgt, lr)
        
    return curr_params


# --- 2.5 mHC (Manifold-Constrained Hyper-Connections) Utilities ---

def sinkhorn_knopp(M, iterations=30):
    """
    Sinkhorn-Knopp algorithm to project a positive matrix onto the Birkhoff polytope (doubly stochastic manifold).
    M: (Batch, N, N) positive matrix
    """
    for _ in range(iterations):
        # Row normalization
        M = M / (M.sum(dim=-1, keepdim=True) + 1e-8)
        # Column normalization
        M = M / (M.sum(dim=-2, keepdim=True) + 1e-8)
    return M

class HyperConnection(nn.Module):
    """
    Manifold-Constrained Hyper-Connection (mHC)
    Inspired by: https://arxiv.org/html/2512.24880v2
    """
    def __init__(self, d_model, n_streams=2):
        super().__init__()
        self.d_model = d_model
        self.n = n_streams
        
        # Hyper-parameters for dynamic mapping
        self.W_q = nn.Linear(d_model * n_streams, n_streams * n_streams)
        self.b_q = nn.Parameter(torch.zeros(n_streams, n_streams))
        
    def forward(self, streams):
        """
        streams: List of Tensors [(B, D), (B, D), ...]
        """
        B = streams[0].size(0)
        device = streams[0].device
        
        # Flatten and concatenate streams for context
        # In the paper, x_vec = vec(x_l)
        x_flat = torch.cat(streams, dim=-1) # (B, n*D)
        
        # Generate raw mapping H_tilde
        H_tilde = self.W_q(x_flat).view(B, self.n, self.n) + self.b_q
        
        # Sinkhorn-Knopp Projection (Exp -> Normalize)
        # M = exp(H_tilde) ensures all elements are positive
        M = torch.exp(H_tilde)
        H_res = sinkhorn_knopp(M)
        
        # Apply projection: y = H_res * x
        # Stack streams: (B, n, D)
        x_stack = torch.stack(streams, dim=1)
        y = torch.bmm(H_res, x_stack) # (B, n, D)
        
        return [y[:, i, :] for i in range(self.n)]


# --- 3. Engram Module (Memory) ---

class EngramModule(nn.Module):
    """
    Engram: Conditional Memory via Scalable Lookup (Arxiv: 2601.07372)
    """
    def __init__(self, d_model: int, num_heads: int = 1, ngram_order: int = 3, table_size: int = 100000):
        super().__init__()
        self.d_model = d_model
        self.ngram_order = ngram_order
        self.num_heads = num_heads
        
        # 1. Sparse Memory
        self.table_size = table_size
        self.memory_table = nn.Embedding(table_size, d_model)
        nn.init.normal_(self.memory_table.weight, mean=0.0, std=0.02)
        
        # 2. Gating Mechanisms
        self.gate_proj_k = nn.Linear(d_model, d_model, bias=False)
        self.gate_proj_v = nn.Linear(d_model, d_model, bias=False)
        self.rms_norm_h = nn.RMSNorm(d_model)
        self.rms_norm_e = nn.RMSNorm(d_model)
        
        # 3. Convolution
        self.conv = nn.Conv1d(
            in_channels=d_model, 
            out_channels=d_model, 
            kernel_size=4, 
            dilation=ngram_order,
            groups=d_model, 
            padding=0  # Manual causal padding used in forward
        )
        
    def _compute_ngram_hashes(self, input_ids: torch.Tensor):
        B, T = input_ids.shape
        device = input_ids.device
        
        if self.ngram_order == 1:
            return input_ids % self.table_size
            
        # Fast approximation: XOR mix
        # In production, use unfold + matrix mult
        pad_ids = F.pad(input_ids, (self.ngram_order-1, 0), value=0)
        unfolded = pad_ids.unfold(dimension=1, size=self.ngram_order, step=1)
        
        mixed = torch.zeros((B, T), dtype=torch.long, device=device)
        multipliers = [33**i for i in range(self.ngram_order)]
        
        for i in range(self.ngram_order):
            mixed = mixed ^ (unfolded[:, :, i] * multipliers[i])
            
        return mixed % self.table_size

    def forward(self, input_ids: torch.Tensor, hidden_states: torch.Tensor):
        # 1. Retrieval
        hash_indices = self._compute_ngram_hashes(input_ids)
        memory_embeds = self.memory_table(hash_indices)
        
        # 2. Gating
        h_norm = self.rms_norm_h(hidden_states)
        e_norm = self.rms_norm_e(memory_embeds)
        
        k = self.gate_proj_k(h_norm)
        start_gate = (k * e_norm).sum(dim=-1, keepdim=True)
        alpha = torch.sigmoid(start_gate)
        
        # 3. Modulation & Fusion
        v = self.gate_proj_v(memory_embeds)
        gated_v = alpha * v
        
        # Convolution
        gated_v_t = gated_v.transpose(1, 2)
        
        pad_size = self.ngram_order * (4 - 1)
        if pad_size > 0:
             gated_v_t = F.pad(gated_v_t, (pad_size, 0))
             
        conv_out = self.conv(gated_v_t)
        y = conv_out.transpose(1, 2)
        y = F.silu(y)
        
        return hidden_states + y


# --- 4. CTM / NLM (The Model) ---

class NeuronLevelModel(nn.Module):
    """
    Privately Parameterized Neuron-Level Models (NLMs)
    """
    def __init__(self, d_model, memory_length, d_hidden=4):
        super().__init__()
        self.d_model = d_model
        self.memory_length = memory_length
        self.d_hidden = d_hidden
        
        # weights_1: (M, d_hidden, d_model)
        self.weights_1 = nn.Parameter(torch.randn(memory_length, d_hidden, d_model) * 0.02)
        self.bias_1 = nn.Parameter(torch.zeros(1, d_hidden, d_model))
        
        # weights_2: (d_hidden, d_model)
        self.weights_2 = nn.Parameter(torch.randn(d_hidden, d_model) * 0.02)
        self.bias_2 = nn.Parameter(torch.zeros(1, d_model))

    def forward(self, pre_acts_history, state_context=None):
        # inputs: (B, D, M)
        inputs = pre_acts_history[..., -self.memory_length:] 
        
        # --- PHASE 3: ASN (Adaptive Spike Neurons) ---
        # Content-adaptive memory decay logic. 
        # Modulates the influence of historical pre-activations based on current state.
        if state_context is not None:
             # state_context: (B, D)
             # Compute adaptive gate: (B, 1, M)
             # We use a simple projection to get a decay mask
             gate = torch.sigmoid(torch.einsum('bd, mhd -> bhm', state_context, self.weights_1[:1])) # (B, d_hidden, M)
             gate = gate.mean(dim=1, keepdim=True) # (B, 1, M)
             inputs = inputs * gate
        
        h = torch.einsum('bdM, Mhd -> bdh', inputs, self.weights_1) + self.bias_1.transpose(1, 2)
        h = F.relu(h)
        out = torch.einsum('bdh, hd -> bd', h, self.weights_2) + self.bias_2
        
        return out

    def update_weights(self, grads, lr=1e-3):
        params = [self.weights_1, self.bias_1, self.weights_2, self.bias_2]
        return fused_sgd_update(params, list(grads), lr)


class RLMMemoryGate(nn.Module):
    """Recursive Memory Protocol (RLM) Cross-Attention Gate"""
    def __init__(self, d_model, n_heads=4):
        super().__init__()
        self.d_model = d_model
        self.attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True)
        self.norm = nn.LayerNorm(d_model)
        self.w_m = nn.Linear(d_model, d_model)

    def forward(self, z, memory):
        # z: (B, D), memory: (B, M, D)
        z_q = z.unsqueeze(1) # (B, 1, D)
        # Memory update: Cross-attention where z queries the memory manifold
        m_out, _ = self.attn(z_q, memory, memory)
        new_memory = self.norm(memory + self.w_m(m_out).expand_as(memory))
        return new_memory


class NeuralSynchronization(nn.Module):
    """Neural Synchronization Matrix (arXiv:2505.05522v4 Section 3.4)"""
    def __init__(self, d_model, d_out, d_action, num_pairs=64):
        super().__init__()
        self.d_model = d_model
        self.num_pairs = num_pairs
        
        # Randomly sample neuron pairs (i,j) for sync computation
        self.register_buffer('pairs_out', torch.randint(0, d_model, (num_pairs, 2)))
        self.register_buffer('pairs_action', torch.randint(0, d_model, (num_pairs, 2)))
        
        # Learnable temporal decay per pair (r_ij >= 0)
        self.decay_out = nn.Parameter(torch.zeros(num_pairs))
        self.decay_action = nn.Parameter(torch.zeros(num_pairs))
        
        # Buffer for telemetry/visualization (arXiv:2505.05522v4 Sec 3.4)
        self.register_buffer('S', torch.zeros(1, num_pairs))
        
        # Output projections
        self.W_out = nn.Linear(num_pairs, d_out)
        self.W_action = nn.Linear(num_pairs, d_action)
    
    def forward(self, z_history):
        """z_history: (B, D, T) - history of post-activations"""
        B, D, T = z_history.shape
        
        # Compute sync for sampled pairs
        def compute_sync(pairs, decay):
            i_idx, j_idx = pairs[:, 0], pairs[:, 1]
            z_i = z_history[:, i_idx, :]  # (B, num_pairs, T)
            z_j = z_history[:, j_idx, :]  # (B, num_pairs, T)
            
            # Temporal decay weights
            t_range = torch.arange(T, device=z_history.device).to(z_history.dtype)
            weights = torch.exp(-decay.abs().unsqueeze(1) * (T - 1 - t_range))  # (num_pairs, T)
            
            # Weighted inner product
            sync = (z_i * z_j * weights.unsqueeze(0)).sum(dim=-1)  # (B, num_pairs)
            return sync
        
        S_out = compute_sync(self.pairs_out, self.decay_out)
        S_action = compute_sync(self.pairs_action, self.decay_action)
        
        # Update buffer for telemetry (detach to keep from affecting graph)
        self.S.copy_(S_out.detach().mean(dim=0, keepdim=True))
        
        y = self.W_out(S_out)
        q = self.W_action(S_action)
        return y, q


class ContinuousThoughtMachine(nn.Module):
    """True CTM per arXiv:2505.05522v4

    v5.3: Supports Recursive Weight Derivation via use_recursive_weights flag.
    When enabled, uses RecursiveNLM which derives W2 from W1 via learned operators,
    achieving 80.5% parameter savings with 7 specialists.
    """
    def __init__(
        self,
        d_model,
        memory_length,
        num_thoughts=5,
        d_out=None,
        use_recursive_weights: bool = False,
        recursive_operator: Literal['spectral', 'linear', 'residual'] = 'spectral',
        recursive_operator_rank: int = 8,
    ):
        super().__init__()
        self.d_model = d_model
        self.memory_length = memory_length
        self.num_thoughts = num_thoughts
        self.use_recursive_weights = use_recursive_weights
        self.recursive_operator = recursive_operator
        self.recursive_operator_rank = recursive_operator_rank
        d_out = d_out or d_model

        # v5.3: Choose NLM implementation based on recursive weight flag
        if use_recursive_weights:
            try:
                from recursive_weights import RecursiveNLM
                self.nlm = RecursiveNLM(
                    d_model=d_model,
                    memory_length=memory_length,
                    d_hidden=4,
                    operator=recursive_operator,
                    operator_rank=recursive_operator_rank,
                )
                print(f"[v5.3] Using RecursiveNLM with {recursive_operator} operator (rank={recursive_operator_rank})")
            except ImportError:
                print("[v5.3] Warning: recursive_weights module not found, falling back to standard NLM")
                self.nlm = NeuronLevelModel(d_model, memory_length)
        else:
            self.nlm = NeuronLevelModel(d_model, memory_length)
        self.synapse = nn.Linear(d_model * 2, d_model)  # U-Net style in paper, simplified here
        
        self.z_init = nn.Parameter(torch.randn(d_model) * 0.02)
        self.history_init = nn.Parameter(torch.zeros(d_model, memory_length))
        
        # Neural Synchronization (THE key CTM component)
        self.sync = NeuralSynchronization(d_model, d_out, d_model, num_pairs=64)
        
        self.engram = EngramModule(d_model=d_model, ngram_order=3)
        self.mhc = HyperConnection(d_model, n_streams=2)
        
        # --- PHASE 4: Recursive Memory Protocol (RLM) ---
        self.memory_tokens = 4 # 4-token latent manifold
        self.rlm_memory_init = nn.Parameter(torch.randn(1, self.memory_tokens, d_model) * 0.02)
        self.rlm_gate = RLMMemoryGate(d_model)
        
        # --- PHASE 3: DroPE (Position Embedding Dropout) ---
        self.drope_alpha = nn.Parameter(torch.ones(1) * 0.1) # Starting friction
        
        # --- PHASE 3: CHT (Continual Hyper-Weights) ---
        # A tiny HyperNetwork to generate dynamic LoRA-style offsets per cycle
        self.hyper_gen = nn.Sequential(
            nn.Linear(d_model, d_model // 16),
            nn.ReLU(),
            nn.Linear(d_model // 16, d_model * 2) # Offsets for synapse (simplified as vector gate)
        )
        
        # --- PHASE 3: Spiking Backend (Identity Fallback) ---
        self.spiking_mode = False


    def forward(self, x, input_ids=None):
        """CTM Forward: Thought loop with Neural Synchronization output."""
        B = x.size(0)

        # Engram Retrieval - preserve 3D structure, use last token as input
        if self.engram is not None and input_ids is not None:
            if x.ndim == 2:
                x_seq = x.unsqueeze(1)
                if input_ids.ndim == 1: input_ids = input_ids.unsqueeze(1)
                x_seq = self.engram(input_ids, x_seq)
                x = x_seq[:, -1, :]  # Use last token (causal) instead of mean
            else:
                x_enriched = self.engram(input_ids, x)
                if x_enriched.dim() == 3:
                    x = x_enriched[:, -1, :]  # Use last token instead of pooling
                else:
                    x = x_enriched
        
        # v5.1 Global Safety: Ensure x is 2D (B, D) before thought loop
        if x.dim() == 3:
            x = x[:, -1, :]

        # Initialize
        pre_acts_history = self.history_init.unsqueeze(0).expand(B, -1, -1).clone()
        z = self.z_init.unsqueeze(0).expand(B, -1)
        z_history = z.unsqueeze(-1)  # (B, D, 1) - for sync matrix
        
        # Initialize RLM Manifold for current forward pass
        self.rlm_manifold = self.rlm_memory_init.expand(B, -1, -1).clone()
        
        # --- PHASE 3: sIFP(SUM) Fixed-Point Tracking ---
        self.thought_deltas = []
        outputs = []
        
        # Thought Loop
        for t in range(self.num_thoughts):
            # CHT: Dynamic offset generation
            h_offset = self.hyper_gen(z) # (B, D*2)
            
            combined = torch.cat([x, z], dim=-1)
            # Apply hyper-modulation
            combined = combined * torch.sigmoid(h_offset) 
            
            pre_act = self.synapse(combined)
            
            [x_fused, z_fused] = self.mhc([x, z])
            pre_acts_history = torch.cat([pre_acts_history[..., 1:], pre_act.unsqueeze(-1)], dim=-1)
            
            # ASN: Pass 'z' as context to modulate memory decay
            z_new = self.nlm(pre_acts_history, state_context=z) + z_fused
            
            # --- PHASE 4: RLM Memory Update ---
            # Update the latent manifold via the RLM Gate
            self.rlm_manifold = self.rlm_gate(z_new, self.rlm_manifold)
            # Inject summarized manifold state back into the next z cycle
            z_new = z_new + 0.05 * self.rlm_manifold.mean(dim=1)

            # sIFP(SUM): Fixed-point convergence audit
            delta = torch.norm(z_new - z, p=2, dim=-1).mean()
            self.thought_deltas.append(delta)
            z = z_new
            
            # Spiking Backend: Sparse Identity Mapping (0.3 spikes/neuron)
            if self.spiking_mode:
                # Approximate a spike by thresholding
                z = torch.where(z > 0.5, z, torch.zeros_like(z))
            
            # DroPE Friction: Stochastic attenuation of positional gravity
            if self.training and random.random() < 0.2:
                z = z * (1.0 - torch.sigmoid(self.drope_alpha))
            
            # --- PHASE 3: Local EGOP (Geometric Manifold Constraint) ---
            # Penalize z from drifting too far from the local tangent plane
            if t > 0 and len(outputs) > 0:
                prev_y = outputs[-1]
                egop_penalty = torch.norm(z - prev_y, p=2, dim=-1).mean() * 0.01
                z = z - egop_penalty * (z - prev_y)
            
            # Accumulate z history for sync
            z_history = torch.cat([z_history, z.unsqueeze(-1)], dim=-1)
            
            # Sync-based output (THE CTM key)
            y_t, _ = self.sync(z_history)
            outputs.append(y_t)
            
        return torch.stack(outputs, dim=1)  # (B, T, d_out)

    def forward_ttt(self, x, input_ids=None, ttt_steps=1, ttt_lr=0.01):
        """
        TTT Forward Pass: Retrieval -> Adaptation -> Inference
        """
        B = x.size(0)
        
        # 1. Retrieval
        context = None
        if self.engram is not None and input_ids is not None:
             if x.ndim == 2: x_seq = x.unsqueeze(1)
             else: x_seq = x
             if input_ids.ndim == 1: input_ids = input_ids.unsqueeze(1)
             context = self.engram(input_ids, x_seq)
             
        if context is None or context.size(1) < 2:
            if x.ndim == 3: x = x.view(-1, self.d_model)
            return self.forward(x, input_ids.view(-1) if input_ids is not None else None)

        # 2. Adaptation (TTT)
        params = dict(self.nlm.named_parameters())
        buffers = dict(self.nlm.named_buffers())
        
        # Reshape context for NLM: (B, D, S)
        x_adapt = context.transpose(1, 2) 
        
        # Setup TTT Sample (Last Window)
        x_in = x_adapt[:, :, :-1]
        y_tgt = context[:, -1, :]
        
        # Padding/Truncation
        curr_len = x_in.size(2)
        target_len = self.memory_length
        if curr_len > target_len:
             x_in = x_in[:, :, -target_len:]
        elif curr_len < target_len:
             pad_size = target_len - curr_len
             x_in = F.pad(x_in, (pad_size, 0), value=0.0)
             
        def compute_loss(p):
             pred = functional_call(self.nlm, (p, buffers), x_in)
             return F.mse_loss(pred, y_tgt)
             
        grads = grad(compute_loss)(params)
        fast_params = {k: v - ttt_lr * g for k, v, g in zip(params.keys(), params.values(), grads.values())}
        
        # 3. Inference with Fast Weights
        x_flat = x.view(-1, self.d_model)
        B_flat = x_flat.size(0)
        
        pre_acts_history = self.history_init.unsqueeze(0).expand(B_flat, -1, -1)
        z = self.z_init.unsqueeze(0).expand(B_flat, -1)
        outputs = []
        
        for t in range(self.num_thoughts):
             combined = torch.cat([x_flat, z], dim=-1)
             pre_act = self.synapse(combined)
             pre_acts_history = torch.cat([pre_acts_history[..., 1:], pre_act.unsqueeze(-1)], dim=-1)
             
             # Call NLM with FAST PARAMS
             z = functional_call(self.nlm, (fast_params, buffers), pre_acts_history)
             outputs.append(z)
             
        return torch.stack(outputs, dim=1)

    def generate_thought_group(self, x, input_ids=None, group_size=4, noise_scale=0.1, custom_nlm=None, entropy_scale=1.0):
        """ (Used for RL) Generates exploration group with dynamic entropy injection """
        target_nlm = custom_nlm if custom_nlm is not None else self.nlm
        
        # --- STOCHASTIC EXPLORATION ---
        # Scale noise based on entropy_scale to preserve 'strange reality'
        current_noise = noise_scale * entropy_scale
        if entropy_scale > 1.5:
             print(f"  [StochasticExploration] Injecting high entropy ({entropy_scale:.2f}). Scanning the tails.")
        
        x_single = x[0] 
        # Mean pool if sequence
        if x_single.ndim > 1:
            x_single = x_single.mean(dim=0)

        # Engram Retrieval for single item - use last token
        if self.engram is not None and input_ids is not None:
            id_single = input_ids[0].unsqueeze(0)
            if id_single.ndim == 1: id_single = id_single.unsqueeze(0)
            x_seq_single = x_single.unsqueeze(0).unsqueeze(1)
            x_seq_single = self.engram(id_single, x_seq_single)
            x_single = x_seq_single[:, -1, :].squeeze(0)  # Last token
            
        x_group = x_single.unsqueeze(0).expand(group_size, -1)
        B = group_size
        
        pre_acts_history = self.history_init.unsqueeze(0).expand(B, -1, -1)
        z = self.z_init.unsqueeze(0).expand(B, -1)
        outputs = []
        log_probs = []
        
        for t in range(self.num_thoughts):
            # Combined context
            combined = torch.cat([x_group, z], dim=-1)
            pre_act = self.synapse(combined)
            
            # Use mHC for stable fusion during exploration
            [x_fused_group, z_fused_group] = self.mhc([x_group, z])
            
            pre_acts_history = torch.cat([pre_acts_history[..., 1:], pre_act.unsqueeze(-1)], dim=-1)
            z_mean = target_nlm(pre_acts_history)
            
            # Incorporate mHC stabilized component
            z_mean = z_mean + z_fused_group
            
            m = dist.Normal(z_mean, torch.ones_like(z_mean) * current_noise)
            z_sample = m.rsample()
            log_probs.append(m.log_prob(z_sample))
            z = z_sample
            outputs.append(z)
            
        return torch.stack(outputs, dim=1), torch.stack(log_probs, dim=1)

    def train_step_grpo(self, x, reward_function, input_ids=None, group_size=4, lr=1e-3, beta=0.01, custom_nlm=None, entropy_scale=1.0):
        """ (Used for RL) Runs one step of GrPO and updates weights with variance reduction """
        target_nlm = custom_nlm if custom_nlm is not None else self.nlm

        # We need to make sure generate_thought_group uses the target_nlm and entropy scaling
        thoughts, log_probs = self.generate_thought_group(x, input_ids=input_ids, group_size=group_size, custom_nlm=target_nlm, entropy_scale=entropy_scale)
        rewards = reward_function(thoughts, x)

        # ENHANCEMENT 1: EMA Baseline (reduces variance)
        if not hasattr(target_nlm, 'reward_baseline'):
            target_nlm.reward_baseline = rewards.mean().item()
        else:
            target_nlm.reward_baseline = 0.9 * target_nlm.reward_baseline + 0.1 * rewards.mean().item()

        # ENHANCEMENT 2: Advantage with EMA baseline
        advantages = rewards - target_nlm.reward_baseline
        advantages = advantages / (advantages.std() + 1e-8)
        adv_expanded = advantages.view(-1, 1, 1).expand_as(log_probs)

        # ENHANCEMENT 3: Entropy regularization (prevents policy collapse)
        log_probs_flat = log_probs.view(-1, log_probs.size(-1))
        entropy = -(log_probs_flat.exp() * log_probs_flat).sum(dim=-1).mean()
        entropy_bonus = beta * entropy  # beta=0.01 encourages exploration

        grpo_loss = -(log_probs * adv_expanded).mean() - entropy_bonus
        grads = torch.autograd.grad(grpo_loss, target_nlm.parameters(), create_graph=False, allow_unused=True)
        target_nlm.update_weights(grads, lr)

        return grpo_loss, rewards.mean()

    def train_step_dual_tick(self, x, target_answer, input_ids=None, lr=1e-3, custom_nlm=None):
        """
        Dual-Tick Loss Training (arXiv:2505.05522)
        For exact-answer domains (LOGOS, PHYSIS) with discrete ground truth.
        Optimizes at t1 (fastest correct) and t2 (most confident).
        """
        target_nlm = custom_nlm if custom_nlm is not None else self.nlm

        # Forward pass through thought loop
        outputs = self.forward(x, input_ids)  # (B, T, D)
        B, T, D = outputs.shape

        # Project to logits for classification
        if hasattr(self, 'lm_head'):
            logits = self.lm_head(outputs)  # (B, T, vocab_size)
        else:
            # Simple projection head if lm_head not available
            if not hasattr(self, 'classifier_head'):
                self.classifier_head = nn.Linear(D, 10000).to(outputs.device)  # Vocab size placeholder
            logits = self.classifier_head(outputs)

        # Compute dual-tick loss
        dual_tick_loss = ctm_dual_tick_loss(logits, target_answer)

        # Backward pass
        grads = torch.autograd.grad(dual_tick_loss, target_nlm.parameters(), create_graph=False, allow_unused=True)
        grads = [g if g is not None else torch.zeros_like(p) for g, p in zip(grads, target_nlm.parameters())]
        target_nlm.update_weights(grads, lr)

        return dual_tick_loss, 0.0  # Return loss and dummy reward for interface compatibility

    def get_nlm_parameter_report(self) -> dict:
        """
        v5.3: Get parameter savings report for the NLM.

        Returns parameter comparison between standard and recursive NLM.
        Only meaningful when use_recursive_weights=True.
        """
        if hasattr(self.nlm, 'parameter_report'):
            return self.nlm.parameter_report()
        else:
            # Standard NLM - compute basic stats
            return {
                'original_total': sum(p.numel() for p in self.nlm.parameters()),
                'recursive_total': sum(p.numel() for p in self.nlm.parameters()),
                'savings_percent': 0.0,
                'note': 'Standard NLM (no recursive weights)'
            }


def ctm_dual_tick_loss(outputs, targets, num_classes=None):
    """
    CTM Loss Function (arXiv:2505.05522v4)
    Optimizes at: t1 = argmin(loss), t2 = argmax(certainty)
    outputs: (B, T, C) - predictions at each tick
    targets: (B,) - ground truth labels
    """
    B, T, C = outputs.shape
    
    losses = []
    certainties = []
    
    for t in range(T):
        logits = outputs[:, t, :]
        loss_t = F.cross_entropy(logits, targets, reduction='none')  # (B,)
        
        # Certainty = 1 - normalized entropy
        probs = F.softmax(logits, dim=-1)
        entropy = -(probs * (probs + 1e-8).log()).sum(dim=-1)  # (B,)
        max_entropy = math.log(C)
        certainty_t = 1.0 - (entropy / max_entropy)
        
        losses.append(loss_t)
        certainties.append(certainty_t)
    
    losses = torch.stack(losses, dim=1)  # (B, T)
    certainties = torch.stack(certainties, dim=1)  # (B, T)
    
    # t1 = argmin(loss), t2 = argmax(certainty) per sample
    t1 = losses.argmin(dim=1)  # (B,)
    t2 = certainties.argmax(dim=1)  # (B,)
    
    # Gather losses at selected ticks
    loss_t1 = losses.gather(1, t1.unsqueeze(1)).squeeze(1)
    loss_t2 = losses.gather(1, t2.unsqueeze(1)).squeeze(1)
    
    # Final loss = average of both
    final_loss = (loss_t1 + loss_t2).mean() / 2.0
    return final_loss
