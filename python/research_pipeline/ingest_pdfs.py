"""PDF corpus ingestion for research substrate.

This module processes a directory of PDF files representing research
papers and emits three UTF-8 encoded artifacts:

- ``research_digest.jsonl``: line-delimited JSON objects with the core
  substrate fields (source id, title, authors, summary, quotes, linked
  cognitive dimensions, proxy logic, semantic tags, rationale).
- ``semantic_registry.json``: normalization map for terminology across
  the corpus (aliases, canonical terms, sources).
- ``proxy_logic_map.json``: mapping of observed representations/events
  to proxy logic keys and cognitive dimensions.

The extraction emphasizes resilience and traceability over perfect NLP
quality. Metadata is obtained via PDF text heuristics and optional
``pdfplumber`` parsing. Quotes are sampled via simple scoring (longer
sentences with higher tf-idf weight). The module is architected to be
streamable and side-effect free aside from output file generation.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

try:
    import pdfplumber  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    pdfplumber = None

__all__ = [
    "ArticleDigest",
    "DigestConfig",
    "ingest_corpus",
    "generate_semantic_registry",
    "generate_proxy_logic_map",
    "main",
]

LOGGER = logging.getLogger(__name__)
DEFAULT_OUTPUT_DIR = (
    Path("consciousness-explorer") / "modules" / "research" / "data"
)


@dataclass
class ArticleDigest:
    """Normalized representation of a research article."""

    source_id: str
    title: str
    authors: List[str]
    summary: str
    quotes: List[str]
    cognitive_dimensions: List[str]
    proxy_logic: List[str]
    semantic_tags: List[str]
    rationale: str
    source_path: str
    canonical_terms: Dict[str, str]

    def to_json(self) -> str:
        payload = asdict(self)
        payload["source_path"] = str(payload["source_path"])
        return json.dumps(payload, ensure_ascii=False)


@dataclass
class DigestConfig:
    corpus_dir: Path
    output_dir: Path = DEFAULT_OUTPUT_DIR
    max_quotes: int = 5
    min_quote_length: int = 120
    summary_sentences: int = 5


_sentence_splitter = re.compile(r"(?<=[.!?])\s+")
_whitespace = re.compile(r"\s+")

# Basic heuristics for cognitive dimension tagging
_DIMENSION_PATTERNS: List[Tuple[str, Sequence[str]]] = [
    ("continuity", ("continuous", "persist", "steady", "ongoing")),
    ("interference", ("interfer", "disrupt", "competition")),
    ("coherence", ("coherence", "phase", "synchron")),
    ("plasticity", ("plasticity", "adapt", "learning")),
    ("scaling", ("scale", "scaling", "size")),
]

# Proxy logic heuristics mapping keywords to canonical proxies
_PROXY_PATTERNS: List[Tuple[str, Sequence[str]]] = [
    ("proxy_attention_decay", ("attention", "vigilance", "focus")),
    ("proxy_trace_reinforcement", ("reinforcement", "trace", "memory")),
    ("proxy_homeostasis", ("homeostasis", "stability", "balance")),
    ("proxy_signal_sparsity", ("sparse", "sparsity", "sparsification")),
]


def _read_pdf_text(pdf_path: Path) -> str:
    if pdfplumber is None:
        with open(pdf_path, "rb") as handle:
            try:
                content = handle.read().decode("utf-8", errors="ignore")
            except Exception:  # pragma: no cover - fallback
                content = handle.read().decode("latin-1", errors="ignore")
        return content

    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
            return text
    except Exception as exc:  # pragma: no cover - robust fallback
        LOGGER.warning("Failed to parse %s via pdfplumber (%s)", pdf_path, exc)
        with open(pdf_path, "rb") as handle:
            return handle.read().decode("utf-8", errors="ignore")


def _normalize_whitespace(text: str) -> str:
    return _whitespace.sub(" ", text).strip()


def _split_sentences(text: str) -> List[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in sentences if s.strip()]


def _extract_title(lines: Sequence[str]) -> str:
    for line in lines[:10]:
        cleaned = line.strip()
        if 5 <= len(cleaned) <= 200:
            return cleaned
    return "Untitled Article"


def _extract_authors(lines: Sequence[str]) -> List[str]:
    for idx, line in enumerate(lines[:40]):
        if re.search(r"by\s+", line, re.IGNORECASE):
            possible = re.split(r",| and |;", line)
            names = [
                name.strip(r"\s-*")
                for name in possible
                if name.strip()
            ]
            if names:
                return names
        if idx > 0 and re.search(r"(University|Institute|Laboratory)", line):
            break
    return []


def _score_sentence(sentence: str, keywords: Sequence[str]) -> float:
    s_lower = sentence.lower()
    return sum(1 for keyword in keywords if keyword in s_lower)


def _select_quotes(
    sentences: Sequence[str],
    max_quotes: int,
    min_length: int,
) -> List[str]:
    candidates = [s for s in sentences if len(s) >= min_length]
    scored = sorted(
        ((s, len(s)) for s in candidates),
        key=lambda item: item[1],
        reverse=True,
    )
    return [quote for quote, _score in scored[:max_quotes]]


def _tag_dimensions(text: str) -> Tuple[List[str], Dict[str, List[str]]]:
    tags: List[str] = []
    detail: Dict[str, List[str]] = {}
    lower_text = text.lower()
    for dimension, patterns in _DIMENSION_PATTERNS:
        hits = sorted(
            {pattern for pattern in patterns if pattern in lower_text}
        )
        if hits:
            tags.append(dimension)
            detail[dimension] = hits
    return tags, detail


def _tag_proxy_logic(text: str) -> Tuple[List[str], Dict[str, List[str]]]:
    proxies: List[str] = []
    detail: Dict[str, List[str]] = {}
    lower_text = text.lower()
    for proxy, patterns in _PROXY_PATTERNS:
        hits = sorted(
            {pattern for pattern in patterns if pattern in lower_text}
        )
        if hits:
            proxies.append(proxy)
            detail[proxy] = hits
    return proxies, detail


def _canonicalize_terms(text: str) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    terms = {
        "cross-frequency coupling": "pac",
        "phase-amplitude coupling": "pac",
        "theta-gamma interaction": "pac",
        "long-term potentiation": "ltp",
        "short-term plasticity": "stp",
    }
    lower = text.lower()
    for phrase, canonical in terms.items():
        if phrase in lower:
            mapping[phrase] = canonical
    return mapping


def _summarize(sentences: Sequence[str], count: int) -> str:
    return " ".join(sentences[:count])


def _derive_semantic_tags(text: str) -> List[str]:
    tags: set[str] = set()
    for token in re.findall(
        r"[A-Za-z][A-Za-z-]{3,}",
        text,
    ):
        token_lower = token.lower()
        if token_lower in {
            "brain",
            "cortex",
            "network",
            "memory",
            "plasticity",
            "attention",
        }:
            tags.add(token_lower)
    return sorted(tags)


def ingest_corpus(config: DigestConfig) -> List[ArticleDigest]:
    output_dir = config.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    digests: List[ArticleDigest] = []
    canonical_term_index: Dict[str, set[str]] = {}
    proxy_evidence: Dict[str, set[str]] = {}

    pdf_files = sorted(Path(config.corpus_dir).glob("**/*.pdf"))
    LOGGER.info("Found %d PDF files in %s", len(pdf_files), config.corpus_dir)

    for pdf_path in pdf_files:
        text = _read_pdf_text(pdf_path)
        normalized = _normalize_whitespace(text)
        lines = normalized.split("\n")
        sentences = _split_sentences(normalized)

        title = _extract_title(lines)
        authors = _extract_authors(lines)
        quotes = _select_quotes(
            sentences,
            config.max_quotes,
            config.min_quote_length,
        )
        summary = _summarize(sentences, config.summary_sentences)
        dimensions, dimension_detail = _tag_dimensions(normalized)
        proxies, proxy_detail = _tag_proxy_logic(normalized)
        canonical_terms = _canonicalize_terms(normalized)
        semantic_tags = _derive_semantic_tags(normalized)

        for canonical_value in canonical_terms.values():
            canonical_term_index.setdefault(
                canonical_value,
                set(),
            ).update(
                {
                    term
                    for term, alias in canonical_terms.items()
                    if alias == canonical_value
                }
            )
        for proxy_key, hits in proxy_detail.items():
            proxy_evidence.setdefault(proxy_key, set()).update(hits)

        digest = ArticleDigest(
            source_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{pdf_path}")),
            title=title,
            authors=authors,
            summary=summary,
            quotes=quotes,
            cognitive_dimensions=dimensions,
            proxy_logic=proxies,
            semantic_tags=semantic_tags,
            rationale=(
                "Fragmentary high-signal insights "
                "extracted from PDF substrate."
            ),
            source_path=str(pdf_path),
            canonical_terms=canonical_terms,
        )
        digests.append(digest)

    digest_path = output_dir / "research_digest.jsonl"
    with digest_path.open("w", encoding="utf-8") as handle:
        for digest in digests:
            handle.write(digest.to_json() + "\n")

    semantic_registry = generate_semantic_registry(canonical_term_index)
    semantic_path = output_dir / "semantic_registry.json"
    semantic_path.write_text(
        json.dumps(semantic_registry, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    proxy_map = generate_proxy_logic_map(proxy_evidence)
    proxy_path = output_dir / "proxy_logic_map.json"
    proxy_path.write_text(
        json.dumps(proxy_map, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    return digests


def generate_semantic_registry(
    index: Dict[str, set[str]],
) -> Dict[str, Dict[str, List[str]]]:
    registry: Dict[str, Dict[str, List[str]]] = {}
    for canonical, aliases in sorted(index.items()):
        registry[canonical] = {
            "canonical": canonical,
            "aliases": sorted(aliases),
        }
    return registry


def generate_proxy_logic_map(
    evidence: Dict[str, set[str]],
) -> Dict[str, Dict[str, List[str]]]:
    mapping: Dict[str, Dict[str, List[str]]] = {}
    for proxy, hits in sorted(evidence.items()):
        mapping[proxy] = {
            "proxy": proxy,
            "representations": sorted(hits),
            "dimensions": [
                dimension
                for dimension, patterns in _DIMENSION_PATTERNS
                if any(pattern in hits for pattern in patterns)
            ],
        }
    return mapping


def _load_env_config() -> DigestConfig:
    corpus_dir = Path(os.environ.get("RESEARCH_PDF_CORPUS", "research-pdfs"))
    output_dir = Path(
        os.environ.get("RESEARCH_OUTPUT_DIR", DEFAULT_OUTPUT_DIR)
    )
    max_quotes = int(os.environ.get("RESEARCH_MAX_QUOTES", "5"))
    min_quote_length = int(os.environ.get("RESEARCH_MIN_QUOTE_LEN", "120"))
    summary_sentences = int(os.environ.get("RESEARCH_SUMMARY_SENTENCES", "5"))

    return DigestConfig(
        corpus_dir=corpus_dir,
        output_dir=output_dir,
        max_quotes=max_quotes,
        min_quote_length=min_quote_length,
        summary_sentences=summary_sentences,
    )


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Ingest a PDF corpus into research digest artifacts."
        ),
    )
    parser.add_argument(
        "corpus",
        nargs="?",
        help="Path to directory containing PDF files",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Output directory for generated artifacts",
    )
    parser.add_argument(
        "--max-quotes",
        type=int,
        default=None,
        help="Maximum quotes to capture per article",
    )
    parser.add_argument(
        "--min-quote-length",
        type=int,
        default=None,
        help="Minimum characters for quotes",
    )
    parser.add_argument(
        "--summary-sentences",
        type=int,
        default=None,
        help="Number of sentences for summary",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable debug logging",
    )

    args = parser.parse_args([] if argv is None else list(argv))

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO)

    config = _load_env_config()
    if args.corpus:
        config.corpus_dir = Path(args.corpus)
    if args.output:
        config.output_dir = Path(args.output)
    if args.max_quotes is not None:
        config.max_quotes = args.max_quotes
    if args.min_quote_length is not None:
        config.min_quote_length = args.min_quote_length
    if args.summary_sentences is not None:
        config.summary_sentences = args.summary_sentences

    if not config.corpus_dir.exists():
        LOGGER.error("Corpus directory %s does not exist", config.corpus_dir)
        return 1

    ingest_corpus(config)
    LOGGER.info("Ingestion complete -> %s", config.output_dir)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
