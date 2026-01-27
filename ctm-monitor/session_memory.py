"""
Session Memory v5.0 - Persistent RLM Storage

Implements rolling window memory persistence across inference calls.
Lightweight storage (~few MB) with configurable depth.
"""

import torch
import torch.nn as nn
from typing import Dict, Optional, Tuple
import os
import json
from datetime import datetime


class SessionMemory:
    """
    Persistent session memory for RLM cross-inference state.
    
    Uses a rolling window to bound memory footprint while maintaining
    continuity across separate inference calls.
    """
    
    def __init__(
        self,
        d_model: int = 128,
        memory_tokens: int = 4,
        window_size: int = 100,  # Keep last N memory states
        persist_dir: Optional[str] = None
    ):
        self.d_model = d_model
        self.memory_tokens = memory_tokens
        self.window_size = window_size
        self.persist_dir = persist_dir
        
        # In-memory rolling buffer: List of (step, memory_state) tuples
        # memory_state: (memory_tokens, d_model) tensor
        self.buffer: list = []
        
        # Session metadata
        self.session_id: Optional[str] = None
        self.total_steps = 0
        
        # Compression: When buffer exceeds window, compress old states
        self.compressed_summary: Optional[torch.Tensor] = None
        
    def start_session(self, session_id: Optional[str] = None):
        """Initialize a new session or resume existing one."""
        if session_id:
            self.session_id = session_id
            self._try_load_session()
        else:
            self.session_id = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            self.buffer = []
            self.total_steps = 0
            self.compressed_summary = None
            
        print(f"[SessionMemory] Session {self.session_id} active. "
              f"Buffer: {len(self.buffer)} states, Total steps: {self.total_steps}")
    
    def store(self, memory_state: torch.Tensor, step: int):
        """
        Store a memory state in the rolling buffer.
        
        Args:
            memory_state: (memory_tokens, d_model) tensor
            step: Current training/inference step
        """
        # Detach and clone to avoid graph retention
        state = memory_state.detach().clone().cpu()
        
        self.buffer.append((step, state))
        self.total_steps = max(self.total_steps, step)
        
        # Enforce rolling window
        if len(self.buffer) > self.window_size:
            self._compress_and_trim()
    
    def retrieve(self, n_recent: int = 10) -> Optional[torch.Tensor]:
        """
        Retrieve recent memory states for seeding RLM.
        
        Args:
            n_recent: Number of recent states to retrieve
            
        Returns:
            Stacked tensor (n_recent, memory_tokens, d_model) or None if empty
        """
        if not self.buffer:
            return None
            
        recent = [state for _, state in self.buffer[-n_recent:]]
        if not recent:
            return None
            
        return torch.stack(recent, dim=0)
    
    def get_seed(self) -> Optional[torch.Tensor]:
        """
        Get a single seed state for initializing RLM in new inference.
        Combines compressed summary with most recent state.
        
        Returns:
            (memory_tokens, d_model) tensor or None
        """
        if not self.buffer and self.compressed_summary is None:
            return None
            
        if self.compressed_summary is not None and self.buffer:
            # Blend compressed history with recent state
            recent_state = self.buffer[-1][1]
            alpha = 0.3  # 30% compressed, 70% recent
            return alpha * self.compressed_summary + (1 - alpha) * recent_state
        elif self.buffer:
            return self.buffer[-1][1]
        else:
            return self.compressed_summary
    
    def _compress_and_trim(self):
        """
        Compress old states and trim buffer to window size.
        Old states are averaged into a compressed summary.
        """
        if len(self.buffer) <= self.window_size:
            return
            
        # States to compress (everything beyond window)
        overflow = len(self.buffer) - self.window_size
        to_compress = [state for _, state in self.buffer[:overflow]]
        
        if to_compress:
            # Average into compressed summary
            stacked = torch.stack(to_compress, dim=0)
            new_summary = stacked.mean(dim=0)
            
            if self.compressed_summary is not None:
                # EMA with existing summary
                alpha = 0.5
                self.compressed_summary = alpha * new_summary + (1 - alpha) * self.compressed_summary
            else:
                self.compressed_summary = new_summary
        
        # Trim buffer
        self.buffer = self.buffer[-self.window_size:]
    
    def save(self):
        """Persist current session to disk."""
        if not self.persist_dir or not self.session_id:
            return
            
        os.makedirs(self.persist_dir, exist_ok=True)
        session_path = os.path.join(self.persist_dir, f"session_{self.session_id}.pt")
        
        save_data = {
            "session_id": self.session_id,
            "total_steps": self.total_steps,
            "buffer": [(step, state) for step, state in self.buffer],
            "compressed_summary": self.compressed_summary,
            "d_model": self.d_model,
            "memory_tokens": self.memory_tokens
        }
        
        torch.save(save_data, session_path)
        print(f"[SessionMemory] Saved session to {session_path}")
    
    def _try_load_session(self):
        """Try to load an existing session from disk."""
        if not self.persist_dir or not self.session_id:
            return
            
        session_path = os.path.join(self.persist_dir, f"session_{self.session_id}.pt")
        
        if os.path.exists(session_path):
            try:
                data = torch.load(session_path)
                self.total_steps = data["total_steps"]
                self.buffer = data["buffer"]
                self.compressed_summary = data["compressed_summary"]
                print(f"[SessionMemory] Loaded session from {session_path}")
            except Exception as e:
                print(f"[SessionMemory] Failed to load session: {e}")
                self.buffer = []
                self.total_steps = 0
    
    def get_stats(self) -> Dict:
        """Get memory statistics."""
        buffer_size_bytes = sum(
            state.element_size() * state.nelement() 
            for _, state in self.buffer
        )
        
        summary_size_bytes = 0
        if self.compressed_summary is not None:
            summary_size_bytes = (
                self.compressed_summary.element_size() * 
                self.compressed_summary.nelement()
            )
        
        return {
            "session_id": self.session_id,
            "total_steps": self.total_steps,
            "buffer_len": len(self.buffer),
            "window_size": self.window_size,
            "buffer_size_mb": buffer_size_bytes / (1024 * 1024),
            "summary_size_mb": summary_size_bytes / (1024 * 1024),
            "has_compressed_summary": self.compressed_summary is not None
        }


class RLMMemoryGateV5(nn.Module):
    """
    Enhanced RLM Memory Gate with session persistence support.
    """
    
    def __init__(
        self, 
        d_model: int, 
        n_heads: int = 4,
        memory_tokens: int = 4,
        session_memory: Optional[SessionMemory] = None
    ):
        super().__init__()
        self.d_model = d_model
        self.memory_tokens = memory_tokens
        self.session_memory = session_memory
        
        # Cross-attention
        self.attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True)
        self.norm = nn.LayerNorm(d_model)
        self.w_m = nn.Linear(d_model, d_model)
        
        # Learnable initial memory
        self.memory_init = nn.Parameter(torch.randn(1, memory_tokens, d_model) * 0.02)
        
    def initialize_memory(self, batch_size: int, device: torch.device) -> torch.Tensor:
        """Initialize memory, optionally seeding from session memory."""
        base_memory = self.memory_init.expand(batch_size, -1, -1).clone()
        
        if self.session_memory is not None:
            seed = self.session_memory.get_seed()
            if seed is not None:
                # Blend session seed with learnable init
                seed = seed.to(device).unsqueeze(0).expand(batch_size, -1, -1)
                alpha = 0.5  # 50% session, 50% learned
                base_memory = alpha * seed + (1 - alpha) * base_memory
                
        return base_memory.to(device)
    
    def forward(
        self, 
        z: torch.Tensor, 
        memory: torch.Tensor,
        step: Optional[int] = None
    ) -> torch.Tensor:
        """
        Update memory via cross-attention.
        
        Args:
            z: (B, D) current thought state
            memory: (B, M, D) current memory manifold
            step: Optional step number for persistence
            
        Returns:
            Updated memory (B, M, D)
        """
        z_q = z.unsqueeze(1)  # (B, 1, D)
        
        # Cross-attention: z queries memory
        m_out, _ = self.attn(z_q, memory, memory)
        new_memory = self.norm(memory + self.w_m(m_out).expand_as(memory))
        
        # Persist to session memory (first batch element only)
        if self.session_memory is not None and step is not None:
            self.session_memory.store(new_memory[0], step)
        
        return new_memory
