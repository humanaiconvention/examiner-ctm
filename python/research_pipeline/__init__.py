"""Research PDF ingestion and registry utilities.

This package provides helpers to ingest a corpus of PDF research
articles into the HumanAI Convention research substrate. The primary
entrypoint is :func:`ingest_pdfs.ingest_corpus`, which extracts
summaries, quotes, semantic tags, and proxy logic mappings for each
paper. Generated artifacts are consumed by the JavaScript research
pipeline within the `consciousness-explorer` workspace.
"""

from .ingest_pdfs import ingest_corpus, main as cli  # noqa: F401
