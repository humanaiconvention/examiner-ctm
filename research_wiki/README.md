# Research Knowledge Wiki

This directory hosts structured research knowledge that feeds the Explorer + Research stack. Entries follow the schema documented in `./_meta/schema.md` and are organized by domain:

- `concepts/` — foundational theories and integration practices.
- `modules/` — explorer components, controllers, and adapters.
- `flows/` — LangGraph / flow selector execution patterns.
- `benchmarks/` — repeatable validation harnesses and stress tests.
- `sources/` — curated references with traceable provenance.

## Integration Overview

The existing research pipeline (`consciousness-explorer/modules/research/pipeline`) already exposes:

- LangChain-ready document loaders and prompt builders.
- LangGraph orchestration via `GraphOrchestrator` and the shared context bus.
- Simulator bridge instrumentation and telemetry-backed fallbacks.

The wiki extends this pipeline:

1. **Ingestion** — LangChain document loaders parse Markdown entries, extract YAML frontmatter, and normalize the body sections.
2. **Indexing** — Entries are embedded using the existing LangChain vector store provider (FAISS by default, pluggable for Weaviate).
3. **Graph Routing** — LangGraph nodes (`research_lookup`, `research_intake`, `explorer_bridge`) consume the indexed material to influence Explorer reasoning flows.
4. **Provenance** — Every entry is tagged with timestamps, licensing, and source URLs to ensure downstream audits can reconstruct derivations.

## Authoring Guidelines

1. Use the template in `_meta/schema.md` to guarantee ingestion compatibility.
2. Keep prose concise; summarize key integration points and identify related concepts using `[[relative/wiki/path]]` references.
3. When referencing Explorer assets, prefer stable module paths (e.g., `modules/flows/stateController.js`).
4. Store raw extracts or supporting assets in the top-level `sources/` directory (see project root) and reference them via `source_url`.
5. Update `contributions.yaml` when introducing new public/private overlays or when elevating experimental knowledge.

## Automation Hooks

- CI will lint the wiki for frontmatter completeness and timestamp freshness.
- Future test harnesses will exercise the ingestion pipeline against these entries before LangGraph simulations are executed.

For questions or onboarding support, see `start.md` in the repo root or reach out via the `#research-integrations` Slack channel.
