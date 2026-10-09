from __future__ import annotations

import json
import re
from typing import Any


# Synced source material can contain MDX/component artifacts, so keep the regex set focused on the fragments leaking into visible text.
CARD_TAG_PATTERN = re.compile(r"<Card\b([^>]*)/?>", flags=re.IGNORECASE)
BROKEN_CARD_FRAGMENT_PATTERN = re.compile(r"<Card\b[^\n<]*", flags=re.IGNORECASE)
GENERIC_TAG_PATTERN = re.compile(r"</?[A-Za-z][^>]*>")
TABLE_ROW_PATTERN = re.compile(r"^\s*\|(.+)\|\s*$")
BULLET_PATTERN = re.compile(r"^\s*[-*]\s+")
ATTRIBUTE_FRAGMENT_PATTERN = re.compile(r'\b(?:emoji|description|title|className|visible)="[^"]*"?', flags=re.IGNORECASE)
TEXT_FIELD_KEYS = {
    "text",
    "explanation",
    "description",
    "title",
    "source_excerpt",
    "generation_notes",
    "body_text",
    "excerpt",
}
MARKDOWN_FIELD_KEYS = {
    "body_markdown",
}


def _normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _extract_card_attribute(attrs: str, name: str) -> str:
    match = re.search(rf'{name}="([^"]+)"', attrs)
    return _normalize_spaces(match.group(1)) if match else ""


def _replace_card_tag(match: re.Match[str]) -> str:
    attrs = match.group(1)
    title = _extract_card_attribute(attrs, "title")
    description = _extract_card_attribute(attrs, "description")
    emoji = _extract_card_attribute(attrs, "emoji")

    if title and description:
        return f"{title}: {description}"
    if description:
        return description
    if title:
        return title
    if emoji:
        return emoji
    return ""


def _replace_broken_card_fragment(match: re.Match[str]) -> str:
    fragment = match.group(0)
    title = _extract_card_attribute(fragment, "title")
    description = _extract_card_attribute(fragment, "description")

    free_title_fragment = re.sub(r"^<Card\b", "", fragment, flags=re.IGNORECASE)
    free_title_fragment = re.split(r"\b(?:title|description|emoji|className|visible)\s*=", free_title_fragment, maxsplit=1)[0]
    free_title = _normalize_spaces(free_title_fragment.strip(" /"))

    resolved_title = title or free_title
    if resolved_title and description:
        return f"{resolved_title}: {description}"
    if description:
        return description
    if resolved_title:
        return resolved_title
    return ""


def _sanitize_table_row(value: str) -> str:
    match = TABLE_ROW_PATTERN.match(value)
    if not match:
        return value

    cells = [_normalize_spaces(cell) for cell in match.group(1).split("|")]
    cells = [cell for cell in cells if cell]
    if not cells:
        return value

    if all(set(cell) <= {"-", ":"} for cell in cells):
        return ""

    meaningful_cells = [cell for cell in cells if cell not in {"✅", "❌"}]
    if not meaningful_cells:
        return value
    if len(meaningful_cells) == 1:
        return meaningful_cells[0]

    first = meaningful_cells[0]
    last = meaningful_cells[-1]
    headerish = {"crypto card", "self-custodial", "non-custodial", "key notes", "feature", "traditional apps", "ethereum apps"}
    if first.lower() in headerish:
        return ""
    if last == first:
        return first
    return f"{first}: {last}"


def sanitize_display_text(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        return value

    # Normalize the most common authoring artifacts into plain text instead of dropping whole lines that still contain useful copy.
    sanitized = CARD_TAG_PATTERN.sub(_replace_card_tag, value)
    sanitized = BROKEN_CARD_FRAGMENT_PATTERN.sub(_replace_broken_card_fragment, sanitized)
    sanitized = ATTRIBUTE_FRAGMENT_PATTERN.sub(" ", sanitized)
    sanitized = GENERIC_TAG_PATTERN.sub(" ", sanitized)
    sanitized = _sanitize_table_row(sanitized)
    sanitized = BULLET_PATTERN.sub("", sanitized)
    sanitized = re.sub(r"\bemoji=\"[^\"]+\"", " ", sanitized)
    sanitized = re.sub(r"\bdescription=\"([^\"]+)\"", r"\1", sanitized)
    sanitized = re.sub(r'\btitle=\"([^\"]+)\"', r"\1", sanitized)
    sanitized = sanitized.replace(" | ", ": ").replace("|", " ")
    sanitized = sanitized.replace("✅", " ")
    sanitized = sanitized.replace("❌", " ")
    sanitized = re.sub(r"(?:\s*:\s*){2,}", ": ", sanitized)
    sanitized = re.sub(r"\s+:\s+", ": ", sanitized)
    sanitized = sanitized.replace('""', '"')
    sanitized = _normalize_spaces(sanitized)
    sanitized = sanitized.strip(' "\'')
    sanitized = sanitized.strip("<>/")
    sanitized = _normalize_spaces(sanitized)
    return sanitized


def sanitize_markdown_text(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        return value

    sanitized_lines: list[str] = []
    in_code_block = False

    for raw_line in value.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        stripped = raw_line.strip()

        if stripped.startswith("```"):
            in_code_block = not in_code_block
            sanitized_lines.append(stripped)
            continue

        if in_code_block:
            # Code fences should remain byte-for-byte readable apart from trailing whitespace cleanup.
            sanitized_lines.append(raw_line.rstrip())
            continue

        if not stripped:
            sanitized_lines.append("")
            continue

        if stripped.startswith("<Card ") or stripped.startswith("<Card>") or stripped.startswith("<Card\t"):
            cleaned = sanitize_display_text(stripped)
            if cleaned:
                sanitized_lines.append(cleaned)
            continue

        if stripped.startswith("<ExpandableCard"):
            cleaned = sanitize_display_text(stripped)
            if cleaned:
                sanitized_lines.append(cleaned)
            continue

        if re.match(r"^</?(?:CardGrid|BrowseApps|WhatAreAppsStories|ExpandableCard)\b", stripped):
            continue

        if stripped.startswith("<") and not GENERIC_TAG_PATTERN.sub(" ", stripped).strip():
            # Pure wrapper tags add no learner-visible content and would otherwise leak as empty markdown lines.
            continue

        line = CARD_TAG_PATTERN.sub(_replace_card_tag, raw_line)
        line = BROKEN_CARD_FRAGMENT_PATTERN.sub(_replace_broken_card_fragment, line)
        line = ATTRIBUTE_FRAGMENT_PATTERN.sub(" ", line)
        line = GENERIC_TAG_PATTERN.sub(" ", line)
        line = re.sub(r"\{#[^}]+\}", "", line)
        line = re.sub(r"[ \t]+", " ", line).rstrip()
        sanitized_lines.append(line)

    sanitized = "\n".join(sanitized_lines)
    sanitized = re.sub(r"\n{3,}", "\n\n", sanitized)
    return sanitized.strip()


def sanitize_quiz_payload(payload: Any) -> Any:
    if isinstance(payload, list):
        return [sanitize_quiz_payload(item) for item in payload]
    if isinstance(payload, dict):
        sanitized: dict[str, Any] = {}
        for key, value in payload.items():
            if isinstance(value, str) and key in TEXT_FIELD_KEYS:
                sanitized[key] = sanitize_display_text(value)
            elif isinstance(value, str) and key in MARKDOWN_FIELD_KEYS:
                # Markdown fields need structure-aware cleanup so headings, quotes, and lists survive snapshot rewrites.
                sanitized[key] = sanitize_markdown_text(value)
            else:
                sanitized[key] = sanitize_quiz_payload(value)
        return sanitized
    return payload


def sanitize_snapshot_payload(snapshot: dict[str, Any]) -> dict[str, Any]:
    # Round-trip through JSON so nested payloads are deep-copied before in-place sanitization mutates any fields.
    normalized = json.loads(json.dumps(snapshot))
    if isinstance(normalized.get("catalog_json"), dict):
        normalized["catalog_json"] = sanitize_quiz_payload(normalized["catalog_json"])
    if isinstance(normalized.get("quiz_catalog_json"), dict):
        normalized["quiz_catalog_json"] = sanitize_quiz_payload(normalized["quiz_catalog_json"])
    return normalized
