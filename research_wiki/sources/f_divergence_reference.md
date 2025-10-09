---
created_by: github:humanaiconvention
last_updated: 2025-10-09T12:20:00Z
tags:
  - divergence
  - information-theory
  - reference
version: "0.1.0"
source_url: https://en.wikipedia.org/wiki/F-divergence
source_timestamp: 2025-10-09T11:45:00Z
license: CC-BY-SA-3.0
---

# Research Entry · sources/f_divergence_reference

## Title

Csiszár f-Divergence Reference Summary

## Summary

This entry captures the essential properties of f-divergences (convex generator, symmetry constraints, variational bounds) relevant to research tasks that compare simulator output distributions. The goal is to expose formula snippets and guidance for flows that monitor divergence between observed artifacts and wiki-informed expectations.

## Integration Points

- `modules/research/pipeline/core.js`: Extend `buildTilePrompt()` to optionally inject divergence insights when a research fragment cites this source.
- `modules/flows/stateController.js`: Use divergence thresholds when deciding whether to resolve uncertainties based on simulated evidence.
- `modules/flows/langGraphRuntime.js`: Provide `explorer_bridge` with reference metadata so graph decisions can request divergence checks through LangChain tools.
- `source_parser.py`: Convert raw HTML tables (generator function, KL specialization) into Markdown and JSON snippets stored under `sources/raw/`.

## Related Concepts

- [[concepts/robust_integration]]
- [[benchmarks/resilience_tests]]
- External: Csiszár, I. "Information-type measures of difference of probability distributions." Magyar Tud. Akad. Mat. Kutató Int. Közl. 1963.

## Provenance

Content summarized from the Wikipedia page `F-divergence` (CC-BY-SA-3.0) plus cross-checks against the original Csiszár paper. Extraction requires attribution and timestamp recording in the raw `sources/` payloads.

## Suggested Extensions

- Add a JSON companion file under `sources/` containing symbolic forms of common divergences (KL, Hellinger, Total Variation) for programmatic use.
- Provide LangChain tools that evaluate divergence values given simulator output streams.
- Investigate linking to stability benchmarks that ensure divergence-based alarms do not conflict with simulator retry logic.
