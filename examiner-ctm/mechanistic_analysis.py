"""
Mechanistic Eigenspace Analysis: Data-Driven Characterization

Instead of asking "does this eigenspace do math?", we ask:
"What tokens/operations does this eigenspace mechanistically amplify?"

This avoids imposing human taxonomies and lets the data name the eigenspaces.

Key methods:
1. Vocabulary Projection - Project singular vectors onto embedding matrix
2. Distributional Entropy - Measure activation specificity vs ubiquity
3. Token Pattern Analysis - Correlate with low-level text patterns
4. Ablation Analysis - What breaks when we suppress an eigenspace?
"""

from __future__ import annotations

import numpy as np
import torch
from collections import defaultdict, Counter
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from scipy import stats
import re


@dataclass
class VocabularyProjection:
    """Results from projecting an eigenspace onto vocabulary."""
    eigenspace_index: int
    top_tokens: List[Tuple[str, float]]  # (token, similarity)
    bottom_tokens: List[Tuple[str, float]]  # Suppressed tokens
    token_category_distribution: Dict[str, int]  # Auto-detected categories
    inferred_function: str  # Data-driven label


@dataclass
class EntropyProfile:
    """Activation entropy profile for an eigenspace."""
    eigenspace_index: int
    mean_activation: float
    activation_entropy: float  # High = ubiquitous, Low = specific
    activation_kurtosis: float  # Peakedness of distribution
    sparsity: float  # Fraction of near-zero activations
    functional_type: str  # "structural", "knowledge", "mixed"


@dataclass
class MechanisticProfile:
    """Complete mechanistic characterization of an eigenspace."""
    eigenspace_index: int
    vocabulary_projection: VocabularyProjection
    entropy_profile: Optional[EntropyProfile]

    # Inferred from data, not human labels
    mechanistic_label: str  # e.g., "relational_operators", "hierarchical_delimiters"
    confidence: float

    # Token-level patterns
    dominant_token_types: List[str]  # punctuation, operators, nouns, etc.
    suppressed_token_types: List[str]


class MechanisticAnalyzer:
    """
    Analyzes eigenspaces mechanistically without human semantic labels.

    Core insight: An eigenspace labeled "Math" might actually be
    "Relational Operators" (=, >, <, implies) that math happens to use.
    """

    # Token categories for automatic classification
    TOKEN_PATTERNS = {
        "punctuation": r'^[^\w\s]+$',
        "delimiter": r'^[\(\)\[\]\{\}<>]+$',
        "operator": r'^[=\+\-\*\/\^%<>!&\|]+$',
        "whitespace": r'^[\s\t\n]+$',
        "digit": r'^\d+$',
        "preposition": r'^(in|on|at|to|from|with|by|for|of|about|into|onto|upon)$',
        "article": r'^(the|a|an)$',
        "conjunction": r'^(and|or|but|if|then|because|so|yet|while)$',
        "pronoun": r'^(i|you|he|she|it|we|they|this|that|these|those)$',
        "auxiliary": r'^(is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|can)$',
    }

    def __init__(
        self,
        model,
        tokenizer,
        projection_basis: List[np.ndarray],
        eigenvalues: np.ndarray,
        device: str = "cuda",
    ):
        self.model = model
        self.tokenizer = tokenizer
        self.device = device
        self.num_eigenspaces = len(projection_basis)

        # Store projection vectors
        self.projection_tensors = []
        for v in projection_basis:
            t = torch.tensor(v, dtype=torch.float32, device=device)
            self.projection_tensors.append(t / t.norm())

        self.eigenvalues = eigenvalues

        # Get embedding matrix
        self._extract_embedding_matrix()

        # Results storage
        self.profiles: Dict[int, MechanisticProfile] = {}

    def _extract_embedding_matrix(self):
        """Extract the token embedding matrix from the model."""
        # Try common locations for embedding matrix
        embed_weight = None

        if hasattr(self.model, 'get_input_embeddings'):
            embed_layer = self.model.get_input_embeddings()
            if embed_layer is not None:
                embed_weight = embed_layer.weight

        if embed_weight is None:
            # Try model-specific paths
            for name, param in self.model.named_parameters():
                if 'embed' in name.lower() and 'weight' in name.lower():
                    if param.dim() == 2:
                        embed_weight = param
                        break

        if embed_weight is None:
            raise ValueError("Could not find embedding matrix in model")

        self.embedding_matrix = embed_weight.detach().float().to(self.device)
        self.vocab_size = self.embedding_matrix.size(0)
        self.embed_dim = self.embedding_matrix.size(1)

        print(f"[MechanisticAnalyzer] Embedding matrix: {self.vocab_size} tokens x {self.embed_dim} dims")

    def project_onto_vocabulary(
        self,
        eigenspace_index: int,
        top_k: int = 50,
    ) -> VocabularyProjection:
        """
        Project an eigenspace's singular vector onto vocabulary embeddings.

        This reveals which tokens the eigenspace "attends to" or "amplifies"
        without requiring any semantic labels.

        Args:
            eigenspace_index: Which eigenspace to analyze
            top_k: Number of top/bottom tokens to return

        Returns:
            VocabularyProjection with activated and suppressed tokens
        """
        v = self.projection_tensors[eigenspace_index]

        # Check dimension compatibility
        if v.size(0) != self.embed_dim:
            # Try to project via model's hidden-to-embed projection
            # For now, return empty result
            return VocabularyProjection(
                eigenspace_index=eigenspace_index,
                top_tokens=[],
                bottom_tokens=[],
                token_category_distribution={},
                inferred_function="dimension_mismatch",
            )

        # Compute similarity: each token's embedding dot product with eigenspace vector
        # (vocab_size, embed_dim) @ (embed_dim,) -> (vocab_size,)
        similarities = self.embedding_matrix @ v

        # Get top-k activated tokens
        top_indices = similarities.topk(top_k).indices.cpu().numpy()
        top_values = similarities.topk(top_k).values.cpu().numpy()

        # Get bottom-k suppressed tokens
        bottom_indices = similarities.topk(top_k, largest=False).indices.cpu().numpy()
        bottom_values = similarities.topk(top_k, largest=False).values.cpu().numpy()

        # Decode tokens
        top_tokens = []
        for idx, val in zip(top_indices, top_values):
            try:
                token = self.tokenizer.decode([idx])
                top_tokens.append((token, float(val)))
            except:
                top_tokens.append((f"<id:{idx}>", float(val)))

        bottom_tokens = []
        for idx, val in zip(bottom_indices, bottom_values):
            try:
                token = self.tokenizer.decode([idx])
                bottom_tokens.append((token, float(val)))
            except:
                bottom_tokens.append((f"<id:{idx}>", float(val)))

        # Categorize top tokens
        category_dist = self._categorize_tokens([t[0] for t in top_tokens])

        # Infer function from token patterns
        inferred = self._infer_function_from_tokens(top_tokens, bottom_tokens, category_dist)

        return VocabularyProjection(
            eigenspace_index=eigenspace_index,
            top_tokens=top_tokens,
            bottom_tokens=bottom_tokens,
            token_category_distribution=category_dist,
            inferred_function=inferred,
        )

    def _categorize_tokens(self, tokens: List[str]) -> Dict[str, int]:
        """Categorize tokens by pattern matching."""
        categories = defaultdict(int)

        for token in tokens:
            token_lower = token.lower().strip()
            categorized = False

            for category, pattern in self.TOKEN_PATTERNS.items():
                if re.match(pattern, token_lower, re.IGNORECASE):
                    categories[category] += 1
                    categorized = True
                    break

            if not categorized:
                # Check if it's a content word
                if len(token_lower) > 2 and token_lower.isalpha():
                    categories["content_word"] += 1
                else:
                    categories["other"] += 1

        return dict(categories)

    def _infer_function_from_tokens(
        self,
        top_tokens: List[Tuple[str, float]],
        bottom_tokens: List[Tuple[str, float]],
        categories: Dict[str, int],
    ) -> str:
        """Infer mechanistic function from token patterns."""

        if not categories:
            return "unknown"

        total = sum(categories.values())
        if total == 0:
            return "unknown"

        # Calculate category percentages
        pcts = {k: v / total for k, v in categories.items()}

        # Heuristic classification
        if pcts.get("operator", 0) > 0.3:
            return "relational_operators"

        if pcts.get("delimiter", 0) + pcts.get("punctuation", 0) > 0.4:
            return "hierarchical_structure"

        if pcts.get("preposition", 0) > 0.2:
            return "spatial_relational"

        if pcts.get("conjunction", 0) > 0.15:
            return "logical_connectives"

        if pcts.get("auxiliary", 0) > 0.2:
            return "tense_aspect"

        if pcts.get("digit", 0) > 0.3:
            return "numerical_processing"

        if pcts.get("content_word", 0) > 0.5:
            # Check if content words cluster semantically
            tokens_str = " ".join([t[0] for t in top_tokens[:20]])

            # Simple heuristics for content clusters
            if any(w in tokens_str.lower() for w in ["city", "country", "capital", "located"]):
                return "geographic_entities"
            if any(w in tokens_str.lower() for w in ["year", "century", "date", "born"]):
                return "temporal_entities"
            if any(w in tokens_str.lower() for w in ["said", "told", "asked", "replied"]):
                return "dialogue_markers"

            return "semantic_content"

        if pcts.get("whitespace", 0) > 0.2:
            return "formatting_structure"

        return "mixed_function"

    def compute_entropy_profile(
        self,
        eigenspace_index: int,
        text_samples: List[str],
        batch_size: int = 8,
    ) -> EntropyProfile:
        """
        Compute activation entropy for an eigenspace across text samples.

        High entropy = fires constantly (structural/syntactic)
        Low entropy = fires rarely and specifically (knowledge/factual)

        Args:
            eigenspace_index: Which eigenspace to analyze
            text_samples: Diverse text samples to measure activation
            batch_size: Batch size for processing

        Returns:
            EntropyProfile with entropy and functional classification
        """
        v = self.projection_tensors[eigenspace_index]
        all_activations = []

        for i in range(0, len(text_samples), batch_size):
            batch = text_samples[i:i+batch_size]

            inputs = self.tokenizer(
                batch,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=256,
            ).to(self.device)

            with torch.no_grad():
                outputs = self.model(
                    **inputs,
                    output_hidden_states=True,
                    return_dict=True,
                )

            # Get last hidden state
            hidden = outputs.hidden_states[-1]  # (batch, seq, hidden)

            # Check dimension
            if v.size(0) != hidden.size(-1):
                continue

            # Project: (batch, seq, hidden) @ (hidden,) -> (batch, seq)
            projections = hidden @ v

            # Collect activation magnitudes
            activations = projections.abs().view(-1).cpu().numpy()
            all_activations.extend(activations.tolist())

        if not all_activations:
            return EntropyProfile(
                eigenspace_index=eigenspace_index,
                mean_activation=0.0,
                activation_entropy=0.0,
                activation_kurtosis=0.0,
                sparsity=1.0,
                functional_type="incompatible",
            )

        activations = np.array(all_activations)

        # Compute statistics
        mean_act = float(np.mean(activations))

        # Discretize for entropy calculation
        num_bins = 50
        hist, _ = np.histogram(activations, bins=num_bins, density=True)
        hist = hist + 1e-10  # Avoid log(0)
        entropy = float(-np.sum(hist * np.log(hist)) / np.log(num_bins))  # Normalize

        # Kurtosis (peakedness)
        kurtosis = float(stats.kurtosis(activations))

        # Sparsity (fraction near zero)
        threshold = mean_act * 0.1
        sparsity = float(np.mean(activations < threshold))

        # Classify functional type
        if entropy > 0.7 and sparsity < 0.3:
            functional_type = "structural_ubiquitous"
        elif entropy < 0.4 and sparsity > 0.6:
            functional_type = "knowledge_specific"
        elif kurtosis > 3:
            functional_type = "burst_activation"
        else:
            functional_type = "mixed"

        return EntropyProfile(
            eigenspace_index=eigenspace_index,
            mean_activation=mean_act,
            activation_entropy=entropy,
            activation_kurtosis=kurtosis,
            sparsity=sparsity,
            functional_type=functional_type,
        )

    def analyze_eigenspace(
        self,
        eigenspace_index: int,
        text_samples: Optional[List[str]] = None,
        compute_entropy: bool = True,
    ) -> MechanisticProfile:
        """
        Complete mechanistic analysis of a single eigenspace.

        Args:
            eigenspace_index: Which eigenspace to analyze
            text_samples: Optional text for entropy analysis
            compute_entropy: Whether to compute entropy profile

        Returns:
            MechanisticProfile with vocabulary projection and entropy
        """
        # Vocabulary projection
        vocab_proj = self.project_onto_vocabulary(eigenspace_index)

        # Entropy profile (optional)
        entropy_prof = None
        if compute_entropy and text_samples:
            entropy_prof = self.compute_entropy_profile(eigenspace_index, text_samples)

        # Infer mechanistic label from both analyses
        if vocab_proj.inferred_function != "dimension_mismatch":
            mechanistic_label = vocab_proj.inferred_function
        elif entropy_prof and entropy_prof.functional_type != "incompatible":
            mechanistic_label = entropy_prof.functional_type
        else:
            mechanistic_label = "uncharacterized"

        # Determine dominant token types
        dominant_types = sorted(
            vocab_proj.token_category_distribution.items(),
            key=lambda x: -x[1]
        )[:3]

        # Confidence based on consistency
        confidence = 0.5
        if vocab_proj.inferred_function not in ["unknown", "dimension_mismatch"]:
            confidence += 0.3
        if entropy_prof and entropy_prof.functional_type not in ["mixed", "incompatible"]:
            confidence += 0.2

        profile = MechanisticProfile(
            eigenspace_index=eigenspace_index,
            vocabulary_projection=vocab_proj,
            entropy_profile=entropy_prof,
            mechanistic_label=mechanistic_label,
            confidence=confidence,
            dominant_token_types=[t[0] for t in dominant_types],
            suppressed_token_types=[],  # TODO: analyze bottom tokens
        )

        self.profiles[eigenspace_index] = profile
        return profile

    def analyze_all_eigenspaces(
        self,
        text_samples: Optional[List[str]] = None,
        compute_entropy: bool = False,
    ) -> Dict[int, MechanisticProfile]:
        """
        Analyze all eigenspaces mechanistically.

        Args:
            text_samples: Optional text for entropy analysis
            compute_entropy: Whether to compute entropy (slower)

        Returns:
            Dict mapping eigenspace index to MechanisticProfile
        """
        print(f"[MechanisticAnalyzer] Analyzing {self.num_eigenspaces} eigenspaces...")

        for i in range(self.num_eigenspaces):
            print(f"  Eigenspace {i}...", end=" ", flush=True)
            profile = self.analyze_eigenspace(i, text_samples, compute_entropy)
            print(f"{profile.mechanistic_label}")

        return self.profiles

    def export_results(self) -> Dict:
        """Export results for JSON serialization."""
        return {
            "eigenspaces": [
                {
                    "index": int(p.eigenspace_index),
                    "mechanistic_label": p.mechanistic_label,
                    "confidence": float(p.confidence),
                    "dominant_token_types": p.dominant_token_types,
                    "top_tokens": [
                        {"token": t[0], "similarity": float(t[1])}
                        for t in p.vocabulary_projection.top_tokens[:20]
                    ],
                    "bottom_tokens": [
                        {"token": t[0], "similarity": float(t[1])}
                        for t in p.vocabulary_projection.bottom_tokens[:10]
                    ],
                    "token_categories": p.vocabulary_projection.token_category_distribution,
                    "inferred_function": p.vocabulary_projection.inferred_function,
                    "entropy": {
                        "value": float(p.entropy_profile.activation_entropy),
                        "sparsity": float(p.entropy_profile.sparsity),
                        "functional_type": p.entropy_profile.functional_type,
                    } if p.entropy_profile else None,
                }
                for p in self.profiles.values()
            ],
            "summary": {
                "num_analyzed": len(self.profiles),
                "label_distribution": Counter(p.mechanistic_label for p in self.profiles.values()),
            },
        }

    def print_summary(self):
        """Print human-readable summary of mechanistic analysis."""
        print("\n" + "=" * 70)
        print("MECHANISTIC EIGENSPACE CHARACTERIZATION")
        print("=" * 70)
        print("\nData-driven labels (NOT human-imposed semantics):\n")

        # Group by mechanistic label
        by_label = defaultdict(list)
        for p in self.profiles.values():
            by_label[p.mechanistic_label].append(p)

        for label, profiles in sorted(by_label.items()):
            indices = [p.eigenspace_index for p in profiles]
            print(f"  {label}: L{', L'.join(map(str, indices))}")

            # Show example tokens for first profile
            if profiles:
                p = profiles[0]
                top_5 = [t[0].strip() for t in p.vocabulary_projection.top_tokens[:5]]
                if top_5:
                    print(f"    Example tokens: {top_5}")

        print("\n" + "-" * 70)
        print("Top Tokens per Eigenspace:")
        print("-" * 70)

        for i in range(self.num_eigenspaces):
            if i in self.profiles:
                p = self.profiles[i]
                tokens = [f"'{t[0].strip()}'" for t in p.vocabulary_projection.top_tokens[:8]]
                tokens_str = ", ".join(tokens) if tokens else "(no data)"
                print(f"  L{i:2d} [{p.mechanistic_label:20s}]: {tokens_str}")
