#!/usr/bin/env python3
"""
Mechanistic Eigenspace Characterization

Instead of asking "does this eigenspace do math?", we ask:
"What tokens/operations does this eigenspace mechanistically amplify?"

This script:
1. Projects each eigenspace's singular vector onto the vocabulary
2. Identifies which tokens are activated/suppressed by each eigenspace
3. Infers mechanistic function from token patterns (NOT human labels)
4. Optionally computes activation entropy on diverse text

Key insight: An eigenspace labeled "Math" by discriminability might actually
be "Relational Operators" (=, >, <, implies) that math happens to use heavily.

The data names the eigenspaces, not us.
"""

import sys
import json
from pathlib import Path
from datetime import datetime

# Add engine to path
sys.path.insert(0, str(Path(__file__).parent / "engine"))

from spectral_extractor import LFMSpectralExtractor
from mechanistic_analysis import MechanisticAnalyzer


# Diverse text samples for entropy analysis (unstructured, not domain-labeled)
ENTROPY_TEXT_SAMPLES = [
    # Narrative
    "The old man walked slowly down the dusty road, his cane tapping rhythmically against the gravel.",
    "She opened the letter with trembling hands, afraid of what she might find inside.",
    "The storm had passed, leaving behind a trail of destruction that would take years to repair.",

    # Technical
    "The function takes two parameters: an integer representing the count and a string for the label.",
    "When the kernel boots, it first initializes the memory management subsystem.",
    "The API endpoint returns a JSON object containing the user's profile data.",

    # Factual
    "Paris is the capital of France and has a population of over 2 million people.",
    "The speed of light in a vacuum is approximately 299,792 kilometers per second.",
    "World War II ended in 1945 with the surrender of Japan.",

    # Mathematical
    "If x = 5 and y = 3, then x + y = 8 and x * y = 15.",
    "The derivative of f(x) = x^2 is f'(x) = 2x.",
    "For all integers n > 0, the sum of the first n natural numbers is n(n+1)/2.",

    # Code
    "def calculate_sum(numbers): return sum(numbers)",
    "SELECT * FROM users WHERE status = 'active' ORDER BY created_at DESC",
    "const result = await fetch('/api/data').then(r => r.json());",

    # Conversational
    "Hey, how's it going? I haven't seen you in ages!",
    "Could you please send me the report by end of day?",
    "That's a great question. Let me think about it for a moment.",

    # Lists/Structure
    "1. First, gather all materials. 2. Mix ingredients thoroughly. 3. Bake at 350F for 30 minutes.",
    "Requirements: Python 3.8+, NumPy, PyTorch, Transformers library.",
    "Agenda: (a) Opening remarks (b) Quarterly review (c) Q&A session (d) Closing.",

    # Abstract
    "The concept of infinity has puzzled mathematicians and philosophers for millennia.",
    "Consciousness remains one of the greatest unsolved mysteries of science.",
    "The relationship between language and thought continues to be debated.",
]


def run_mechanistic_analysis(
    model_name: str = "Qwen/Qwen3-4B",
    top_k_tokens: int = 50,
    compute_entropy: bool = False,
    device: str = "cuda",
):
    """
    Run complete mechanistic characterization of all eigenspaces.

    Projects singular vectors onto vocabulary to discover what tokens
    each eigenspace activates, without human semantic labels.
    """

    print("=" * 70)
    print("MECHANISTIC EIGENSPACE CHARACTERIZATION")
    print("=" * 70)
    print(f"\nPhilosophy:")
    print("  We are NOT asking: 'Does this eigenspace do math?'")
    print("  We ARE asking: 'What tokens does this eigenspace amplify?'")
    print("\n  The data names the eigenspaces, not human taxonomies.")
    print("=" * 70)

    # Extract spectral architecture
    print(f"\n[1/3] Extracting spectral architecture")
    print(f"  Model: {model_name}")

    extractor = LFMSpectralExtractor(model_name=model_name)
    universal_core = extractor.extract_universal_core()

    eigenvalues = universal_core["eigenvalues"]
    projection_basis = universal_core["projection_basis"]

    print(f"  Eigenspaces: {len(projection_basis)}")
    print(f"  Hidden size: {universal_core['hidden_size']}")

    # Initialize mechanistic analyzer
    print(f"\n[2/3] Initializing mechanistic analyzer")

    analyzer = MechanisticAnalyzer(
        model=extractor.model,
        tokenizer=extractor.tokenizer,
        projection_basis=projection_basis,
        eigenvalues=eigenvalues,
        device=device,
    )

    # Run analysis
    print(f"\n[3/3] Analyzing eigenspaces")
    print(f"  Top-k tokens per eigenspace: {top_k_tokens}")
    print(f"  Compute entropy: {compute_entropy}")

    text_samples = ENTROPY_TEXT_SAMPLES if compute_entropy else None
    profiles = analyzer.analyze_all_eigenspaces(
        text_samples=text_samples,
        compute_entropy=compute_entropy,
    )

    # Print summary
    analyzer.print_summary()

    # Compare with Stage 2 semantic labels
    print("\n" + "=" * 70)
    print("COMPARISON: MECHANISTIC vs SEMANTIC LABELS")
    print("=" * 70)
    print("\nStage 2 found these eigenspaces 'best' for human-labeled domains:")
    print("  Mathematical: L0, L2, L8, L9, L10, L12, L14")
    print("  Code: L1, L5, L7, L13")
    print("  Factual: L3, L4, L6, L11, L15")
    print("\nMechanistic analysis suggests these eigenspaces actually handle:")

    # Map Stage 2 labels to mechanistic findings
    stage2_mapping = {
        "mathematical": [0, 2, 8, 9, 10, 12, 14],
        "code": [1, 5, 7, 13],
        "factual": [3, 4, 6, 11, 15],
    }

    for domain, indices in stage2_mapping.items():
        print(f"\n  '{domain}' eigenspaces:")
        for idx in indices:
            if idx in profiles:
                p = profiles[idx]
                top_tokens = [t[0].strip() for t in p.vocabulary_projection.top_tokens[:5]]
                tokens_str = ", ".join(f"'{t}'" for t in top_tokens[:4])
                print(f"    L{idx}: {p.mechanistic_label:25s} [{tokens_str}...]")

    # Export results
    output_file = f"mechanistic_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    export_data = {
        "timestamp": datetime.now().isoformat(),
        "model": model_name,
        "methodology": {
            "description": "Data-driven mechanistic characterization",
            "key_insight": "Project singular vectors onto vocabulary to find activated tokens",
            "philosophy": "Let the data name the eigenspaces, not human taxonomies",
        },
        "analysis": analyzer.export_results(),
        "parameters": {
            "top_k_tokens": top_k_tokens,
            "compute_entropy": compute_entropy,
        },
    }

    with open(output_file, "w") as f:
        json.dump(export_data, f, indent=2)

    print(f"\n[OK] Results exported to: {output_file}")

    return export_data


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run Mechanistic Eigenspace Characterization")
    parser.add_argument("--model", default="Qwen/Qwen3-4B",
                        help="Foundation model name (default: Qwen/Qwen3-4B)")
    parser.add_argument("--top-k", type=int, default=50,
                        help="Top-k tokens to analyze per eigenspace (default: 50)")
    parser.add_argument("--entropy", action="store_true",
                        help="Compute activation entropy (slower, more informative)")
    parser.add_argument("--device", default="cuda",
                        help="Device cuda or cpu (default: cuda)")

    args = parser.parse_args()

    run_mechanistic_analysis(
        model_name=args.model,
        top_k_tokens=args.top_k,
        compute_entropy=args.entropy,
        device=args.device,
    )
