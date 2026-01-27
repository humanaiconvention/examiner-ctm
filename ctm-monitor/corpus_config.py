"""
Corpus Configuration for Progressive Learning
Maps the D:\articles corpus to training phases and pillar domains.
"""

import os
import sys
from pathlib import Path
from typing import Dict, List, Optional

# Base corpus directory - platform aware
SCRIPT_DIR = Path(__file__).parent.absolute()

# Discovery logic for CORPUS_ROOT
def discover_corpus_root():
    candidates = []
    
    # 1. Environment Variable
    env_root = os.environ.get("CTM_CORPUS_ROOT")
    if env_root: 
        candidates.append(("ENV", Path(env_root)))
        
    # 2. Home directory (Standard Linux layout)
    home = Path.home()
    candidates.append(("HOME_ARTICLES", home / "articles"))
    candidates.append(("HOME_ARTICLES_CAPS", home / "Articles"))
    candidates.append(("HOME_DOWNLOADS_ARTICLES", home / "Downloads" / "articles"))
    candidates.append(("HOME_CORPUS", home / "corpus"))
    
    # Auto-detect any articles/corpus in home
    try:
        for d in home.iterdir():
            if d.is_dir() and d.name.lower() in ["articles", "corpus", "datasets"]:
                candidates.append((f"DETECTED_{d.name.upper()}", d))
    except: pass

    # 3. Parallel to repo (L4 Structure: ~/examiner-ctm/articles or ~/articles)
    candidates.append(("L4_PARALLEL_ARTICLES", SCRIPT_DIR.parent / "articles"))
    candidates.append(("L4_PARALLEL_CORPUS", SCRIPT_DIR.parent / "corpus"))
    
    # 4. Deep search in parent (Up to 2 levels)
    candidates.append(("PARENT_PARENT_ARTICLES", SCRIPT_DIR.parent.parent / "articles"))
    
    # 5. Inside repo (Fallback)
    candidates.append(("LOCAL_REPO", SCRIPT_DIR / "corpus"))
    
    # 5. Root-level caches
    candidates.append(("ROOT_ARTICLES", Path("/articles")))
    candidates.append(("MNT_ARTICLES", Path("/mnt/articles")))

    print(f"[CorpusDiscovery] Scanning candidates...")
    
    best_path = SCRIPT_DIR / "corpus"
    max_score = -1
    
    # Extensions we consider as "Corpus Data"
    EXTENSIONS = ["**/*.pdf", "**/*.txt", "**/*.jsonl", "**/*.json", "**/*.md", "**/*.csv"]
    
    for label, path in candidates:
        if path.exists() and path.is_dir():
            try:
                # Calculate a "Volume Score"
                # - Foundational files: small score
                # - Specialized subdirs: HUGE score
                found_files = 0
                for ext in EXTENSIONS:
                    found_files += len(list(path.glob(ext)))
                
                has_humanities = (path / "humanities").exists()
                has_bio = (path / "camel-ai-biology").exists()
                
                score = found_files
                if has_humanities: score += 10000
                if has_bio: score += 10000
                
                # Check for large files directly in path
                size_gb = sum(f.stat().st_size for f in path.glob("**/*") if f.is_file()) / (1024**3)
                if size_gb > 1.0: score += int(size_gb * 1000)

                print(f"  - [{label}] Found at {path} (Files: {found_files}, Size: {size_gb:.2f}GB, Volume: {'YES' if has_humanities else 'NO'}, Score: {score})")
                
                if score > max_score:
                    max_score = score
                    best_path = path
            except Exception as e:
                print(f"  - [{label}] Error scanning {path}: {e}")
                continue

    print(f"[CorpusDiscovery] Selected: {best_path} (Global Score: {max_score if max_score >=0 else 0})")
    return best_path

CORPUS_ROOT = discover_corpus_root()

# Progressive learning phases
CORPUS_PHASES = {
    "phase1_foundational": {
        "description": "Core foundational texts for early training (Phase 1-2)",
        "paths": [
            # Cybernetics & Systems
            CORPUS_ROOT / "Ashby-Introduction-to-Cybernetics.pdf",
            CORPUS_ROOT / "Conant_Ashby Every Good Regulator of a system must be a model of that system.pdf",
            CORPUS_ROOT / "cs.brandeis.edu_~richardw_Systems_Principles.txt.pdf",
            CORPUS_ROOT / "Principles_of_Systems_and_Cybernetics_an_evolution.pdf",

            # Information Theory
            CORPUS_ROOT / "entropy.pdf",
            CORPUS_ROOT / "dretske.precis knowledge flow of info.pdf",

            # Core Physics
            CORPUS_ROOT / "12. Erwin Schrodinger - What is Life (1944).pdf",

            # Formal Logic & Reasoning
            CORPUS_ROOT / "johnson-laird-2010-mental-models-and-human-reasoning.pdf",
            CORPUS_ROOT / "Kripke_Names_Necessity_and_Identity.pdf",
        ],
        "weight": 1.0,  # High sampling weight for early phases
    },

    "phase2_intermediate": {
        "description": "Intermediate complexity (Phase 3-4)",
        "paths": [
            # Complex Systems
            CORPUS_ROOT / "complex network approaches.pdf",
            CORPUS_ROOT / "am08-complete_22Feb09.pdf",  # Agent-based modeling

            # Machine Learning Foundations
            CORPUS_ROOT / "belkin-et-al-2019-reconciling-modern-machine-learning-practice-and-the-classical-bias-variance-trade-off.pdf",
            CORPUS_ROOT / "language_models_are_unsupervised_multitask_learners.pdf",

            # Cognitive Science
            CORPUS_ROOT / "Attention+and+Effort+-+Kahneman.pdf",
            CORPUS_ROOT / "Baumeister et al. (1998).pdf",  # Ego depletion
            CORPUS_ROOT / "The_interactivist_model.pdf",

            # Philosophy of Science
            CORPUS_ROOT / "structure_of_scientific_revolutions.pdf",
            CORPUS_ROOT / "Is_a_Phenomenological_Science_of_Conscio.pdf",
        ],
        "weight": 0.8,
    },

    "phase3_advanced": {
        "description": "Advanced topics (Phase 5+)",
        "paths": [
            # Advanced ML/AI
            CORPUS_ROOT / "2505.05522v4.pdf",  # CTM paper
            CORPUS_ROOT / "A_Review_on_Large_Language_Models_Architectures_Applications_Taxonomies_Open_Issues_and_Challenges.pdf",
            CORPUS_ROOT / "electronics-14-03647-v2.pdf",
            CORPUS_ROOT / "2009_curriculum_icml.pdf",

            # Collective Intelligence
            CORPUS_ROOT / "page-2025-everyone-everywhere-all-at-once-llms-and-the-new-physics-of-collective-intelligence.pdf",
            CORPUS_ROOT / "hong.and.page1.pdf",
            CORPUS_ROOT / "hong-page-2004-groups-of-diverse-problem-solvers-can-outperform-groups-of-high-ability-problem-solvers.pdf",

            # Advanced Systems Theory
            CORPUS_ROOT / "Cybernetics-FromPasttoFuture.pdf",
            CORPUS_ROOT / "bareinboim-pearl-2016-causal-inference-and-the-data-fusion-problem.pdf",

            # Symbolic Grounding
            CORPUS_ROOT / "The Symbol Grounding Problem.pdf",
            CORPUS_ROOT / "Semantic Grounding and the Preservation of Information in Recursive Systems (6).pdf",
        ],
        "weight": 0.6,
    },

    "phase4_specialized": {
        "description": "Specialized domain papers (Late phase, as needed)",
        "subdirs": [
            CORPUS_ROOT / "humanities",  # 105 files
            CORPUS_ROOT / "camel-ai-biology",
            CORPUS_ROOT / "cell2sentence",
            CORPUS_ROOT / "MIT Level 6 Fine-Grained, Full-Coverage, Lossless Critical Thinking Knowledge Graph",
            CORPUS_ROOT / "the-feynman-lectures-on-physics",
        ],
        "weight": 0.4,
    },
}

# Pillar-specific corpus mapping
PILLAR_CORPUS_MAP = {
    "LOGOS": {
        "priority": [
            "johnson-laird-2010-mental-models-and-human-reasoning.pdf",
            "Kripke_Names_Necessity_and_Identity.pdf",
            "2505.05522v4.pdf",  # CTM
            "MIT Level 6 Fine-Grained, Full-Coverage, Lossless Critical Thinking Knowledge Graph",
        ],
        "topics": ["formal logic", "reasoning", "proof theory", "mathematics"],
    },

    "PHYSIS": {
        "priority": [
            "12. Erwin Schrodinger - What is Life (1944).pdf",
            "the-feynman-lectures-on-physics",
            "2025.04.14.648850v1.full.pdf",  # Biology paper
        ],
        "topics": ["physics", "chemistry", "material science", "causality"],
    },

    "BIOS": {
        "priority": [
            "camel-ai-biology",
            "cell2sentence",
            "2025.04.14.648850v1.full.pdf",
            "elife-88173-v1.pdf",
            "pgae236_supplementary_data.pdf",
        ],
        "topics": ["biology", "health", "ecology", "organic systems"],
    },

    "NOMOS": {
        "priority": [
            "humanities",  # Legal texts
            "The-Institutional-Origins-of-the-Industrial-Revolution-2007-1mcjm82.pdf",
            "Intellectual-Property-Rights-the-Industrial-Revolution-and-the-2009-2mfnl6c.pdf",
        ],
        "topics": ["law", "governance", "institutions", "social order"],
    },

    "PSYCHE": {
        "priority": [
            "Attention+and+Effort+-+Kahneman.pdf",
            "Baumeister et al. (1998).pdf",
            "The_interactivist_model.pdf",
            "Is_a_Phenomenological_Science_of_Conscio.pdf",
            "hhci2018.pdf",
        ],
        "topics": ["cognition", "psychology", "mental models", "consciousness"],
    },

    "SOPHIA": {
        "priority": [
            "humanities",  # Philosophy texts
            "structure_of_scientific_revolutions.pdf",
            "superintelligentwill.pdf",
            "The Symbol Grounding Problem.pdf",
        ],
        "topics": ["ethics", "philosophy", "metaphysics", "epistemology"],
    },

    "OIKOS": {
        "priority": [
            "FreetoChoose51.pdf",
            "w3223.pdf",  # NBER economics
            "w31799.pdf",
            "Page - 2006 - Path Dependence.pdf",
            "hong.and.page1.pdf",
        ],
        "topics": ["economics", "resources", "sustainability", "systems"],
    },
}


def get_corpus_for_phase(phase: str) -> List[Path]:
    """
    Get corpus files for a specific training phase.

    Args:
        phase: One of "phase1_foundational", "phase2_intermediate", "phase3_advanced", "phase4_specialized"

    Returns:
        List of file paths for the specified phase
    """
    if phase not in CORPUS_PHASES:
        raise ValueError(f"Unknown phase: {phase}. Available: {list(CORPUS_PHASES.keys())}")

    config = CORPUS_PHASES[phase]
    files = []

    # Add explicit paths
    if "paths" in config:
        for path in config["paths"]:
            if path.exists():
                files.append(path)

    # Add subdirectories
    if "subdirs" in config:
        for subdir in config["subdirs"]:
            if subdir.exists() and subdir.is_dir():
                # Recursive glob to capture all files in subdatasets
                for ext in ["**/*.pdf", "**/*.txt", "**/*.jsonl", "**/*.json", "**/*.md"]:
                    files.extend(subdir.glob(ext))

    return files


def get_corpus_for_pillar(pillar: str, phase: str = "all") -> List[Path]:
    """
    Get corpus files relevant to a specific pillar.

    Args:
        pillar: One of the 7 sovereign pillars (LOGOS, PHYSIS, etc.)
        phase: Training phase to filter by (or "all")

    Returns:
        List of prioritized file paths for the pillar
    """
    if pillar not in PILLAR_CORPUS_MAP:
        raise ValueError(f"Unknown pillar: {pillar}. Available: {list(PILLAR_CORPUS_MAP.keys())}")

    config = PILLAR_CORPUS_MAP[pillar]
    files = []

    # Add priority files
    for filename in config["priority"]:
        if "/" in filename:
            # It's a path
            path = CORPUS_ROOT / filename
        else:
            # It's a filename
            path = CORPUS_ROOT / filename

        if path.exists():
            if path.is_dir():
                # Recursive glob
                for ext in ["**/*.pdf", "**/*.txt", "**/*.jsonl", "**/*.json", "**/*.md"]:
                    files.extend(path.glob(ext))
            else:
                files.append(path)

    # Filter by phase if specified
    if phase != "all":
        phase_files = set(get_corpus_for_phase(phase))
        files = [f for f in files if f in phase_files]

    return files


def get_all_corpus_files() -> List[Path]:
    """Get all corpus files across all phases."""
    files = set()
    for phase in CORPUS_PHASES.keys():
        files.update(get_corpus_for_phase(phase))
    return sorted(files)


def get_corpus_stats() -> Dict:
    """Get statistics about the corpus."""
    stats = {
        "total_size_gb": 0,
        "total_files": 0,
        "by_phase": {},
        "by_pillar": {},
    }

    # Count by phase
    for phase in CORPUS_PHASES.keys():
        files = get_corpus_for_phase(phase)
        size = sum(f.stat().st_size for f in files if f.exists())
        stats["by_phase"][phase] = {
            "files": len(files),
            "size_mb": size / (1024 * 1024),
        }

    # Count by pillar
    for pillar in PILLAR_CORPUS_MAP.keys():
        files = get_corpus_for_pillar(pillar, phase="all")
        stats["by_pillar"][pillar] = {
            "files": len(files),
        }

    # Total
    all_files = get_all_corpus_files()
    stats["total_files"] = len(all_files)
    stats["total_size_gb"] = sum(f.stat().st_size for f in all_files if f.exists()) / (1024**3)

    return stats


if __name__ == "__main__":
    # Test the configuration
    print("=== Corpus Configuration ===\n")

    stats = get_corpus_stats()
    print(f"Total Corpus: {stats['total_files']} files, {stats['total_size_gb']:.2f} GB\n")

    print("By Phase:")
    for phase, data in stats["by_phase"].items():
        print(f"  {phase}: {data['files']} files ({data['size_mb']:.1f} MB)")

    print("\nBy Pillar:")
    for pillar, data in stats["by_pillar"].items():
        print(f"  {pillar}: {data['files']} files")

    print("\n=== Sample Files by Pillar ===")
    for pillar in ["LOGOS", "PHYSIS", "BIOS"]:
        files = get_corpus_for_pillar(pillar, phase="phase1_foundational")
        print(f"\n{pillar} (Phase 1):")
        for f in files[:3]:
            print(f"  - {f.name}")
