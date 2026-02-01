"""
Quality Correlation: Stage 3 Coherence-Quality Analysis

Tests the hypothesis: Does eigenspace coherence correlate with output quality?

H0 (Null): Coherence is independent of quality (|r| <= 0.2 for all eigenspaces)
H1 (Alternative): Some eigenspaces' coherence predicts quality (|r| > 0.2)

Key insight: If eigenspaces capture semantic structure (validated in Stage 2),
then coherence in domain-specialized eigenspaces should predict output quality
for that domain.
"""

from __future__ import annotations

import numpy as np
import torch
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Callable
from scipy import stats
import re


@dataclass
class QualityMetrics:
    """Quality metrics for a single completion."""
    prompt: str
    completion: str
    domain: str

    # Core metrics (0-1 scale where higher = better)
    coherence_score: float = 0.0  # Linguistic coherence/fluency
    relevance_score: float = 0.0  # Relevance to prompt
    correctness_score: float = 0.0  # Task-specific correctness

    # Composite quality score
    quality_score: float = 0.0

    # Per-eigenspace coherence values
    eigenspace_coherences: Dict[int, float] = field(default_factory=dict)

    # Optional LLM judge score (if available)
    llm_judge_score: Optional[float] = None


@dataclass
class CorrelationResult:
    """Correlation analysis result for one eigenspace."""
    eigenspace_index: int
    pearson_r: float
    p_value: float
    spearman_r: float
    spearman_p: float
    n_samples: int
    is_significant: bool  # |r| > 0.2 and p < 0.05
    best_domain: Optional[str] = None
    domain_correlations: Dict[str, float] = field(default_factory=dict)


class QualityScorer:
    """
    Computes quality scores for model completions.

    Supports multiple scoring strategies:
    1. Automated heuristics (fast, no API calls)
    2. Task-specific scoring (math, code, factual)
    3. LLM-judge scoring (optional, expensive but accurate)
    """

    # Task-specific patterns for correctness evaluation
    MATH_ANSWER_PATTERNS = [
        r"=\s*([\d\.\-]+)",
        r"answer is\s*([\d\.\-]+)",
        r"result:\s*([\d\.\-]+)",
        r"therefore,?\s*([\d\.\-]+)",
    ]

    CODE_QUALITY_SIGNALS = [
        "def ", "class ", "return ", "import ",  # Positive
        "SyntaxError", "IndentationError", "NameError",  # Negative
    ]

    def __init__(
        self,
        tokenizer,
        model=None,
        device: str = "cuda",
        use_perplexity: bool = True,
    ):
        self.tokenizer = tokenizer
        self.model = model
        self.device = device
        self.use_perplexity = use_perplexity

    def score_completion(
        self,
        prompt: str,
        completion: str,
        domain: str,
        expected_answer: Optional[str] = None,
    ) -> QualityMetrics:
        """
        Score a completion on multiple quality dimensions.

        Args:
            prompt: Input prompt
            completion: Model-generated completion
            domain: Semantic domain (mathematical, code, etc.)
            expected_answer: Optional ground truth for correctness

        Returns:
            QualityMetrics with all scores computed
        """
        metrics = QualityMetrics(
            prompt=prompt,
            completion=completion,
            domain=domain,
        )

        # 1. Linguistic coherence (length, repetition, structure)
        metrics.coherence_score = self._score_coherence(completion)

        # 2. Relevance to prompt
        metrics.relevance_score = self._score_relevance(prompt, completion)

        # 3. Task-specific correctness
        metrics.correctness_score = self._score_correctness(
            prompt, completion, domain, expected_answer
        )

        # Composite quality (weighted average)
        # Weight correctness higher for domains where it's measurable
        if domain in ["mathematical", "factual", "code"]:
            weights = {"coherence": 0.2, "relevance": 0.3, "correctness": 0.5}
        else:
            weights = {"coherence": 0.4, "relevance": 0.4, "correctness": 0.2}

        metrics.quality_score = (
            weights["coherence"] * metrics.coherence_score +
            weights["relevance"] * metrics.relevance_score +
            weights["correctness"] * metrics.correctness_score
        )

        return metrics

    def _score_coherence(self, completion: str) -> float:
        """Score linguistic coherence (0-1)."""
        if not completion or len(completion.strip()) == 0:
            return 0.0

        score = 1.0

        # Penalize too short
        if len(completion) < 10:
            score *= 0.5

        # Penalize excessive repetition
        words = completion.lower().split()
        if len(words) > 3:
            unique_ratio = len(set(words)) / len(words)
            if unique_ratio < 0.3:  # >70% repeated words
                score *= 0.3
            elif unique_ratio < 0.5:
                score *= 0.6

        # Penalize broken sentences (no punctuation at end)
        if completion.strip() and completion.strip()[-1] not in ".!?:;\"')":
            score *= 0.8

        # Penalize obvious errors/artifacts
        error_signals = ["<unk>", "�", "[PAD]", "<|", "|>"]
        for signal in error_signals:
            if signal in completion:
                score *= 0.5
                break

        return max(0.0, min(1.0, score))

    def _score_relevance(self, prompt: str, completion: str) -> float:
        """Score relevance to prompt (0-1) via word overlap."""
        if not completion or not prompt:
            return 0.0

        prompt_words = set(prompt.lower().split())
        completion_words = set(completion.lower().split())

        # Remove common stopwords
        stopwords = {"the", "a", "an", "is", "are", "was", "were", "be", "to", "of", "and", "in", "that", "it"}
        prompt_content = prompt_words - stopwords
        completion_content = completion_words - stopwords

        if not prompt_content:
            return 0.5  # Can't measure

        # Jaccard-like overlap
        overlap = len(prompt_content & completion_content)
        relevance = overlap / max(len(prompt_content), 1)

        # Bonus for answering questions
        if "?" in prompt and any(word in completion.lower() for word in ["because", "since", "therefore", "is", "are"]):
            relevance = min(1.0, relevance + 0.2)

        return max(0.0, min(1.0, relevance))

    def _score_correctness(
        self,
        prompt: str,
        completion: str,
        domain: str,
        expected: Optional[str] = None,
    ) -> float:
        """Score task-specific correctness (0-1)."""

        if domain == "mathematical":
            return self._score_math_correctness(prompt, completion, expected)
        elif domain == "code":
            return self._score_code_correctness(completion)
        elif domain == "factual":
            return self._score_factual_correctness(prompt, completion, expected)
        elif domain == "logical":
            return self._score_logical_correctness(prompt, completion)
        else:
            # For creative/science, use coherence as proxy
            return self._score_coherence(completion)

    def _score_math_correctness(
        self,
        prompt: str,
        completion: str,
        expected: Optional[str] = None,
    ) -> float:
        """Score mathematical answer correctness."""
        # If we have expected answer, check for it
        if expected:
            expected_clean = str(expected).strip().lower()
            if expected_clean in completion.lower():
                return 1.0

        # Check for presence of numerical answer
        has_number = bool(re.search(r'\d+\.?\d*', completion))
        has_math_symbols = any(s in completion for s in ["=", "+", "-", "*", "/", "^"])
        has_conclusion = any(phrase in completion.lower() for phrase in
                           ["therefore", "equals", "is equal to", "answer is", "result"])

        score = 0.0
        if has_number:
            score += 0.4
        if has_math_symbols:
            score += 0.2
        if has_conclusion:
            score += 0.4

        return score

    def _score_code_correctness(self, completion: str) -> float:
        """Score code quality heuristics."""
        score = 0.5  # Base score

        # Positive signals
        positive = ["def ", "class ", "return ", "import ", "if ", "for ", "while "]
        for signal in positive:
            if signal in completion:
                score += 0.1

        # Negative signals
        negative = ["SyntaxError", "IndentationError", "NameError", "TypeError"]
        for signal in negative:
            if signal in completion:
                score -= 0.3

        # Check for balanced brackets/parens
        if completion.count("(") == completion.count(")"):
            score += 0.1
        if completion.count("{") == completion.count("}"):
            score += 0.1
        if completion.count("[") == completion.count("]"):
            score += 0.1

        return max(0.0, min(1.0, score))

    def _score_factual_correctness(
        self,
        prompt: str,
        completion: str,
        expected: Optional[str] = None,
    ) -> float:
        """Score factual accuracy."""
        if expected and expected.lower() in completion.lower():
            return 1.0

        # Heuristic: completions that are confident and specific score higher
        confidence_signals = ["is", "are", "was", "were", "has", "have"]
        has_assertion = any(f" {s} " in f" {completion.lower()} " for s in confidence_signals)

        # Check for specific content (not just filler)
        words = completion.split()
        content_words = [w for w in words if len(w) > 3 and w.lower() not in
                        {"the", "that", "this", "with", "from", "have", "been"}]
        specificity = min(1.0, len(content_words) / 10)

        score = 0.3 + (0.3 if has_assertion else 0.0) + 0.4 * specificity
        return score

    def _score_logical_correctness(self, prompt: str, completion: str) -> float:
        """Score logical reasoning quality."""
        # Check for logical connectives and structure
        logical_markers = ["therefore", "thus", "hence", "because", "since",
                         "if", "then", "implies", "follows", "conclude"]

        marker_count = sum(1 for m in logical_markers if m in completion.lower())

        # Penalize contradictions
        contradiction_pairs = [
            ("true", "false"), ("yes", "no"), ("can", "cannot"),
        ]
        has_contradiction = any(
            a in completion.lower() and b in completion.lower()
            for a, b in contradiction_pairs
        )

        score = min(1.0, 0.3 + marker_count * 0.15)
        if has_contradiction:
            score *= 0.5

        return score


class QualityCorrelationAnalyzer:
    """
    Analyzes correlation between eigenspace coherence and output quality.

    Core methodology:
    1. Generate completions for diverse prompts
    2. Compute quality scores for each completion
    3. Compute per-eigenspace coherence during generation
    4. Calculate Pearson correlation between coherence and quality
    5. Report which eigenspaces (if any) predict quality
    """

    def __init__(
        self,
        projection_basis: List[np.ndarray],
        eigenvalues: np.ndarray,
        device: str = "cuda",
    ):
        self.device = device
        self.num_eigenspaces = len(projection_basis)

        # Store projection vectors as tensors
        self.projection_tensors = []
        for v in projection_basis:
            t = torch.tensor(v, dtype=torch.float32, device=device)
            self.projection_tensors.append(t / t.norm())

        self.eigenvalues = eigenvalues

        # Data collection
        self.samples: List[QualityMetrics] = []
        self.domain_samples: Dict[str, List[QualityMetrics]] = defaultdict(list)

    def compute_eigenspace_coherences(
        self,
        hidden_states: torch.Tensor,
    ) -> Dict[int, float]:
        """
        Compute coherence for each eigenspace from hidden states.

        Coherence = ||H @ V_i||^2 / ||H||^2

        Args:
            hidden_states: (batch, hidden_dim) or (batch, seq, hidden_dim)

        Returns:
            Dict mapping eigenspace index to coherence (0-1)
        """
        if hidden_states.dim() == 3:
            h = hidden_states.view(-1, hidden_states.size(-1))
        else:
            h = hidden_states

        h = h.to(self.device).float()
        h_norm_sq = (h ** 2).sum()

        if h_norm_sq < 1e-8:
            return {i: 0.5 for i in range(self.num_eigenspaces)}

        coherences = {}
        for i, v in enumerate(self.projection_tensors):
            if v.size(0) != h.size(-1):
                coherences[i] = 0.5
                continue

            projection = h @ v
            proj_norm_sq = (projection ** 2).sum()
            coherence = (proj_norm_sq / h_norm_sq).item()
            coherences[i] = min(1.0, max(0.0, coherence))

        return coherences

    def collect_sample(
        self,
        metrics: QualityMetrics,
        eigenspace_coherences: Dict[int, float],
    ):
        """Record a sample for correlation analysis."""
        metrics.eigenspace_coherences = eigenspace_coherences
        self.samples.append(metrics)
        self.domain_samples[metrics.domain].append(metrics)

    def compute_correlations(
        self,
        min_samples: int = 30,
    ) -> List[CorrelationResult]:
        """
        Compute correlation between each eigenspace's coherence and quality.

        Args:
            min_samples: Minimum samples required for valid correlation

        Returns:
            List of CorrelationResult for each eigenspace
        """
        if len(self.samples) < min_samples:
            raise ValueError(f"Need at least {min_samples} samples, have {len(self.samples)}")

        results = []

        for i in range(self.num_eigenspaces):
            # Extract coherence and quality arrays
            coherences = []
            qualities = []

            for sample in self.samples:
                if i in sample.eigenspace_coherences:
                    coherences.append(sample.eigenspace_coherences[i])
                    qualities.append(sample.quality_score)

            if len(coherences) < min_samples:
                results.append(CorrelationResult(
                    eigenspace_index=i,
                    pearson_r=0.0,
                    p_value=1.0,
                    spearman_r=0.0,
                    spearman_p=1.0,
                    n_samples=len(coherences),
                    is_significant=False,
                ))
                continue

            # Pearson correlation (linear relationship)
            try:
                pearson_r, pearson_p = stats.pearsonr(coherences, qualities)
                if np.isnan(pearson_r):
                    pearson_r, pearson_p = 0.0, 1.0
            except Exception:
                pearson_r, pearson_p = 0.0, 1.0

            # Spearman correlation (monotonic relationship)
            try:
                spearman_r, spearman_p = stats.spearmanr(coherences, qualities)
                if np.isnan(spearman_r):
                    spearman_r, spearman_p = 0.0, 1.0
            except Exception:
                spearman_r, spearman_p = 0.0, 1.0

            # Use stronger of the two correlations
            is_significant = (abs(pearson_r) > 0.2 and pearson_p < 0.05) or \
                           (abs(spearman_r) > 0.2 and spearman_p < 0.05)

            # Compute per-domain correlations
            domain_correlations = {}
            best_domain = None
            best_domain_r = 0.0

            for domain, domain_samples in self.domain_samples.items():
                domain_coherences = []
                domain_qualities = []

                for sample in domain_samples:
                    if i in sample.eigenspace_coherences:
                        domain_coherences.append(sample.eigenspace_coherences[i])
                        domain_qualities.append(sample.quality_score)

                if len(domain_coherences) >= 10:
                    try:
                        r, _ = stats.pearsonr(domain_coherences, domain_qualities)
                        if not np.isnan(r):
                            domain_correlations[domain] = r
                            if abs(r) > abs(best_domain_r):
                                best_domain_r = r
                                best_domain = domain
                    except Exception:
                        pass

            results.append(CorrelationResult(
                eigenspace_index=i,
                pearson_r=pearson_r,
                p_value=pearson_p,
                spearman_r=spearman_r,
                spearman_p=spearman_p,
                n_samples=len(coherences),
                is_significant=is_significant,
                best_domain=best_domain,
                domain_correlations=domain_correlations,
            ))

        return results

    def run_analysis_session(
        self,
        model,
        tokenizer,
        scorer: QualityScorer,
        probe_prompts: Dict[str, List[str]],
        samples_per_domain: int = 50,
        max_new_tokens: int = 64,
    ) -> Dict:
        """
        Run complete correlation analysis session.

        Args:
            model: Language model for generation
            tokenizer: Tokenizer for model
            scorer: QualityScorer instance
            probe_prompts: Dict mapping domain -> list of prompts
            samples_per_domain: Samples to generate per domain
            max_new_tokens: Max tokens to generate per completion

        Returns:
            Dict with correlation results and analysis
        """
        print(f"[QualityCorrelation] Starting analysis session")
        print(f"  Domains: {list(probe_prompts.keys())}")
        print(f"  Samples per domain: {samples_per_domain}")

        device = next(model.parameters()).device

        for domain, prompts in probe_prompts.items():
            print(f"  Processing domain: {domain}...", end=" ", flush=True)

            # Sample prompts for this domain
            import random
            selected_prompts = random.choices(prompts, k=samples_per_domain)

            for prompt in selected_prompts:
                # Tokenize and generate
                inputs = tokenizer(
                    prompt,
                    return_tensors="pt",
                    truncation=True,
                    max_length=128,
                ).to(device)

                with torch.no_grad():
                    # Generate with hidden states
                    outputs = model.generate(
                        **inputs,
                        max_new_tokens=max_new_tokens,
                        do_sample=True,
                        temperature=0.7,
                        pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
                        output_hidden_states=True,
                        return_dict_in_generate=True,
                    )

                    # Get hidden states from the last step of generation
                    # outputs.hidden_states is tuple of (step, layer, tensor)
                    if hasattr(outputs, 'hidden_states') and outputs.hidden_states:
                        # Get last generation step, last layer
                        last_hidden = outputs.hidden_states[-1][-1]
                        # Mean pool over sequence
                        hidden_mean = last_hidden.mean(dim=1)
                    else:
                        # Fallback: run forward pass on generated text
                        full_outputs = model(
                            outputs.sequences,
                            output_hidden_states=True,
                            return_dict=True,
                        )
                        hidden_mean = full_outputs.hidden_states[-1].mean(dim=1)

                # Decode completion
                full_text = tokenizer.decode(outputs.sequences[0], skip_special_tokens=True)
                completion = full_text[len(prompt):].strip()

                # Compute eigenspace coherences
                coherences = self.compute_eigenspace_coherences(hidden_mean)

                # Score quality
                metrics = scorer.score_completion(prompt, completion, domain)

                # Record sample
                self.collect_sample(metrics, coherences)

            print(f"done ({len(self.domain_samples[domain])} samples)")

        # Compute correlations
        print(f"\n[QualityCorrelation] Computing correlations...")
        results = self.compute_correlations()

        # Summary
        significant_count = sum(1 for r in results if r.is_significant)
        max_r = max(abs(r.pearson_r) for r in results)
        max_spearman = max(abs(r.spearman_r) for r in results)

        print(f"\n[QualityCorrelation] Results:")
        print(f"  Significant correlations (|r| > 0.2): {significant_count}/{len(results)}")
        print(f"  Max Pearson |r|: {max_r:.3f}")
        print(f"  Max Spearman |r|: {max_spearman:.3f}")

        hypothesis_result = "H1 supported" if significant_count >= 1 else "H0 not rejected"

        return {
            "correlation_results": results,
            "significant_count": significant_count,
            "max_pearson_r": max_r,
            "max_spearman_r": max_spearman,
            "hypothesis_result": hypothesis_result,
            "total_samples": len(self.samples),
            "samples_by_domain": {d: len(s) for d, s in self.domain_samples.items()},
        }

    def export_results(self) -> Dict:
        """Export results for JSON serialization."""
        return {
            "correlations": [
                {
                    "eigenspace": int(r.eigenspace_index),
                    "pearson_r": float(r.pearson_r),
                    "p_value": float(r.p_value),
                    "spearman_r": float(r.spearman_r),
                    "spearman_p": float(r.spearman_p),
                    "n_samples": int(r.n_samples),
                    "is_significant": bool(r.is_significant),
                    "best_domain": r.best_domain,
                    "domain_correlations": {k: float(v) for k, v in r.domain_correlations.items()},
                }
                for r in self.compute_correlations() if self.samples
            ],
            "summary": {
                "total_samples": int(len(self.samples)),
                "samples_by_domain": {d: int(len(s)) for d, s in self.domain_samples.items()},
                "mean_quality": float(np.mean([s.quality_score for s in self.samples])) if self.samples else 0.0,
            },
        }
