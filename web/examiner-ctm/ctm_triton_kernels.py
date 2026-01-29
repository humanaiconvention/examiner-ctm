"""
CTM Triton Kernels - Optimized for NVIDIA L4 GPU

Key Optimizations:
1. Fused N-gram Hashing
2. Fused SGD Update
3. Fused Gated SiLU (for Engram)
"""
import torch
import triton
import triton.language as tl

# --- 1. Fused N-gram Hash Kernel ---

@triton.jit
def ngram_hash_kernel(
    input_ids_ptr,
    output_ptr,
    ngram_order: tl.constexpr,
    table_size: tl.constexpr,
    seq_len: tl.constexpr,
    BLOCK_SIZE: tl.constexpr
):
    """
    Computes N-gram hashes for Engram memory lookup.
    Uses XOR-mix with polynomial rolling hash (33^i multipliers).
    """
    pid = tl.program_id(0)
    offset = pid * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)
    mask = offset < seq_len
    
    # Load N-gram window
    mixed = tl.zeros([BLOCK_SIZE], dtype=tl.int64)
    
    for i in range(ngram_order):
        idx = offset - (ngram_order - 1 - i)
        idx = tl.where(idx >= 0, idx, 0)
        token = tl.load(input_ids_ptr + idx, mask=mask, other=0)
        multiplier = 33 ** i
        mixed = mixed ^ (token * multiplier)
    
    result = mixed % table_size
    tl.store(output_ptr + offset, result, mask=mask)


def triton_ngram_hash(input_ids: torch.Tensor, ngram_order: int = 3, table_size: int = 100000):
    """
    Wrapper for N-gram hash kernel.
    
    Args:
        input_ids: (B, T) Long tensor of token IDs
        ngram_order: Size of the N-gram window
        table_size: Size of the Engram memory table
        
    Returns:
        (B, T) Long tensor of hash indices
    """
    B, T = input_ids.shape
    output = torch.empty_like(input_ids)
    
    # Grid: one block per position (batch-sequential for simplicity)
    # Could be further optimized with 2D grid
    for b in range(B):
        grid = lambda meta: (triton.cdiv(T, meta['BLOCK_SIZE']),)
        ngram_hash_kernel[grid](
            input_ids[b].contiguous(),
            output[b].contiguous(),
            ngram_order=ngram_order,
            table_size=table_size,
            seq_len=T,
            BLOCK_SIZE=128  # L4 optimal
        )
    
    return output


# --- 2. Fused SGD Update Kernel ---

@triton.jit
def fused_sgd_kernel(
    param_ptr,
    grad_ptr,
    n_elements,
    lr,
    BLOCK_SIZE: tl.constexpr
):
    """
    Fused SGD: param = param - lr * grad
    In-place update for efficiency.
    """
    pid = tl.program_id(0)
    offset = pid * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)
    mask = offset < n_elements
    
    param = tl.load(param_ptr + offset, mask=mask)
    grad = tl.load(grad_ptr + offset, mask=mask)
    
    result = param - lr * grad
    tl.store(param_ptr + offset, result, mask=mask)


def triton_fused_sgd(params: list, grads: list, lr: float):
    """
    Applies fused SGD update to a list of parameters.
    Updates in-place for memory efficiency.
    """
    for param, grad in zip(params, grads):
        if param is None or grad is None:
            continue
            
        # AGGRESSIVE: Skip any non-float32/bfloat16 parameters
        if param.dtype not in [torch.float32, torch.bfloat16, torch.float16]:
            continue
            
        n_elements = param.numel()
        grid = lambda meta: (triton.cdiv(n_elements, meta['BLOCK_SIZE']),)
        
        fused_sgd_kernel[grid](
            param,
            grad,
            n_elements,
            lr,
            BLOCK_SIZE=1024  # L4 optimal for compute-bound
        )
    
    return params  # Return for API compatibility


# --- 3. Fused Gated SiLU Kernel (for Engram Fusion) ---

@triton.jit
def gated_silu_kernel(
    h_ptr,
    v_ptr,
    alpha_ptr,
    output_ptr,
    n_elements,
    BLOCK_SIZE: tl.constexpr
):
    """
    Computes: output = h + SiLU(alpha * v)
    Fuses gating, activation, and residual addition.
    """
    pid = tl.program_id(0)
    offset = pid * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)
    mask = offset < n_elements
    
    h = tl.load(h_ptr + offset, mask=mask)
    v = tl.load(v_ptr + offset, mask=mask)
    alpha = tl.load(alpha_ptr + offset, mask=mask)
    
    gated_v = alpha * v
    silu = gated_v * tl.sigmoid(gated_v)
    result = h + silu
    
    tl.store(output_ptr + offset, result, mask=mask)


def triton_gated_silu_residual(h: torch.Tensor, v: torch.Tensor, alpha: torch.Tensor):
    """
    Fused Gated SiLU with Residual for Engram.
    
    Args:
        h: Hidden states (B, T, D)
        v: Value projection from memory (B, T, D)
        alpha: Gate values (B, T, 1) - will be broadcast
        
    Returns:
        output: h + SiLU(alpha * v)
    """
    output = torch.empty_like(h)
    n_elements = h.numel()
    
    # Expand alpha for element-wise ops
    alpha_expanded = alpha.expand_as(h).contiguous()
    
    grid = lambda meta: (triton.cdiv(n_elements, meta['BLOCK_SIZE']),)
    gated_silu_kernel[grid](
        h,
        v,
        alpha_expanded,
        output,
        n_elements,
        BLOCK_SIZE=1024
    )
    
    return output


# --- 4. Fused Min-Softmax Kernel (DeepConf Confidence) ---

@triton.jit
def min_softmax_kernel(
    logits_ptr,
    output_ptr,
    seq_len,
    BLOCK_SIZE: tl.constexpr
):
    """
    Computes min(softmax(logits)) efficiently in a single pass.
    Uses online softmax + min tracking for numerical stability.
    """
    pid = tl.program_id(0)
    
    # Step 1: Find max for numerical stability (online)
    max_val = -1.0e20
    for i in range(0, seq_len, BLOCK_SIZE):
        offset = i + tl.arange(0, BLOCK_SIZE)
        mask = offset < seq_len
        vals = tl.load(logits_ptr + offset, mask=mask, other=-1.0e20)
        max_val = tl.maximum(max_val, tl.max(vals, axis=0))
    
    # Step 2: Compute sum(exp(x - max)) for denominator
    sum_exp = 0.0
    for i in range(0, seq_len, BLOCK_SIZE):
        offset = i + tl.arange(0, BLOCK_SIZE)
        mask = offset < seq_len
        vals = tl.load(logits_ptr + offset, mask=mask, other=-1.0e20)
        sum_exp += tl.sum(tl.exp(vals - max_val), axis=0)
    
    # Step 3: Find min(softmax) = min(exp(x - max) / sum_exp)
    min_prob = 1.0e20
    for i in range(0, seq_len, BLOCK_SIZE):
        offset = i + tl.arange(0, BLOCK_SIZE)
        mask = offset < seq_len
        vals = tl.load(logits_ptr + offset, mask=mask, other=-1.0e20)
        probs = tl.exp(vals - max_val) / sum_exp
        min_prob = tl.minimum(min_prob, tl.min(probs, axis=0))
    
    tl.store(output_ptr, min_prob)


def triton_min_softmax(logits: torch.Tensor) -> torch.Tensor:
    """
    Efficient min(softmax(logits)) for DeepConf confidence scoring.
    
    Args:
        logits: (B, T, V) or (B, V) tensor of logits
        
    Returns:
        (B,) tensor of minimum softmax probabilities per batch
    """
    if logits.dim() == 3:
        B, T, V = logits.shape
        logits = logits.view(B * T, V)
    else:
        B = logits.shape[0]
        V = logits.shape[-1]
    
    output = torch.empty(logits.shape[0], device=logits.device, dtype=logits.dtype)
    
    for b in range(logits.shape[0]):
        grid = (1,)
        min_softmax_kernel[grid](
            logits[b],
            output[b:b+1],
            V,
            BLOCK_SIZE=min(1024, triton.next_power_of_2(V))
        )
    
    return output


# --- Autotuning Configuration (L4 Optimized) ---

L4_AUTOTUNE_CONFIGS = [
    triton.Config({'BLOCK_SIZE': 64}, num_warps=2),
    triton.Config({'BLOCK_SIZE': 128}, num_warps=4),
    triton.Config({'BLOCK_SIZE': 256}, num_warps=4),
    triton.Config({'BLOCK_SIZE': 512}, num_warps=8),
    triton.Config({'BLOCK_SIZE': 1024}, num_warps=8),
]

# Export for use in ctm_model.py
__all__ = ['triton_ngram_hash', 'triton_fused_sgd', 'triton_gated_silu_residual', 'triton_min_softmax']
