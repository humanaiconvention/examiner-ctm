#!/usr/bin/env python3
"""
EXAMINER1 Inference Wrapper with CTM Telemetry Integration
Wraps Qwen3-4B with spectral monitoring on NVIDIA L4 (24GB VRAM).
Syncs spectral drift to CTM Monitor dashboard via existing telemetry pipeline.
"""
import sys
import json
import torch
import numpy as np
from pathlib import Path
from typing import Dict, Optional
from dataclasses import dataclass
from datetime import datetime
from transformers import AutoModelForCausalLM, AutoTokenizer

# Add examiner engine to path
sys.path.insert(0, str(Path(__file__).parent))

SPECTRAL_DIM = 16


@dataclass
class SpectralPillar:
    """Lightweight pillar for inference (no eigenspace needed)."""
    index: int
    eigenvalue: float = 0.0625  # 1/16 default
    viability: float = 1.0
    semantic_label: str = ""
    spectral_weights: Dict[int, float] = None

    def __post_init__(self):
        if self.spectral_weights is None:
            self.spectral_weights = {self.index: 1.0}


class CentralAggregationCore:
    """Aggregates pillar signals and computes drift."""

    def __init__(self, pillars):
        self.pillars = pillars
        self.drift_threshold = 0.15

    def aggregate_pillar_signals(self, scores: Dict[int, float]) -> Dict:
        viabilities = np.array([scores.get(i, 1.0) for i in range(SPECTRAL_DIM)])
        reference = np.ones(SPECTRAL_DIM)
        sdi = float(np.linalg.norm(viabilities - reference) / np.sqrt(SPECTRAL_DIM))

        severity = "nominal"
        if sdi > 0.70: severity = "critical"
        elif sdi > 0.40: severity = "severe"
        elif sdi > 0.15: severity = "moderate"
        elif sdi > 0.05: severity = "light"

        return {
            "semantic_drift_index": sdi,
            "severity": severity,
            "pillar_viabilities": viabilities.tolist(),
            "intervention_required": severity in ("severe", "critical")
        }


class ExaminerInference:
    """
    Wraps Qwen3-4B with EXAMINER spectral monitoring.
    Optimized for NVIDIA L4 (24GB VRAM).
    Integrates with CTM Monitor telemetry pipeline.
    """

    def __init__(
        self,
        model_name: str = "Qwen/Qwen2.5-4B",  # or humanaiconvention/examiner1
        device: str = "cuda",
        max_memory: Dict = None,
        telemetry_log: str = "examiner_spectral_drift.jsonl"
    ):
        print(f"Loading {model_name} for L4 inference...")

        self.tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            trust_remote_code=True
        )

        # L4-optimized loading: fp16, auto device map
        self.model = AutoModelForCausalLM.from_pretrained(
            model_name,
            torch_dtype=torch.float16,
            device_map="auto",
            max_memory=max_memory or {"cuda:0": "20GB", "cpu": "16GB"},
            trust_remote_code=True
        )
        self.model.eval()

        # Initialize spectral monitoring
        self.pillars = [SpectralPillar(index=i) for i in range(SPECTRAL_DIM)]
        self.central_core = CentralAggregationCore(self.pillars)
        self.activation_buffer = []
        self._register_hooks()

        # Telemetry integration
        self.telemetry_log = telemetry_log
        self.inference_step = 0

        print(f"Model loaded. VRAM: {torch.cuda.memory_allocated()/1e9:.1f}GB")
        print(f"Spectral drift logging to: {telemetry_log}")

    def _register_hooks(self):
        """Register forward hooks for activation capture."""
        self.hooks = []

        def capture_hook(name):
            def hook(module, input, output):
                if isinstance(output, tuple):
                    output = output[0]
                # Sample activations (every 4th layer to save memory)
                if hasattr(output, 'detach'):
                    self.activation_buffer.append(
                        output.detach().mean(dim=(0, 1)).cpu().float()
                    )
            return hook

        # Hook into attention output projections
        for name, module in self.model.named_modules():
            if 'o_proj' in name and len(self.hooks) < 8:
                self.hooks.append(module.register_forward_hook(capture_hook(name)))

    def _compute_spectral_drift(self) -> Dict:
        """Project activations onto spectral basis and compute drift."""
        if not self.activation_buffer:
            return self.central_core.aggregate_pillar_signals({})

        # Stack and compute spectral projection
        activations = torch.stack(self.activation_buffer[-8:])  # Last 8 layers
        act_mean = activations.mean(dim=0).numpy()

        # Compute per-pillar viability (simplified: norm deviation)
        pillar_scores = {}
        chunk_size = len(act_mean) // SPECTRAL_DIM
        for i in range(SPECTRAL_DIM):
            chunk = act_mean[i * chunk_size:(i + 1) * chunk_size]
            pillar_scores[i] = float(1.0 / (1.0 + np.std(chunk)))

        self.activation_buffer.clear()
        return self.central_core.aggregate_pillar_signals(pillar_scores)

    def _log_spectral_telemetry(self, drift: Dict, prompt: str, tokens_generated: int):
        """
        Log spectral drift in CTM-compatible JSONL format.
        This file can be synced to the website via git alongside parallel_training_metrics.jsonl
        """
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "inference_step": self.inference_step,
            "semantic_drift_index": drift["semantic_drift_index"],
            "severity": drift["severity"],
            "intervention_required": drift["intervention_required"],
            "pillar_viabilities": drift["pillar_viabilities"],
            "tokens_generated": tokens_generated,
            "prompt_preview": prompt[:100],  # First 100 chars

            # CTM-compatible fields for dashboard integration
            "sigma_intervention": drift["severity"],  # Maps to dashboard's sigma field
            "drift": drift["semantic_drift_index"],   # Maps to dashboard's drift field
            "event": f"EXAMINER_{drift['severity'].upper()}",

            # GPU metrics
            "gpu_mem_gb": torch.cuda.memory_allocated() / 1e9 if torch.cuda.is_available() else 0.0,
        }

        # Append to JSONL log
        with open(self.telemetry_log, "a") as f:
            f.write(json.dumps(log_entry) + "\n")

    def generate(
        self,
        prompt: str,
        max_new_tokens: int = 256,
        temperature: float = 0.7,
        do_sample: bool = True,
        stream_callback=None
    ) -> Dict:
        """Generate with spectral monitoring and telemetry logging."""

        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)

        # Clear activation buffer
        self.activation_buffer.clear()

        # Generate
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                do_sample=do_sample,
                pad_token_id=self.tokenizer.eos_token_id,
                return_dict_in_generate=True,
                output_hidden_states=False
            )

        # Compute spectral drift
        drift = self._compute_spectral_drift()

        # Decode output
        generated_ids = outputs.sequences[0][inputs.input_ids.shape[1]:]
        text = self.tokenizer.decode(generated_ids, skip_special_tokens=True)

        # Increment step counter
        self.inference_step += 1

        # Log telemetry
        self._log_spectral_telemetry(drift, prompt, len(generated_ids))

        result = {
            "text": text,
            "prompt": prompt,
            "tokens_generated": len(generated_ids),
            "spectral_drift": drift,
            "intervention_triggered": drift.get("intervention_required", False),
            "inference_step": self.inference_step
        }

        # Log intervention if triggered
        if result["intervention_triggered"]:
            print(f"⚠️  INTERVENTION: SDI={drift['semantic_drift_index']:.3f} "
                  f"({drift['severity']}) at step {self.inference_step}")

        return result

    def cleanup(self):
        """Remove hooks and free memory."""
        for hook in self.hooks:
            hook.remove()
        self.hooks.clear()
        torch.cuda.empty_cache()


def main():
    """Demo inference with monitoring."""
    examiner = ExaminerInference(
        model_name="Qwen/Qwen2.5-4B"  # Replace with humanaiconvention/examiner1
    )

    prompts = [
        "Explain quantum entanglement in simple terms.",
        "What are the ethical implications of AI in healthcare?",
        "Write a Python function to calculate Fibonacci numbers.",
    ]

    for prompt in prompts:
        print(f"\n{'='*60}")
        print(f"PROMPT: {prompt}")
        print(f"{'='*60}")

        result = examiner.generate(prompt, max_new_tokens=150)

        print(f"\nOUTPUT: {result['text'][:500]}...")
        print(f"\n📊 Spectral Drift: {result['spectral_drift']['semantic_drift_index']:.4f}")
        print(f"📊 Severity: {result['spectral_drift']['severity']}")
        print(f"📊 Intervention: {result['intervention_triggered']}")

    examiner.cleanup()

    print(f"\n✅ Telemetry logged to: {examiner.telemetry_log}")
    print("To sync to website: git add examiner_spectral_drift.jsonl && git commit -m 'EXAMINER telemetry' && git push website HEAD:main")


if __name__ == "__main__":
    main()
