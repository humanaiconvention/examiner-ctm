# Sources Repository

The `sources/` directory holds raw research material that has not yet been normalized into `research_wiki/` entries. Everything stored here must be attributable, timestamped, and convertible via `scripts/source_parser.py`.

## Directory Layout

- `sources/raw/` — Original extracts (JSON or Markdown) accompanied by metadata.
- `.gitkeep` — Ensures the directory remains in version control even when empty.

## Authoring Checklist

1. **Format**: Prefer JSON payloads with explicit fields (`title`, `summary`, `citation`, etc.). Markdown is acceptable when the upstream source contains tables or math salvaged from HTML. Avoid PDFs or proprietary binaries.
2. **Metadata**: Include `source_url`, `source_timestamp` (ISO-8601, UTC), and `license` keys inside the payload to simplify conversion.
3. **Attribution**: Preserve author names and publication venues whenever available; the wiki entry should inherit or refine this data.
4. **Conversion**: Run the parser to produce a wiki entry:

   ```pwsh
   python scripts/source_parser.py \
     --raw-path sources/raw/f-divergence.json \
     --category sources \
     --slug f_divergence_reference \
     --created-by github:humanaiconvention \
     --tags divergence information-theory reference
   ```

5. **Validation**: After conversion, ensure the resulting Markdown passes frontmatter linting and that relative wiki links resolve.

## Versioning Notes

- Raw extracts should be treated as immutable snapshots; if the upstream content changes, create a new payload with an updated timestamp.
- The ingestion pipeline can be re-run idempotently—new entries with the same slug will overwrite prior versions while preserving git history.

For additional context, see `research_wiki/README.md` and the schema under `research_wiki/_meta/schema.md`.
