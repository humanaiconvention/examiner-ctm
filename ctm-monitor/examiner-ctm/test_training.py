"""Minimal training test for v5.1.1"""
import torch
from ctm_model import ContinuousThoughtMachine
from ctm_trainer import UnifiedTrainer

print("=== CTM v5.1.1 Training Test ===\n")

# Create model
model = ContinuousThoughtMachine(d_model=128, memory_length=8, num_thoughts=3)
print(f"[OK] Model created: {sum(p.numel() for p in model.parameters())/1e6:.2f}M params")

# Create trainer
trainer = UnifiedTrainer(model, tokenizer_name="LiquidAI/LFM2.5-1.2B-Instruct")
print(f"[OK] Trainer initialized")

# Test training
print("\nRunning 5 training steps...")
try:
    trainer.train_parallel(steps=5, sync_every=5)
    print(f"[OK] Training completed")
except Exception as e:
    print(f"[FAIL] {e}")
    import traceback
    traceback.print_exc()

print("\n=== Test Complete ===")
