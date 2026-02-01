#!/usr/bin/env python3
"""
Stage 3: Quality Correlation Test

Tests the hypothesis: Does eigenspace coherence predict output quality?

H0 (Null): Coherence is independent of quality (|r| <= 0.2 for all eigenspaces)
H1 (Alternative): Some eigenspaces' coherence predicts quality (|r| > 0.2)

This script:
1. Extracts spectral architecture from the foundation model
2. (Optional) Runs mechanistic analysis to discover what tokens each eigenspace amplifies
3. Generates completions for diverse prompts across 6 domains
4. Scores each completion on coherence, relevance, and correctness
5. Computes per-eigenspace projection coherence
6. Calculates Pearson/Spearman correlations
7. Reports which eigenspaces (if any) predict quality

Mechanistic Analysis Note:
Instead of using human-labeled domains ("math", "code"), the --mechanistic flag
runs vocabulary projection to discover what tokens each eigenspace ACTUALLY
activates. An eigenspace labeled "math" might actually be "relational_operators"
(=, >, <, implies) that math happens to use. Let the data name the eigenspaces.
"""

import sys
import json
from pathlib import Path
from datetime import datetime

# Add engine to path
sys.path.insert(0, str(Path(__file__).parent / "engine"))

from spectral_extractor import LFMSpectralExtractor
from quality_correlation import QualityCorrelationAnalyzer, QualityScorer
from coherence_monitor import ProbeInputGenerator


def run_stage3_test(
    model_name: str = "Qwen/Qwen3-4B",
    samples_per_domain: int = 50,
    max_new_tokens: int = 64,
    device: str = "cuda",
    run_mechanistic: bool = False,
):
    """Run complete Stage 3 quality correlation test.

    Generates completions from the foundation model, scores them,
    and correlates quality with per-eigenspace coherence.

    Args:
        model_name: Foundation model for extraction
        samples_per_domain: Completions per semantic domain
        max_new_tokens: Max generation length
        device: cuda or cpu
        run_mechanistic: If True, run vocabulary projection to discover
            what tokens each eigenspace actually amplifies (data-driven labels)
    """

    print("=" * 70)
    print("STAGE 3: QUALITY CORRELATION TEST")
    print("=" * 70)
    print(f"\nHypothesis Test:")
    print("  H0 (Null):        Coherence is independent of output quality")
    print("  H1 (Alternative): Some eigenspaces' coherence predicts quality")
    print("\nPass Threshold: >=1 eigenspace with |r| > 0.2 and p < 0.05")
    if run_mechanistic:
        print("\nMechanistic Mode: Will discover data-driven eigenspace labels")
    print("=" * 70)

    # Initialize spectral system
    step_count = 5 if run_mechanistic else 4
    print(f"\n[1/{step_count}] Extracting spectral architecture from foundation model")
    print(f"  Model: {model_name}")
    print(f"  Device: {device}")

    extractor = LFMSpectralExtractor(model_name=model_name)
    universal_core = extractor.extract_universal_core()

    eigenvalues = universal_core["eigenvalues"]
    projection_basis = universal_core["projection_basis"]

    print(f"  Eigenvalues shape: {eigenvalues.shape}")
    print(f"  Projection vectors: {len(projection_basis)}")
    print(f"  Top eigenvalue: {eigenvalues[0]:.4f}")

    # Optional: Mechanistic analysis
    mechanistic_profiles = None
    if run_mechanistic:
        print(f"\n[2/{step_count}] Running mechanistic eigenspace analysis")
        print("  Philosophy: Let the data name the eigenspaces, not human taxonomies")

        from mechanistic_analysis import MechanisticAnalyzer

        mech_analyzer = MechanisticAnalyzer(
            model=extractor.model,
            tokenizer=extractor.tokenizer,
            projection_basis=projection_basis,
            eigenvalues=eigenvalues,
            device=device,
        )

        mechanistic_profiles = mech_analyzer.analyze_all_eigenspaces(
            compute_entropy=False,  # Skip entropy for speed
        )

        mech_analyzer.print_summary()

    # Initialize components
    step_num = 3 if run_mechanistic else 2
    print(f"\n[{step_num}/{step_count}] Initializing quality scorer and analyzer")

    scorer = QualityScorer(
        tokenizer=extractor.tokenizer,
        model=extractor.model,
        device=device,
    )

    analyzer = QualityCorrelationAnalyzer(
        projection_basis=projection_basis,
        eigenvalues=eigenvalues,
        device=device,
    )

    # Prepare probe prompts (using same corpus as Stage 2 for consistency)
    probe_prompts = ProbeInputGenerator.PROBE_CORPUS

    num_domains = len(probe_prompts)
    total_probes = sum(len(p) for p in probe_prompts.values())
    print(f"  Domains: {list(probe_prompts.keys())}")
    print(f"  Total unique prompts: {total_probes}")
    print(f"  Samples per domain: {samples_per_domain}")
    print(f"  Max tokens per completion: {max_new_tokens}")

    # Run analysis session
    step_num = 4 if run_mechanistic else 3
    print(f"\n[{step_num}/{step_count}] Generating completions and computing correlations")
    print(f"  Total samples to generate: {num_domains * samples_per_domain}")

    results_dict = analyzer.run_analysis_session(
        model=extractor.model,
        tokenizer=extractor.tokenizer,
        scorer=scorer,
        probe_prompts=probe_prompts,
        samples_per_domain=samples_per_domain,
        max_new_tokens=max_new_tokens,
    )

    # Extract results
    correlation_results = results_dict["correlation_results"]
    significant_count = results_dict["significant_count"]
    max_pearson = results_dict["max_pearson_r"]
    max_spearman = results_dict["max_spearman_r"]
    hypothesis_result = results_dict["hypothesis_result"]

    # Detailed output
    print("\n" + "=" * 70)
    print("DETAILED RESULTS")
    print("=" * 70)

    print(f"\nCorrelation Analysis (sorted by |Pearson r|):")
    print(f"{'ES':>3} {'Pearson r':>10} {'p-value':>10} {'Spearman r':>10} {'Best Domain':>15} {'Sig?':>5}")
    print("-" * 60)

    sorted_results = sorted(
        correlation_results,
        key=lambda r: abs(r.pearson_r),
        reverse=True
    )

    for r in sorted_results:
        sig_marker = "[X]" if r.is_significant else "[ ]"
        best = r.best_domain or "---"
        print(f"{r.eigenspace_index:3d} {r.pearson_r:10.4f} {r.p_value:10.4f} {r.spearman_r:10.4f} {best:>15} {sig_marker:>5}")

    # Per-domain correlation summary
    print(f"\n{'=' * 70}")
    print("DOMAIN-SPECIFIC CORRELATIONS")
    print("=" * 70)

    domains = list(probe_prompts.keys())
    for domain in domains:
        domain_correlations = []
        for r in correlation_results:
            if domain in r.domain_correlations:
                domain_correlations.append((r.eigenspace_index, r.domain_correlations[domain]))

        if domain_correlations:
            domain_correlations.sort(key=lambda x: abs(x[1]), reverse=True)
            top_es, top_r = domain_correlations[0]
            print(f"  {domain:15}: Top eigenspace = L{top_es} (r = {top_r:+.3f})")

    # Summary
    print("\n" + "=" * 70)
    print("HYPOTHESIS TEST RESULT")
    print("=" * 70)

    print(f"\nSignificant eigenspaces (|r| > 0.2, p < 0.05): {significant_count}/16")
    print(f"Max Pearson |r|: {max_pearson:.4f}")
    print(f"Max Spearman |r|: {max_spearman:.4f}")
    print(f"Result: {hypothesis_result}")

    if significant_count >= 1:
        print("\n[RESULT] H1 SUPPORTED: Coherence predicts quality")
        print("  Interpretation: At least one eigenspace's coherence correlates")
        print("  with output quality, validating the semantic grounding signal.")
        print("  Next step: End-to-end training validation (Stage 4)")

        # Find best predictive eigenspace
        best_result = max(correlation_results, key=lambda r: abs(r.pearson_r))
        print(f"\n  Best predictive eigenspace: L{best_result.eigenspace_index}")
        print(f"    Pearson r = {best_result.pearson_r:+.4f}")
        print(f"    Best domain = {best_result.best_domain or 'N/A'}")

    else:
        print("\n[RESULT] H0 NOT REJECTED: Coherence does not predict quality")
        print("  Interpretation: No eigenspace shows meaningful correlation")
        print("  between projection coherence and output quality.")
        print("  Implication: Coherence may not be the right viability signal,")
        print("  or quality scoring methodology needs refinement.")

    # Quality score distribution
    print("\n" + "=" * 70)
    print("QUALITY SCORE STATISTICS")
    print("=" * 70)

    import numpy as np
    all_scores = [s.quality_score for s in analyzer.samples]
    print(f"\n  Total samples: {len(all_scores)}")
    print(f"  Mean quality: {np.mean(all_scores):.3f}")
    print(f"  Std quality: {np.std(all_scores):.3f}")
    print(f"  Min quality: {np.min(all_scores):.3f}")
    print(f"  Max quality: {np.max(all_scores):.3f}")

    # Per-domain quality
    print(f"\n  Quality by domain:")
    for domain in domains:
        domain_scores = [s.quality_score for s in analyzer.domain_samples[domain]]
        if domain_scores:
            print(f"    {domain:15}: mean={np.mean(domain_scores):.3f}, std={np.std(domain_scores):.3f}")

    # Export results
    print(f"\n[{step_count}/{step_count}] Exporting results")
    output_file = f"stage3_quality_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    export_data = {
        "timestamp": datetime.now().isoformat(),
        "hypothesis_test": {
            "null_hypothesis": "Coherence is independent of output quality",
            "alternative": "Some eigenspaces' coherence predicts quality",
            "pass_threshold": ">=1 eigenspace with |r| > 0.2 and p < 0.05",
            "result": hypothesis_result,
            "significant_count": significant_count,
            "max_pearson_r": max_pearson,
            "max_spearman_r": max_spearman,
        },
        "correlation_results": analyzer.export_results(),
        "quality_statistics": {
            "total_samples": len(all_scores),
            "mean_quality": float(np.mean(all_scores)),
            "std_quality": float(np.std(all_scores)),
            "min_quality": float(np.min(all_scores)),
            "max_quality": float(np.max(all_scores)),
            "by_domain": {
                domain: {
                    "count": len(analyzer.domain_samples[domain]),
                    "mean": float(np.mean([s.quality_score for s in analyzer.domain_samples[domain]])),
                    "std": float(np.std([s.quality_score for s in analyzer.domain_samples[domain]])),
                }
                for domain in domains
            },
        },
        "parameters": {
            "model": model_name,
            "samples_per_domain": samples_per_domain,
            "max_new_tokens": max_new_tokens,
            "run_mechanistic": run_mechanistic,
        },
    }

    # Add mechanistic analysis if run
    if mechanistic_profiles:
        export_data["mechanistic_analysis"] = {
            "note": "Data-driven eigenspace labels (NOT human-imposed semantics)",
            "eigenspaces": [
                {
                    "index": int(p.eigenspace_index),
                    "mechanistic_label": p.mechanistic_label,
                    "top_tokens": [t[0] for t in p.vocabulary_projection.top_tokens[:10]],
                    "inferred_function": p.vocabulary_projection.inferred_function,
                }
                for p in mechanistic_profiles.values()
            ],
        }

    with open(output_file, "w") as f:
        json.dump(export_data, f, indent=2)

    print(f"\n[OK] Results exported to: {output_file}")

    return export_data


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run Stage 3 Quality Correlation Test")
    parser.add_argument("--model", default="Qwen/Qwen3-4B",
                        help="Foundation model name (default: Qwen/Qwen3-4B)")
    parser.add_argument("--samples", type=int, default=50,
                        help="Samples per domain (default: 50)")
    parser.add_argument("--max-tokens", type=int, default=64,
                        help="Max tokens per completion (default: 64)")
    parser.add_argument("--device", default="cuda",
                        help="Device cuda or cpu (default: cuda)")
    parser.add_argument("--mechanistic", action="store_true",
                        help="Run mechanistic analysis to discover data-driven eigenspace labels")

    args = parser.parse_args()

    run_stage3_test(
        model_name=args.model,
        samples_per_domain=args.samples,
        max_new_tokens=args.max_tokens,
        device=args.device,
        run_mechanistic=args.mechanistic,
    )
