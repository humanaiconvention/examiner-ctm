# Research Wiki Entry Schema

All research wiki entries are Markdown files with the following structure:

1. **YAML frontmatter** describing provenance and operational metadata.
2. **Structured Markdown sections** that capture integration-ready knowledge.

## YAML Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `created_by` | yes | GitHub handle or automation identifier that authored the entry. |
| `last_updated` | yes | ISO-8601 timestamp in UTC marking the latest substantive edit. |
| `tags` | yes | Array of lowercase slugs for quick filtering (e.g., `['langgraph', 'integration']`). |
| `version` | yes | Semantic or date-based version string for the entry content. |
| `source_url` | yes | Canonical reference for the primary source material. Use `null` if internal-only. |
| `source_timestamp` | yes | ISO-8601 timestamp representing when the source was last verified. |
| `license` | yes | License associated with the sourced material (e.g., `CC-BY-4.0`, `MIT`). |

## Markdown Body Sections

Each section should be introduced with a level-2 heading (`##`).

1. `## Title`  
   Concise human-readable name of the concept/module/flow/benchmark/source.
2. `## Summary`  
   3-5 sentence overview detailing why this knowledge matters for the Explorer + Research stack.
3. `## Integration Points`  
   Bullet list or sub-headings mapping the entry into existing modules (e.g., simulator bridge, state controller, LangGraph flows).
4. `## Related Concepts`  
   References to other wiki entries by relative path plus any external resources that enrich the context.
5. `## Provenance`  
   Explain how the information was derived, transformations performed, and validation steps.
6. `## Suggested Extensions`  
   Concrete follow-ups or experiments for contributors (e.g., new LangGraph node, additional benchmark).

### Example Skeleton

```markdown
---
created_by: github:humanaiconvention
last_updated: 2025-10-09T00:00:00Z
tags:
  - langgraph
version: "0.1.0"
source_url: https://example.org/paper
source_timestamp: 2025-10-01T12:00:00Z
license: CC-BY-4.0
---

## Title

{Short title}

## Summary

{Overview of the entry}

## Integration Points

- {Module or flow hook}

## Related Concepts

- [[concepts/robust_integration]]

## Provenance

{Notes about data gathering and validation}

## Suggested Extensions

- {Future work}
```

### Validation Notes

- Keep tables and code blocks minimal—prefer lists for compatibility with LangChain parsers.
- All timestamps must include timezone (`Z`).
- RFC 3986 compliance is required for URLs to avoid ingestion failures.
- Use relative wiki links (`[[path/to/entry]]`) so the ingestion pipeline can resolve connections during graph construction.
