"""Utility for converting raw research sources into wiki-compliant
Markdown entries.

The converter reads structured payloads (JSON or Markdown with optional
frontmatter), normalizes them to the schema defined in
`research_wiki/_meta/schema.md`, and writes the result into the
appropriate category directory under `research_wiki/`.

Example usage:

    python scripts/source_parser.py \
        --raw-path sources/raw/f-divergence.json \
        --category sources \
        --slug f_divergence_reference \
        --created-by github:humanaiconvention \
        --tags divergence information-theory reference \
        --version 0.1.1 \
        --output-dir research_wiki

"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional

SECTION_ORDER = [
    "Title",
    "Summary",
    "Integration Points",
    "Related Concepts",
    "Provenance",
    "Suggested Extensions",
]

CATEGORY_CHOICES = {"concepts", "modules", "flows", "benchmarks", "sources"}


def _warn(message: str) -> None:
    print(f"[source_parser] {message}", file=sys.stderr)


def _load_payload(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Raw source not found: {path}")

    suffix = path.suffix.lower()
    if suffix == ".json":
        return json.loads(path.read_text(encoding="utf-8"))

    if suffix in {".md", ".markdown"}:
        return _parse_markdown_payload(path.read_text(encoding="utf-8"))

    raise ValueError(f"Unsupported raw format: {path.suffix}")


def _parse_markdown_payload(text: str) -> Dict[str, Any]:
    """Parse a Markdown payload that may contain YAML frontmatter.

    This helper is intentionally lightweight; it does not attempt to parse
    complex Markdown. The expectation is that scraped payloads will be JSON
    whenever possible. For Markdown, a leading frontmatter block delineated by
    `---` lines is optional.
    """

    lines = text.splitlines()
    frontmatter: Dict[str, Any] = {}
    body_lines: List[str] = []

    if lines and lines[0].strip() == "---":
        idx = 1
        while idx < len(lines) and lines[idx].strip() != "---":
            line = lines[idx].strip()
            idx += 1
            if not line or line.startswith("#"):
                continue
            if ":" in line:
                key, value = line.split(":", 1)
                frontmatter[key.strip()] = value.strip()
        body_lines = lines[idx + 1:]
    else:
        body_lines = lines

    sections: Dict[str, Any] = {}
    current_header: Optional[str] = None
    buffer: List[str] = []

    for line in body_lines:
        if line.startswith("## "):
            if current_header and buffer:
                sections[current_header] = "\n".join(buffer).strip()
            current_header = line[3:].strip()
            buffer = []
        else:
            buffer.append(line)
    if current_header and buffer:
        sections[current_header] = "\n".join(buffer).strip()

    return {
        "frontmatter": frontmatter,
        "sections": sections,
    }


def _dump_yaml(data: Mapping[str, Any]) -> str:
    lines: List[str] = ["---"]
    for key, value in data.items():
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - {item}")
        elif value is None:
            lines.append(f"{key}: null")
        else:
            lines.append(f"{key}: {value}")
    lines.append("---")
    return "\n".join(lines)


def _format_section_content(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join(f"- {item}" for item in value)
    if isinstance(value, dict):
        return "\n".join(f"- **{key}**: {val}" for key, val in value.items())
    return str(value).strip()


@dataclass
class ResearchEntry:
    category: str
    slug: str
    created_by: str
    last_updated: str
    tags: List[str] = field(default_factory=list)
    version: str = "0.1.0"
    source_url: Optional[str] = None
    source_timestamp: Optional[str] = None
    license: str = "CC-BY-4.0"
    sections: Mapping[str, Any] = field(default_factory=dict)

    def to_markdown(self) -> str:
        frontmatter = {
            "created_by": self.created_by,
            "last_updated": self.last_updated,
            "tags": self.tags,
            "version": self.version,
            "source_url": self.source_url or "null",
            "source_timestamp": self.source_timestamp or self.last_updated,
            "license": self.license,
        }

        frontmatter_block = _dump_yaml(frontmatter)
        heading = f"# Research Entry · {self.category}/{self.slug}"

        body_sections: List[str] = [heading]
        normalized_sections = self._normalize_sections(self.sections)
        for section_name in SECTION_ORDER:
            content = _format_section_content(
                normalized_sections.get(section_name)
            )
            body_sections.append(f"\n## {section_name}\n\n{content}\n")

        return (
            frontmatter_block
            + "\n\n"
            + "".join(body_sections).strip()
            + "\n"
        )

    def _normalize_sections(
        self, sections: Mapping[str, Any]
    ) -> Dict[str, Any]:
        normalized: Dict[str, Any] = {}
        for section in SECTION_ORDER:
            value = sections.get(section)
            if value is None and section == "Title":
                value = self.slug.replace("_", " ").title()
            normalized[section] = value or ""
        return normalized


def _ensure_iso_timestamp(value: Optional[str]) -> str:
    if value:
        return value
    now = datetime.now(timezone.utc).replace(microsecond=0)
    return now.isoformat().replace("+00:00", "Z")


def build_entry_from_payload(
    payload: Mapping[str, Any],
    *,
    category: str,
    slug: str,
    created_by: str,
    tags: Iterable[str],
    version: Optional[str],
    fallback_timestamp: Optional[str],
    license: Optional[str],
) -> ResearchEntry:
    frontmatter = dict(payload.get("frontmatter", {}))
    sections = dict(payload.get("sections", {}))

    resolved_tags = list(tags) if tags else frontmatter.get("tags", [])
    resolved_version = version or frontmatter.get("version", "0.1.0")
    resolved_license = license or frontmatter.get("license", "CC-BY-4.0")

    source_url = frontmatter.get("source_url")
    source_timestamp = frontmatter.get("source_timestamp")

    last_updated = _ensure_iso_timestamp(
        frontmatter.get("last_updated") or fallback_timestamp
    )

    return ResearchEntry(
        category=category,
        slug=slug,
        created_by=created_by,
        last_updated=last_updated,
        tags=resolved_tags,
        version=resolved_version,
        source_url=source_url,
        source_timestamp=_ensure_iso_timestamp(source_timestamp),
        license=resolved_license,
        sections=sections,
    )


def write_entry(entry: ResearchEntry, output_dir: Path) -> Path:
    if entry.category not in CATEGORY_CHOICES:
        raise ValueError(
            f"Unsupported category '{entry.category}'. "
            f"Valid options: {sorted(CATEGORY_CHOICES)}"
        )

    category_dir = output_dir / entry.category
    category_dir.mkdir(parents=True, exist_ok=True)

    target_path = category_dir / f"{entry.slug}.md"
    target_path.write_text(entry.to_markdown(), encoding="utf-8")
    return target_path


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert raw sources into research wiki entries."
    )
    parser.add_argument(
        "--raw-path",
        type=Path,
        required=True,
        help="Path to the raw source payload (JSON or Markdown).",
    )
    parser.add_argument(
        "--category",
        choices=sorted(CATEGORY_CHOICES),
        required=True,
    )
    parser.add_argument(
        "--slug",
        required=True,
        help="File slug (without extension).",
    )
    parser.add_argument(
        "--created-by",
        required=True,
        help="Author identifier for the wiki entry.",
    )
    parser.add_argument(
        "--tags",
        nargs="*",
        default=[],
        help="Space-separated tag list.",
    )
    parser.add_argument(
        "--version",
        help="Override content version (defaults to payload or 0.1.0).",
    )
    parser.add_argument(
        "--license",
        help="Override license (defaults to payload or CC-BY-4.0).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("research_wiki"),
        help="Root wiki directory.",
    )
    parser.add_argument(
        "--fallback-timestamp",
        help=(
            "Fallback ISO timestamp when payload frontmatter omits one "
            "(defaults to current UTC time)."
        ),
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    payload = _load_payload(args.raw_path)

    entry = build_entry_from_payload(
        payload,
        category=args.category,
        slug=args.slug,
        created_by=args.created_by,
        tags=args.tags,
        version=args.version,
        fallback_timestamp=args.fallback_timestamp,
        license=args.license,
    )

    target_path = write_entry(entry, args.output_dir)
    _warn(f"Wrote wiki entry to {target_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
