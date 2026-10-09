from __future__ import annotations

import base64
from copy import deepcopy
from datetime import datetime, timezone as dt_timezone
import hashlib
import json
import math
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import transaction
from django.template.defaultfilters import slugify
from django.utils import timezone

from .answer_balance import AnswerBalanceError, rebalance_quiz_questions, validate_quiz_answer_distribution
from .content_sync import sync_quiz_catalog_payload
from .generation import QuizGenerationError, generate_quiz_questions
from .models import Lesson, PublishedCatalog, Quiz
from .sanitize import sanitize_display_text, sanitize_snapshot_payload


class CatalogGenerationError(RuntimeError):
    """Raised when the upstream course catalog cannot be regenerated safely."""


class CatalogRegenerationLockedError(CatalogGenerationError):
    """Raised when quiz regeneration is attempted outside the explicit management command flow."""


@dataclass(frozen=True)
class UnitSourceSpec:
    external_id: str
    level: str
    order_index: int
    owner: str
    repo: str
    ref: str
    path: str
    license: str

    @property
    def repo_name(self) -> str:
        return f"{self.owner}/{self.repo}"


@dataclass(frozen=True)
class KnowledgePoint:
    context: str
    statement: str


TRACK_LABELS = {
    "beginner": "Beginner",
    "intermediate": "Intermediate",
    "advanced": "Advanced",
}


# The catalog is intentionally fixed-width for now: three tracks, seven units each, all sourced from vetted upstream documents.
UNIT_SPECS: tuple[UnitSourceSpec, ...] = (
    UnitSourceSpec("beginner-01-create-ethereum-account", "beginner", 1, "ethereum", "ethereum-org-website", "dev", "public/content/guides/how-to-create-an-ethereum-account/index.md", "CC BY 4.0"),
    UnitSourceSpec("beginner-02-use-a-wallet", "beginner", 2, "ethereum", "ethereum-org-website", "dev", "public/content/guides/how-to-use-a-wallet/index.md", "CC BY 4.0"),
    UnitSourceSpec("beginner-03-crypto-payments", "beginner", 3, "ethereum", "ethereum-org-website", "dev", "public/content/payments/index.md", "CC BY 4.0"),
    UnitSourceSpec("beginner-04-scam-help", "beginner", 4, "ethereum", "ethereum-org-website", "dev", "public/content/community/support/scams/index.md", "CC BY 4.0"),
    UnitSourceSpec("beginner-05-what-are-apps", "beginner", 5, "ethereum", "ethereum-org-website", "dev", "public/content/what-are-apps/index.md", "CC BY 4.0"),
    UnitSourceSpec("beginner-06-defi", "beginner", 6, "ethereum", "ethereum-org-website", "dev", "public/content/defi/index.md", "CC BY 4.0"),
    UnitSourceSpec("beginner-07-nft", "beginner", 7, "ethereum", "ethereum-org-website", "dev", "public/content/nft/index.md", "CC BY 4.0"),
    UnitSourceSpec("intermediate-01-bridges", "intermediate", 1, "ethereum", "ethereum-org-website", "dev", "public/content/bridges/index.md", "CC BY 4.0"),
    UnitSourceSpec("intermediate-02-wrapped-eth", "intermediate", 2, "ethereum", "ethereum-org-website", "dev", "public/content/wrapped-eth/index.md", "CC BY 4.0"),
    UnitSourceSpec("intermediate-03-dao", "intermediate", 3, "ethereum", "ethereum-org-website", "dev", "public/content/dao/index.md", "CC BY 4.0"),
    UnitSourceSpec("intermediate-04-web3", "intermediate", 4, "ethereum", "ethereum-org-website", "dev", "public/content/web3/index.md", "CC BY 4.0"),
    UnitSourceSpec("intermediate-05-decentralized-identity", "intermediate", 5, "ethereum", "ethereum-org-website", "dev", "public/content/decentralized-identity/index.md", "CC BY 4.0"),
    UnitSourceSpec("intermediate-06-privacy", "intermediate", 6, "ethereum", "ethereum-org-website", "dev", "public/content/privacy/index.md", "CC BY 4.0"),
    UnitSourceSpec("intermediate-07-real-world-assets", "intermediate", 7, "ethereum", "ethereum-org-website", "dev", "public/content/real-world-assets/index.md", "CC BY 4.0"),
    UnitSourceSpec("advanced-01-zero-knowledge-proofs", "advanced", 1, "ethereum", "ethereum-org-website", "dev", "public/content/zero-knowledge-proofs/index.md", "CC BY 4.0"),
    UnitSourceSpec("advanced-02-proof-of-work", "advanced", 2, "ethereum", "ethereum-org-website", "dev", "public/content/developers/docs/consensus-mechanisms/pow/index.md", "CC BY 4.0"),
    UnitSourceSpec("advanced-03-mining", "advanced", 3, "ethereum", "ethereum-org-website", "dev", "public/content/developers/docs/consensus-mechanisms/pow/mining/index.md", "CC BY 4.0"),
    UnitSourceSpec("advanced-04-proof-of-stake", "advanced", 4, "ethereum", "ethereum-org-website", "dev", "public/content/developers/docs/consensus-mechanisms/pos/index.md", "CC BY 4.0"),
    UnitSourceSpec("advanced-05-pos-vs-pow", "advanced", 5, "ethereum", "ethereum-org-website", "dev", "public/content/developers/docs/consensus-mechanisms/pos/pos-vs-pow/index.md", "CC BY 4.0"),
    UnitSourceSpec("advanced-06-how-bitcoin-works", "advanced", 6, "bitcoinbook", "bitcoinbook", "develop", "ch02_overview.adoc", "CC BY-NC-ND 3.0"),
    UnitSourceSpec("advanced-07-bitcoin-blockchain", "advanced", 7, "bitcoinbook", "bitcoinbook", "develop", "ch11_blockchain.adoc", "CC BY-NC-ND 3.0"),
)


MISCONCEPTION_LIBRARY = (
    # Fill any last-resort distractor gaps with generic misconceptions instead of emitting duplicate or empty answer options.
    "The topic in this unit guarantees profits with no trade-offs.",
    "The topic in this unit removes the need for verification or security checks.",
    "The topic in this unit works only when a single central authority approves every step.",
    "The topic in this unit can be used safely without understanding the process it describes.",
    "The topic in this unit makes all decisions irreversible and risk-free.",
)


def get_published_catalog() -> PublishedCatalog | None:
    catalog = PublishedCatalog.objects.filter(singleton_key=1).first()
    if catalog is not None:
        return catalog
    # Fall back to the checked-in snapshot so fresh local databases can still serve quiz content before regeneration/import.
    return bootstrap_published_catalog_from_static_snapshot()


def get_published_catalog_or_raise() -> PublishedCatalog:
    catalog = get_published_catalog()
    if catalog is None or not catalog.catalog_json:
        raise CatalogGenerationError("No published catalog is available yet.")
    return catalog


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def get_static_published_catalog_path() -> Path:
    # Allow commands/tests to override the snapshot path while keeping the repository file as the default source of truth.
    configured = os.getenv("STATIC_PUBLISHED_CATALOG_PATH", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return _repo_root() / "backend" / "quizzes" / "data" / "published_catalog.json"


def read_static_published_catalog() -> dict[str, Any]:
    path = get_static_published_catalog_path()
    if not path.exists():
        raise CatalogGenerationError("No static published quiz catalog snapshot is available.")
    try:
        # Sanitize after reading so even older snapshots benefit from the latest text-cleanup rules.
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CatalogGenerationError("Static published quiz catalog snapshot is unreadable.") from exc
    if not isinstance(payload, dict):
        raise CatalogGenerationError("Static published quiz catalog snapshot has an invalid shape.")
    if not isinstance(payload.get("catalog_json"), dict) or not isinstance(payload.get("quiz_catalog_json"), dict):
        raise CatalogGenerationError("Static published quiz catalog snapshot is missing catalog payloads.")
    return sanitize_snapshot_payload(payload)


def bootstrap_published_catalog_from_static_snapshot() -> PublishedCatalog | None:
    existing = PublishedCatalog.objects.filter(singleton_key=1).first()
    if existing is not None:
        return existing
    if Lesson.objects.exists() or Quiz.objects.exists():
        # Do not overwrite a partially initialized database implicitly; snapshot bootstrapping is only for truly empty quiz tables.
        return None

    try:
        snapshot = read_static_published_catalog()
    except CatalogGenerationError:
        return None

    published_at_raw = snapshot.get("published_at")
    published_at = timezone.now()
    if isinstance(published_at_raw, str) and published_at_raw.strip():
        parsed = datetime.fromisoformat(published_at_raw.replace("Z", "+00:00"))
        if timezone.is_naive(parsed):
            published_at = timezone.make_aware(parsed, dt_timezone.utc)
        else:
            published_at = parsed

    with transaction.atomic():
        # Publish the snapshot and hydrate relational quiz tables together so HTTP readers never see them drift apart.
        published_catalog, _ = PublishedCatalog.objects.get_or_create(singleton_key=1)
        published_catalog.version_hash = str(snapshot.get("version_hash") or "")
        published_catalog.catalog_json = snapshot["catalog_json"]
        published_catalog.quiz_catalog_json = snapshot["quiz_catalog_json"]
        published_catalog.published_at = published_at
        published_catalog.save(update_fields=["version_hash", "catalog_json", "quiz_catalog_json", "published_at"])
        sync_quiz_catalog_payload(snapshot["quiz_catalog_json"])

    return published_catalog


def _build_github_request(url: str) -> Request:
    # GitHub metadata requests are optional but give us stable download/source URLs plus authenticated rate limits when available.
    headers = {
        "Accept": "application/vnd.github.object+json",
        "User-Agent": "team-la-mesa-catalog/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if settings.GITHUB_CONTENT_API_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_CONTENT_API_TOKEN}"
    return Request(url, headers=headers, method="GET")


def _load_json_response(request: Request) -> dict[str, Any]:
    try:
        with urlopen(request, timeout=settings.QUIZ_CONTENT_REQUEST_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CatalogGenerationError("Unable to fetch source metadata from GitHub.") from exc

    if not isinstance(payload, dict):
        raise CatalogGenerationError("GitHub Contents API returned an unexpected payload.")
    return payload


def _load_text_response(url: str) -> str:
    request = Request(
        url,
        headers={"User-Agent": "team-la-mesa-catalog/1.0"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=settings.QUIZ_CONTENT_REQUEST_TIMEOUT_SECONDS) as response:
            return response.read().decode("utf-8")
    except (HTTPError, URLError, TimeoutError, OSError, UnicodeDecodeError) as exc:
        raise CatalogGenerationError("Unable to download source text from GitHub.") from exc


def _fetch_source_document(spec: UnitSourceSpec) -> tuple[dict[str, Any], str]:
    path = quote(spec.path)
    metadata_url = f"https://api.github.com/repos/{spec.owner}/{spec.repo}/contents/{path}?ref={quote(spec.ref)}"
    download_url = f"https://raw.githubusercontent.com/{spec.owner}/{spec.repo}/{spec.ref}/{spec.path}"
    source_url = f"https://github.com/{spec.owner}/{spec.repo}/blob/{spec.ref}/{spec.path}"
    content = ""

    try:
        payload = _load_json_response(_build_github_request(metadata_url))

        if payload.get("type") != "file":
            raise CatalogGenerationError(f"GitHub source path is not a file: {spec.path}")

        if isinstance(payload.get("download_url"), str) and payload["download_url"]:
            download_url = payload["download_url"]
        if isinstance(payload.get("html_url"), str) and payload["html_url"]:
            source_url = payload["html_url"]

        if payload.get("encoding") == "base64" and isinstance(payload.get("content"), str):
            try:
                content = base64.b64decode(payload["content"]).decode("utf-8")
            except (ValueError, UnicodeDecodeError):
                content = ""
    except CatalogGenerationError:
        # Fall back to raw downloads when the metadata path fails, because regeneration can still proceed without richer metadata.
        content = ""

    if not content:
        content = _load_text_response(download_url)

    source = {
        "provider": "github",
        "repo": spec.repo_name,
        "ref": spec.ref,
        "path": spec.path,
        "download_url": download_url,
        "source_url": source_url,
        "license": spec.license,
    }
    return source, content


def _strip_html_tags(value: str) -> str:
    value = re.sub(r"<br\s*/?>", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"</?[A-Za-z][^>]*>", "", value)
    return value


def _convert_html_tables_to_markdown(raw_text: str) -> str:
    def replace_table(match: re.Match[str]) -> str:
        table_html = match.group(0)
        caption_match = re.search(r"<caption[^>]*>(.*?)</caption>", table_html, flags=re.DOTALL | re.IGNORECASE)
        caption = _strip_html_tags(caption_match.group(1)).strip() if caption_match else ""

        rows: list[list[str]] = []
        for row_html in re.findall(r"<tr[^>]*>(.*?)</tr>", table_html, flags=re.DOTALL | re.IGNORECASE):
            cells = [
                _strip_html_tags(cell).strip()
                for cell in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, flags=re.DOTALL | re.IGNORECASE)
            ]
            cells = [re.sub(r"\s+", " ", cell).strip() for cell in cells if cell.strip()]
            if cells:
                rows.append(cells)

        if not rows:
            return caption

        # Normalize ragged HTML tables so the downstream markdown parser can always treat the first row as a consistent header.
        width = max(len(row) for row in rows)
        normalized_rows = [row + [""] * (width - len(row)) for row in rows]
        header = normalized_rows[0]
        divider = ["---"] * width
        body_rows = normalized_rows[1:]
        markdown_rows = [
            "| " + " | ".join(header) + " |",
            "| " + " | ".join(divider) + " |",
            *["| " + " | ".join(row) + " |" for row in body_rows],
        ]

        if caption:
            return f"{caption}\n\n" + "\n".join(markdown_rows)
        return "\n".join(markdown_rows)

    return re.sub(r"<table\b.*?</table>", replace_table, raw_text, flags=re.DOTALL | re.IGNORECASE)


def _collapse_blank_lines(lines: list[str]) -> str:
    collapsed: list[str] = []
    previous_blank = False
    for raw_line in lines:
        line = raw_line.rstrip()
        is_blank = not line.strip()
        if is_blank and previous_blank:
            continue
        previous_blank = is_blank
        collapsed.append(line)
    return "\n".join(collapsed).strip()


def _parse_markdown_frontmatter(raw_text: str) -> tuple[dict[str, str], str]:
    match = re.match(r"^---\n(.*?)\n---\n*", raw_text, flags=re.DOTALL)
    if not match:
        return {}, raw_text

    frontmatter: dict[str, str] = {}
    for raw_line in match.group(1).splitlines():
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        normalized_key = key.strip()
        normalized_value = value.strip().strip('"').strip("'")
        if normalized_key:
            frontmatter[normalized_key] = normalized_value

    return frontmatter, raw_text[match.end():]


def _normalize_title_text(value: str) -> str:
    title = value.strip()
    title = re.sub(r"^#{1,6}\s*", "", title)
    title = re.sub(r"\{#[^}]+\}", "", title)
    title = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", title)
    title = re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", title)
    title = _strip_html_tags(title)
    title = re.sub(r"\s+", " ", title)
    return title.strip().strip('"').strip("'")


def _repo_root_url(repo_name: str) -> str:
    # Only map repos whose checked-in lesson sources correspond to a public docs site the frontend can safely open.
    if repo_name == "ethereum/ethereum-org-website":
        return "https://ethereum.org"
    return ""


def _make_absolute_markdown_links(markdown: str, *, repo_name: str) -> str:
    # Upstream lesson markdown often uses site-relative links, but published catalog entries need fully qualified URLs for the app renderer.
    base_url = _repo_root_url(repo_name)
    if not base_url:
        return markdown

    def replace(match: re.Match[str]) -> str:
        label = match.group(1)
        href = match.group(2).strip()
        if href.startswith("/"):
            return f"[{label}]({base_url}{href})"
        return match.group(0)

    return re.sub(r"\[([^\]]+)\]\(([^)]+)\)", replace, markdown)


def clean_markdown_source(raw_text: str, *, repo_name: str = "") -> tuple[str, str, str]:
    # Convert source-only HTML tables before line-by-line cleanup so lesson markdown can preserve readable tabular structure end to end.
    frontmatter, text = _parse_markdown_frontmatter(_convert_html_tables_to_markdown(raw_text))
    lines: list[str] = []
    in_code_block = False
    in_expandable_card = False
    expandable_card_lines: list[str] = []
    expandable_card_attrs: list[str] = []
    in_doc_link = False
    doc_link_href = ""
    doc_link_lines: list[str] = []

    def flush_expandable_card() -> None:
        nonlocal expandable_card_lines, expandable_card_attrs
        if expandable_card_attrs:
            title = ""
            for attr_line in expandable_card_attrs:
                title_match = re.search(r'title="([^"]+)"', attr_line)
                if title_match:
                    title = title_match.group(1).strip()
                    break
            if title:
                lines.append(f"### {title}")
                lines.append("")
        if expandable_card_lines:
            # Preserve the learner-facing card copy while stripping the custom component wrapper that the frontend lesson renderer does not understand.
            lines.extend(expandable_card_lines)
        expandable_card_lines = []
        expandable_card_attrs = []

    def flush_doc_link() -> None:
        nonlocal doc_link_href, doc_link_lines
        if not doc_link_href:
            doc_link_lines = []
            return

        link_text = " ".join(line.strip() for line in doc_link_lines if line.strip())
        if link_text:
            # Collapse multi-line MDX link bodies into one markdown link so frontend parsing can treat them like normal prose links.
            lines.append(f"[{link_text}]({doc_link_href})")
        else:
            # Fall back to the raw href when the component had no visible label instead of silently dropping the destination.
            lines.append(doc_link_href)

        doc_link_href = ""
        doc_link_lines = []

    for raw_line in text.splitlines():
        line = raw_line
        stripped = line.strip()

        if stripped.startswith("```"):
            in_code_block = not in_code_block
            lines.append(stripped)
            continue

        if in_code_block:
            lines.append(raw_line.rstrip())
            continue

        if in_doc_link:
            if stripped.startswith("</DocLink"):
                flush_doc_link()
                in_doc_link = False
                continue
            if stripped:
                # Preserve only visible copy inside the wrapper; layout-only whitespace would create noisy markdown link labels.
                doc_link_lines.append(stripped)
            continue

        if stripped.startswith("<ExpandableCard") or in_expandable_card:
            in_expandable_card = True
            if stripped.startswith("</ExpandableCard"):
                flush_expandable_card()
                in_expandable_card = False
                continue
            if stripped == ">":
                continue
            if stripped.startswith("<ExpandableCard") or "=" in stripped:
                # Card attributes carry the title/preview metadata, so keep them separate from body copy until the closing tag arrives.
                expandable_card_attrs.append(stripped)
                continue
            expandable_card_lines.append(raw_line)
            continue

        # Drop purely visual/media components while preserving text-bearing custom components via the shared sanitizer.
        if stripped.startswith("!["):
            continue

        if stripped.startswith("<Card ") or stripped.startswith("<Card>") or stripped.startswith("<Card\t"):
            line = sanitize_display_text(stripped)
            if line:
                lines.append(line)
            continue

        doc_link = re.match(r'^<DocLink\b[^>]*href="([^"]+)"[^>]*>\s*(.*)$', stripped)
        if doc_link:
            # Some upstream lessons spread DocLink content across multiple lines, so buffer until the closing tag arrives.
            in_doc_link = True
            doc_link_href = doc_link.group(1).strip()
            trailing_text = doc_link.group(2).strip()
            if trailing_text and not trailing_text.startswith("</DocLink"):
                doc_link_lines = [trailing_text]
            else:
                doc_link_lines = []
            continue

        inline_doc_link = re.match(r'^<DocLink\b[^>]*href="([^"]+)"[^>]*>\s*(.*?)\s*</DocLink>\s*$', stripped)
        if inline_doc_link:
            # Handle the single-line form separately so inline DocLink wrappers survive even without entering buffered mode.
            doc_link_href = inline_doc_link.group(1).strip()
            doc_link_lines = [inline_doc_link.group(2).strip()]
            flush_doc_link()
            continue

        youtube_component = re.match(r'^<YouTube\s+id="([^"]+)"\s*/?>\s*$', stripped)
        if youtube_component:
            # Re-emit YouTube components as plain watch URLs because the lesson renderer already knows how to upgrade those into embeds.
            lines.append(f"https://www.youtube.com/watch?v={youtube_component.group(1).strip()}")
            continue

        if stripped.startswith("|"):
            # Keep markdown table rows intact; they need lighter cleanup than normal prose so the parser can still detect columns later.
            line = _strip_html_tags(line)
            line = re.sub(r"[ \t]+", " ", line).rstrip()
            if line.strip():
                lines.append(line)
            continue

        if re.match(r"^</?(?:CardGrid|BrowseApps|WhatAreAppsStories|ExpandableCard)\b", stripped):
            continue
        if stripped.startswith("</DocLink"):
            continue

        line = re.sub(r"\{#[^}]+\}", "", line)
        line = _strip_html_tags(line)
        line = re.sub(r"[ \t]+", " ", line).rstrip()

        if stripped.startswith("<") and not line.strip():
            continue

        lines.append(line)

    if in_expandable_card:
        flush_expandable_card()
    if in_doc_link:
        flush_doc_link()

    # Normalize repo-relative links only after all component wrappers are flattened, so emitted markdown never mixes relative and absolute forms.
    body_markdown = _make_absolute_markdown_links(_collapse_blank_lines(lines), repo_name=repo_name)
    title = _normalize_title_text(frontmatter.get("title", "")) or _extract_markdown_title(body_markdown) or "Untitled unit"
    return title, body_markdown, _markdown_to_text(body_markdown)


def _extract_markdown_title(markdown: str) -> str:
    for line in markdown.splitlines():
        stripped = line.strip()
        if re.match(r"^#{1,6}\s+", stripped):
            return _normalize_title_text(stripped)
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped:
            return _normalize_title_text(stripped)
    return ""


def _clean_inline_asciidoc(line: str) -> str:
    line = re.sub(r"\(\(\(.*?\)\)\)", "", line)
    line = re.sub(r"<<[^>,]+,([^>]+)>>", r"\1", line)
    line = re.sub(r"<<[^>]+>>", "", line)
    # Preserve destination URLs for AsciiDoc external links so frontend rich-text rendering can still open the original reference.
    line = re.sub(r"(https?://[^\s\[]+)\[([^\]]+)\]", r"[\2](\1)", line)
    line = re.sub(r"`([^`]+)`", r"\1", line)
    line = re.sub(r"\*([^*]+)\*", r"\1", line)
    line = _strip_html_tags(line)
    return re.sub(r"\s+", " ", line).strip()


def clean_asciidoc_source(raw_text: str, *, repo_name: str = "") -> tuple[str, str, str]:
    raw_text = _convert_html_tables_to_markdown(raw_text)
    lines: list[str] = []
    title = ""
    in_comment_block = False
    in_literal_block = False
    in_ditaa_block = False

    for raw_line in raw_text.splitlines():
        stripped = raw_line.strip()

        # Strip authoring-only blocks first so the Markdown projection keeps only learner-visible prose and literal snippets.
        if stripped == "////":
            in_comment_block = not in_comment_block
            continue
        if in_comment_block:
            continue

        if stripped == "@startditaa":
            in_ditaa_block = True
            continue
        if stripped == "@endditaa":
            in_ditaa_block = False
            continue
        if in_ditaa_block:
            continue

        if stripped == "----":
            lines.append("```")
            in_literal_block = not in_literal_block
            continue

        if stripped in {"++++", "===="}:
            continue
        if stripped.startswith("[[") or stripped.startswith("[role="):
            continue
        if stripped.startswith("[WARNING]") or stripped.startswith("[TIP]") or stripped.startswith("[NOTE]"):
            label = stripped[1:-1].title()
            lines.append(f"> {label}")
            continue
        if stripped.startswith(".") and not stripped.startswith(".."):
            continue
        if stripped.startswith("image::"):
            continue

        if stripped.startswith("== "):
            heading = _normalize_title_text(_clean_inline_asciidoc(stripped[3:]))
            if not title:
                title = heading
            lines.append(f"# {heading}")
            continue
        if stripped.startswith("=== "):
            lines.append(f"## {_clean_inline_asciidoc(stripped[4:])}")
            continue
        if stripped.startswith("==== "):
            lines.append(f"### {_clean_inline_asciidoc(stripped[5:])}")
            continue
        if stripped.startswith("* "):
            lines.append(f"* {_clean_inline_asciidoc(stripped[2:])}")
            continue

        cleaned = _clean_inline_asciidoc(raw_line)
        if cleaned or in_literal_block:
            lines.append(cleaned)
        else:
            lines.append("")

    body_markdown = _make_absolute_markdown_links(_collapse_blank_lines(lines), repo_name=repo_name)
    return title or "Untitled unit", body_markdown, _markdown_to_text(body_markdown)


def _markdown_to_text(markdown: str) -> str:
    text = re.sub(r"```.*?```", " ", markdown, flags=re.DOTALL)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\*\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^>\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[*_~]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_excerpt(body_text: str) -> str:
    excerpt = body_text[:280].strip()
    if len(body_text) > 280:
        excerpt = f"{excerpt.rstrip(' .,;:')}..."
    return excerpt


def _estimate_minutes(body_text: str) -> int:
    word_count = max(1, len(body_text.split()))
    return max(4, min(30, math.ceil(word_count / 180)))


def _sentence_bank(body_text: str) -> list[str]:
    # Prefer sentence-level anchors, then fall back to longer paragraphs if the source lacks clear punctuation.
    text = re.sub(r"\s+", " ", body_text)
    candidates = re.split(r"(?<=[.!?])\s+", text)
    normalized: list[str] = []
    seen: set[str] = set()

    for candidate in candidates:
        sentence = candidate.strip()
        if len(sentence) < 55:
            continue
        if sentence in seen:
            continue
        seen.add(sentence)
        normalized.append(sentence)

    if len(normalized) >= 6:
        return normalized

    paragraphs = [segment.strip() for segment in body_text.split("\n") if len(segment.strip()) >= 55]
    for paragraph in paragraphs:
        if paragraph not in seen:
            normalized.append(paragraph)
            seen.add(paragraph)
    return normalized[:12]


def _knowledge_points(body_markdown: str, *, default_context: str) -> list[KnowledgePoint]:
    # Build compact knowledge points from headings and prose so simpler fallback quiz generation still has topic-scoped facts.
    points: list[KnowledgePoint] = []
    seen: set[str] = set()
    current_context = default_context

    for raw_line in body_markdown.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue

        if re.match(r"^#{1,6}\s+", stripped):
            current_context = _normalize_title_text(stripped) or default_context
            continue

        candidate = stripped[2:].strip() if stripped.startswith("* ") else stripped
        candidate = _normalize_title_text(candidate)
        if len(candidate) < 35:
            continue

        fragments = re.split(r"(?<=[.!?])\s+", candidate)
        for fragment in fragments:
            statement = fragment.strip().rstrip(".")
            if len(statement) < 35:
                continue
            normalized_key = statement.lower()
            if normalized_key in seen:
                continue
            seen.add(normalized_key)
            points.append(KnowledgePoint(context=current_context, statement=statement))

    if points:
        return points

    fallback_points = []
    for sentence in _sentence_bank(body_markdown):
        fallback_points.append(KnowledgePoint(context=default_context, statement=sentence.rstrip(".")))
    return fallback_points


def _select_point_cycle(points: list[KnowledgePoint], *, count: int = 10) -> list[KnowledgePoint]:
    # Evenly sample across the source so fixed-length quizzes do not overfit to the first few extracted facts.
    if len(points) <= count:
        return [points[index % len(points)] for index in range(count)]

    selected: list[KnowledgePoint] = []
    seen_indexes: set[int] = set()
    for position in range(count):
        candidate_index = min(len(points) - 1, int(position * len(points) / count))
        while candidate_index in seen_indexes and candidate_index < len(points) - 1:
            candidate_index += 1
        if candidate_index in seen_indexes:
            candidate_index = next(index for index in range(len(points)) if index not in seen_indexes)
        seen_indexes.add(candidate_index)
        selected.append(points[candidate_index])
    return selected


def _option_position(seed: str) -> int:
    return int(hashlib.sha256(seed.encode("utf-8")).hexdigest(), 16) % 4


def _short_text(value: str, *, max_words: int = 12) -> str:
    words = _normalize_title_text(value).strip().rstrip(".").split()
    if len(words) <= max_words:
        return " ".join(words)
    return f"{' '.join(words[:max_words])}..."


def _answer_label(statement: str, *, max_words: int = 11) -> str:
    normalized = _normalize_title_text(statement).strip().rstrip(".")
    normalized = re.sub(r"^[A-Z][^:]{0,40}:\s*", "", normalized)
    normalized = re.sub(r"^Step \d+:\s*", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return _short_text(normalized, max_words=max_words)


def _keyword_hint(statement: str, *, max_words: int = 5) -> str:
    normalized = _normalize_title_text(statement).lower()
    words = re.findall(r"[a-z0-9']+", normalized)
    stopwords = {
        "the", "and", "for", "that", "this", "with", "your", "from", "they", "their", "into", "when", "what",
        "where", "which", "also", "have", "will", "than", "then", "them", "just", "need", "does", "make", "made",
        "more", "most", "such", "only", "over", "used", "using", "same", "like", "because", "should", "could",
        "about", "under", "after", "before", "being", "within", "there", "these", "those", "each", "many", "much",
    }
    filtered: list[str] = []
    for word in words:
        if len(word) <= 2 or word in stopwords or word.isdigit():
            continue
        if word not in filtered:
            filtered.append(word)
        if len(filtered) == max_words:
            break
    return ", ".join(filtered) if filtered else _short_text(statement, max_words=max_words)


def _split_fact_for_completion(fact: str) -> tuple[str, str]:
    normalized = _normalize_title_text(fact).strip().rstrip(".")
    separators = (", ", " because ", " so ", " and ", " but ", " that ", " which ")

    for separator in separators:
        index = normalized.find(separator)
        if 18 <= index <= len(normalized) - 18:
            prefix = normalized[:index].strip().rstrip(",;:")
            suffix = normalized[index + len(separator):].strip()
            if prefix and suffix:
                return prefix, suffix

    words = normalized.split()
    if len(words) < 8:
        return normalized, normalized

    split_index = max(4, min(len(words) - 3, len(words) // 2))
    prefix = " ".join(words[:split_index]).strip()
    suffix = " ".join(words[split_index:]).strip()
    return prefix, suffix


def _collect_distractors(
    *,
    correct_text: str,
    fact_candidates: list[str],
    misconception_candidates: list[str],
    used_texts: set[str] | None = None,
    fact_transform=lambda value: value,
) -> list[str]:
    distractors: list[str] = []
    blocked = used_texts or set()

    for candidate in fact_candidates:
        normalized = fact_transform(candidate).strip()
        if not normalized or normalized == correct_text or normalized in distractors or normalized in blocked:
            continue
        distractors.append(normalized)
        if len(distractors) == 3:
            return distractors

    for candidate in misconception_candidates:
        normalized = candidate.strip()
        if not normalized or normalized == correct_text or normalized in distractors or normalized in blocked:
            continue
        distractors.append(normalized)
        if len(distractors) == 3:
            return distractors

    if len(distractors) < 3:
        for candidate in fact_candidates:
            normalized = fact_transform(candidate).strip()
            if not normalized or normalized == correct_text or normalized in distractors:
                continue
            distractors.append(normalized)
            if len(distractors) == 3:
                return distractors

    if len(distractors) < 3:
        for candidate in misconception_candidates:
            normalized = candidate.strip()
            if not normalized or normalized == correct_text or normalized in distractors:
                continue
            distractors.append(normalized)
            if len(distractors) == 3:
                return distractors

    return distractors


def _point_summaries(points: list[KnowledgePoint], *, exclude_index: int, max_words: int = 11) -> list[str]:
    return [
        _answer_label(point.statement, max_words=max_words)
        for index, point in enumerate(points)
        if index != exclude_index
    ]


def _build_options(*, correct_text: str, distractors: list[str], option_seed: str) -> list[dict[str, Any]]:
    # Rebuild options from normalized text so later balancing can assume exactly four stable slots every time.
    option_texts = [text.strip() for text in [correct_text, *distractors] if text.strip()]
    unique_texts: list[str] = []
    for text in option_texts:
        if text not in unique_texts:
            unique_texts.append(text)

    while len(unique_texts) < 4:
        unique_texts.append(MISCONCEPTION_LIBRARY[len(unique_texts) % len(MISCONCEPTION_LIBRARY)])

    correct_index = _option_position(option_seed)
    incorrect_pool = [text for text in unique_texts if text != correct_text][:3]
    ordered_texts = incorrect_pool[:]
    ordered_texts.insert(correct_index, correct_text)

    options: list[dict[str, Any]] = []
    for index, text in enumerate(ordered_texts[:4], start=1):
        options.append(
            {
                "external_id": f"{option_seed}-o{index:02d}",
                "text": text,
                "is_correct": index - 1 == correct_index,
                "is_active": True,
            }
        )
    return options


def _build_question(
    *,
    unit_external_id: str,
    question_number: int,
    prompt: str,
    correct_text: str,
    distractors: list[str],
    explanation: str,
) -> dict[str, Any]:
    external_id = f"{unit_external_id}-q{question_number:02d}"
    return {
        "external_id": external_id,
        "text": prompt,
        "question_type": "MCQ",
        "marks": 1,
        "explanation": explanation,
        "is_active": True,
        "options": _build_options(correct_text=correct_text, distractors=distractors, option_seed=external_id),
    }


def build_quiz_questions(*, unit_external_id: str, title: str, body_markdown: str, body_text: str) -> list[dict[str, Any]]:
    try:
        questions, _ = generate_quiz_questions(
            unit_external_id=unit_external_id,
            title=title,
            body_markdown=body_markdown,
            body_text=body_text,
        )
    except QuizGenerationError as exc:
        raise CatalogGenerationError(str(exc)) from exc
    return questions


def _has_vetted_quiz_generation(previous_unit: dict[str, Any]) -> bool:
    metadata = previous_unit.get("generation_metadata") or {}
    return metadata.get("strategy") == "shared_llm_generation_v1"


def _reuse_previous_quiz(previous_unit: dict[str, Any], *, reason: str) -> tuple[dict[str, Any], dict[str, Any]]:
    quiz_payload = deepcopy(previous_unit["quiz"])
    generation_metadata = deepcopy(previous_unit.get("generation_metadata") or {})
    generation_metadata["reuse_reason"] = reason
    generation_metadata["reused_from_previous_publish"] = True
    return quiz_payload, generation_metadata


def _source_matches_previous(previous_unit: dict[str, Any], *, title: str, body_text: str) -> bool:
    previous_learning = previous_unit.get("learning") or {}
    previous_quiz = previous_unit.get("quiz") or {}
    return (
        previous_unit.get("title") == title
        and previous_learning.get("body_text") == body_text
        and isinstance(previous_quiz.get("questions"), list)
        and len(previous_quiz.get("questions", [])) == 10
    )


def build_unit_payload(
    spec: UnitSourceSpec,
    *,
    previous_unit: dict[str, Any] | None = None,
    force_refresh: bool = False,
) -> dict[str, Any]:
    source, raw_text = _fetch_source_document(spec)

    if spec.path.endswith(".adoc"):
        title, body_markdown, body_text = clean_asciidoc_source(raw_text, repo_name=spec.repo_name)
        learning_format = "asciidoc"
    else:
        title, body_markdown, body_text = clean_markdown_source(raw_text, repo_name=spec.repo_name)
        learning_format = "markdown"

    if not body_markdown or not body_text:
        raise CatalogGenerationError(f"Source body is empty for {spec.external_id}.")

    if (
        not force_refresh
        and previous_unit
        and _has_vetted_quiz_generation(previous_unit)
        and _source_matches_previous(previous_unit, title=title, body_text=body_text)
    ):
        # Reuse previously vetted quizzes when the source text is unchanged so regeneration stays cheap and deterministic.
        quiz_payload, generation_metadata = _reuse_previous_quiz(previous_unit, reason="source_unchanged")
    else:
        try:
            quiz_questions, generation_metadata = generate_quiz_questions(
                unit_external_id=spec.external_id,
                title=title,
                body_markdown=body_markdown,
                body_text=body_text,
            )
        except QuizGenerationError as exc:
            if previous_unit and previous_unit.get("quiz") and _has_vetted_quiz_generation(previous_unit):
                quiz_payload, generation_metadata = _reuse_previous_quiz(previous_unit, reason="quality_fallback")
                generation_metadata["fallback_error"] = str(exc)
            else:
                raise CatalogGenerationError(str(exc)) from exc
        else:
            quiz_payload = {
                "external_id": spec.external_id,
                "pass_mark": 7,
                "questions": quiz_questions,
            }

    # Rebalance every publish path, including reused quizzes, so long-lived content stays within the same answer-distribution policy.
    quiz_payload["questions"] = rebalance_quiz_questions(
        quiz_external_id=quiz_payload["external_id"],
        questions=quiz_payload.get("questions") or [],
    )
    quality_checks = generation_metadata.setdefault("quality_checks", [])
    if "answer_position_balanced" not in quality_checks:
        quality_checks.append("answer_position_balanced")

    excerpt = _extract_excerpt(body_text)
    return {
        "external_id": spec.external_id,
        "title": title,
        "level": spec.level,
        "order_index": spec.order_index,
        "source": source,
        "learning": {
            "format": learning_format,
            "body_markdown": body_markdown,
            "body_text": body_text,
            "excerpt": excerpt,
            "estimated_minutes": _estimate_minutes(body_text),
            "is_active": True,
        },
        "quiz": quiz_payload,
        "generation_metadata": generation_metadata,
    }


def _previous_unit_map(previous_catalog: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not isinstance(previous_catalog, dict):
        return {}
    tracks = previous_catalog.get("tracks")
    if not isinstance(tracks, list):
        return {}
    return {
        unit["external_id"]: unit
        for track in tracks
        for unit in track.get("units", [])
        if isinstance(unit, dict) and isinstance(unit.get("external_id"), str)
    }


def build_catalog_payload(
    *,
    previous_catalog: dict[str, Any] | None = None,
    force_refresh: bool = False,
    target_unit_ids: set[str] | None = None,
) -> dict[str, Any]:
    tracks: list[dict[str, Any]] = []
    previous_units = _previous_unit_map(previous_catalog)
    requested_unit_ids = set(target_unit_ids or [])
    for level in ("beginner", "intermediate", "advanced"):
        track_units: list[dict[str, Any]] = []
        for spec in UNIT_SPECS:
            if spec.level != level:
                continue
            previous_unit = previous_units.get(spec.external_id)
            if requested_unit_ids and spec.external_id not in requested_unit_ids and previous_unit:
                # Targeted regeneration keeps untouched units byte-stable by carrying forward the last published payload.
                track_units.append(deepcopy(previous_unit))
                continue
            track_units.append(
                build_unit_payload(
                    spec,
                    previous_unit=previous_unit,
                    force_refresh=force_refresh,
                )
            )
        tracks.append(
            {
                "external_id": f"track-{level}",
                "title": TRACK_LABELS[level],
                "level": level,
                "order_index": ("beginner", "intermediate", "advanced").index(level) + 1,
                "units": track_units,
            }
        )

    catalog = {
        "generated_at": timezone.now().isoformat(),
        "tracks": tracks,
    }
    _validate_catalog_shape(catalog)
    return catalog


def project_quiz_catalog(catalog: dict[str, Any]) -> dict[str, Any]:
    # Project the richer authoring catalog onto the narrower sync shape consumed by the relational quiz tables and public API.
    lessons: list[dict[str, Any]] = []
    for track in catalog["tracks"]:
        lessons.append(
            {
                "external_id": track["external_id"],
                "title": track["title"],
                "slug": slugify(track["title"]),
                "description": f"{track['title']} track",
                "is_active": True,
                "quizzes": [
                    {
                        "external_id": unit["external_id"],
                        "title": unit["title"],
                        "description": unit["learning"]["excerpt"],
                        "level": unit["level"],
                        "order_index": unit["order_index"],
                        "pass_mark": unit["quiz"]["pass_mark"],
                        "is_active": unit["learning"]["is_active"],
                        "questions": unit["quiz"]["questions"],
                    }
                    for unit in track["units"]
                ],
            }
        )

    quiz_catalog = {
        "generated_at": catalog["generated_at"],
        "lessons": lessons,
    }
    _validate_quiz_catalog_shape(quiz_catalog)
    return quiz_catalog


def _validate_catalog_shape(catalog: dict[str, Any]) -> None:
    tracks = catalog.get("tracks") or []
    if len(tracks) != 3:
        raise CatalogGenerationError("Catalog must contain exactly 3 tracks.")

    units = [unit for track in tracks for unit in track["units"]]
    questions = [question for unit in units for question in unit["quiz"]["questions"]]
    options = [option for question in questions for option in question["options"]]

    if len(units) != 21:
        raise CatalogGenerationError("Catalog must contain exactly 21 units.")
    if len({unit["external_id"] for unit in units}) != 21:
        raise CatalogGenerationError("Catalog unit external ids must be unique.")
    if len(questions) != 210:
        raise CatalogGenerationError("Catalog must contain exactly 210 questions.")
    if len(options) != 840:
        raise CatalogGenerationError("Catalog must contain exactly 840 options.")

    for unit in units:
        if unit["quiz"]["external_id"] != unit["external_id"]:
            raise CatalogGenerationError("Quiz external ids must match unit external ids.")
        if len(unit["quiz"]["questions"]) != 10:
            raise CatalogGenerationError(f"Unit {unit['external_id']} must contain 10 questions.")
        for question in unit["quiz"]["questions"]:
            if len(question["options"]) != 4:
                raise CatalogGenerationError(f"Question {question['external_id']} must contain 4 options.")
            if sum(1 for option in question["options"] if option["is_correct"]) != 1:
                raise CatalogGenerationError(f"Question {question['external_id']} must contain exactly one correct option.")
            if not question["explanation"]:
                raise CatalogGenerationError(f"Question {question['external_id']} must contain an explanation.")
        try:
            validate_quiz_answer_distribution(
                quiz_external_id=unit["quiz"]["external_id"],
                questions=unit["quiz"]["questions"],
            )
        except AnswerBalanceError as exc:
            raise CatalogGenerationError(str(exc)) from exc


def _validate_quiz_catalog_shape(quiz_catalog: dict[str, Any]) -> None:
    lessons = quiz_catalog.get("lessons") or []
    if len(lessons) != 3:
        raise CatalogGenerationError("Projected quiz catalog must contain 3 lessons.")

    quizzes = [quiz for lesson in lessons for quiz in lesson["quizzes"]]
    if len(quizzes) != 21:
        raise CatalogGenerationError("Projected quiz catalog must contain 21 quizzes.")


def _compute_version_hash(catalog: dict[str, Any], quiz_catalog: dict[str, Any]) -> str:
    encoded = json.dumps(
        {"catalog": catalog, "quiz_catalog": quiz_catalog},
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def regenerate_and_publish_catalog(
    *,
    allow_model_generation: bool = False,
    force_refresh: bool = False,
    target_unit_ids: set[str] | None = None,
) -> PublishedCatalog:
    if not allow_model_generation:
        raise CatalogRegenerationLockedError(
            "Local quiz regeneration is locked. Use the explicit manage.py regenerate_catalog command instead."
        )

    previous_catalog = get_published_catalog()
    # Publish both catalog shapes and relational rows in one transaction so every consumer observes the same version hash.
    catalog = build_catalog_payload(
        previous_catalog=previous_catalog.catalog_json if previous_catalog else None,
        force_refresh=force_refresh,
        target_unit_ids=target_unit_ids,
    )
    quiz_catalog = project_quiz_catalog(catalog)
    version_hash = _compute_version_hash(catalog, quiz_catalog)

    with transaction.atomic():
        published_catalog, _ = PublishedCatalog.objects.get_or_create(singleton_key=1)
        published_catalog.version_hash = version_hash
        published_catalog.catalog_json = catalog
        published_catalog.quiz_catalog_json = quiz_catalog
        published_catalog.published_at = timezone.now()
        published_catalog.save(update_fields=["version_hash", "catalog_json", "quiz_catalog_json", "published_at"])

        sync_quiz_catalog_payload(quiz_catalog)

    return published_catalog
