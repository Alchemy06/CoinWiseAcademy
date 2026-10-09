from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os
import re

from openai import OpenAI


# Keep recent turns verbatim so the assistant can respond with local conversational continuity.
# Compress older turns only when the estimated prompt budget gets too large for efficient generation.
# Return both answer text and updated summary so the frontend can stay stateless between requests.
DEFAULT_MAX_INPUT_TOKENS = int(os.getenv("CHAT_MAX_INPUT_TOKENS", "12000"))
DEFAULT_RECENT_MESSAGES = int(os.getenv("CHAT_RECENT_MESSAGE_KEEP", "8"))
DEFAULT_CHAT_MODEL = os.getenv("CHAT_MODEL", "gpt-5-mini")
DEFAULT_SUMMARY_MODEL = os.getenv("CHAT_SUMMARY_MODEL", DEFAULT_CHAT_MODEL)
DEFAULT_MAX_OUTPUT_TOKENS = int(os.getenv("CHAT_MAX_OUTPUT_TOKENS", "0"))
DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS = int(os.getenv("CHAT_SUMMARY_MAX_OUTPUT_TOKENS", "220"))
DEFAULT_REASONING_EFFORT = os.getenv("CHAT_REASONING_EFFORT", "low").strip().lower()
DEFAULT_TEXT_VERBOSITY = os.getenv("CHAT_TEXT_VERBOSITY", "low").strip().lower()
# Keep web search opt-out instead of opt-in so deployed chat instances gain live retrieval by default.
DEFAULT_WEB_SEARCH_ENABLED = os.getenv("CHAT_ENABLE_WEB_SEARCH", "1").strip().lower() not in {"0", "false", "no", "off"}
SUMMARY_MAX_CHARS = 2600
_PROMPT_CACHE: tuple[Path, int, bytes] | None = None


@dataclass
class ChatGenerationResult:
    # Plain container returned from service layer to the API view.
    assistant_message: str
    usage: dict[str, object]
    updated_summary: str
    # sources mirrors the displayed citation list so frontend can render clickable references separately.
    sources: list[dict[str, str]]


def has_openai_api_key() -> bool:
    # Credential check is reused by both view-layer fast-fail and service orchestration.
    return bool(os.getenv("OPENAI_API_KEY"))


def _repo_root() -> Path:
    # Resolve repository root from backend/chat/services.py location.
    return Path(__file__).resolve().parents[2]


def _system_prompt_path() -> Path:
    # Allow prompt-file override for tests and deployment environments.
    path = os.getenv("SYSTEM_PROMPT_PATH")
    if path:
        return Path(path)
    return _repo_root() / "backend" / "chat" / "prompts" / "system_prompt.txt"


def load_system_prompt_bytes() -> bytes:
    # Reuse prompt bytes across requests so each chat turn does not hit the filesystem again.
    global _PROMPT_CACHE

    # Capture both file path and mtime so prompt edits become visible without a process restart.
    path = _system_prompt_path()
    mtime_ns = path.stat().st_mtime_ns

    # Return cached bytes only when the exact file and modification timestamp still match.
    if _PROMPT_CACHE and _PROMPT_CACHE[0] == path and _PROMPT_CACHE[1] == mtime_ns:
        return _PROMPT_CACHE[2]

    # Replace the cache atomically so later requests see the newest prompt content immediately.
    prompt_bytes = path.read_bytes()
    _PROMPT_CACHE = (path, mtime_ns, prompt_bytes)
    return prompt_bytes


def load_system_prompt_text() -> str:
    # Decode the cached prompt bytes once callers need plain text.
    return load_system_prompt_bytes().decode("utf-8")


def _estimate_tokens_from_messages(messages: list[dict[str, str]]) -> int:
    # Use a cheap chars-to-tokens heuristic because exact tokenization is unnecessary for trimming.
    total = 0
    for message in messages:
        role = message.get("role", "")
        content = message.get("content", "")
        # Add small fixed overhead per message to approximate chat-turn framing cost in the API payload.
        total += max(1, len(content) // 4) + max(1, len(role) // 4) + 6
    return total


def _stringify_messages(messages: list[dict[str, str]]) -> str:
    # Summary prompts work with a plain transcript string instead of nested JSON.
    lines: list[str] = []
    for message in messages:
        role = message.get("role", "user").upper()
        content = message.get("content", "")
        lines.append(f"{role}: {content}")
    return "\n".join(lines)


def _extract_output_text(response: object) -> str:
    # Extract assistant text from Responses API objects across SDK variants.
    text = getattr(response, "output_text", None)
    if isinstance(text, str) and text.strip():
        return text

    output_items = getattr(response, "output", None)
    if not isinstance(output_items, list):
        return ""

    parts: list[str] = []
    for item in output_items:
        content_items = getattr(item, "content", None)
        if not isinstance(content_items, list):
            continue
        for content_item in content_items:
            maybe_text = getattr(content_item, "text", None)
            if isinstance(maybe_text, str) and maybe_text:
                parts.append(maybe_text)

    return "\n".join(parts).strip()


def _usage_to_dict(response: object) -> dict[str, object]:
    # Convert usage metadata to plain dict for safe JSON serialization.
    usage = getattr(response, "usage", None)
    if usage is None:
        return {}
    if hasattr(usage, "model_dump"):
        dumped = usage.model_dump()
        if isinstance(dumped, dict):
            return dumped
    if isinstance(usage, dict):
        return usage
    return {}


def _extract_source_url(item: object) -> str:
    # Response source items vary between direct objects and nested dict payloads across SDK versions.
    url = getattr(item, "url", None)
    if isinstance(url, str):
        # Fast path: the latest SDK exposes URL fields directly on typed source objects.
        return url
    if isinstance(item, dict):
        nested_url = item.get("url")
        if isinstance(nested_url, str):
            # Test doubles and older response shapes often arrive as plain dicts instead of typed models.
            return nested_url
    return ""


def _extract_source_title(item: object) -> str:
    # Prefer the upstream title, but tolerate responses that only return a URL.
    title = getattr(item, "title", None)
    if isinstance(title, str):
        # Typed SDK objects already normalize titles, so keep them untouched for frontend tooltips.
        return title
    if isinstance(item, dict):
        nested_title = item.get("title")
        if isinstance(nested_title, str):
            # Dict fallback keeps tests and compatibility shims from losing human-readable source labels.
            return nested_title
    return ""


def _coerce_list(value: object) -> list[object]:
    # SDK response containers usually expose plain lists, but coerce other iterables defensively.
    if isinstance(value, list):
        # Keep the helper intentionally strict so malformed response shapes fail closed instead of half-parsing.
        return value
    return []


def _collect_message_sources(response: object) -> list[dict[str, str]]:
    # Extract inline citation targets from assistant message annotations.
    output_items = getattr(response, "output", None)
    if not isinstance(output_items, list):
        return []

    sources: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    for item in output_items:
        if getattr(item, "type", None) != "message":
            # Only assistant message items can carry inline URL annotations we want to surface in the UI.
            continue

        content_items = _coerce_list(getattr(item, "content", None))
        for content_item in content_items:
            annotations = _coerce_list(getattr(content_item, "annotations", None))
            for annotation in annotations:
                # SDK shapes differ: some expose a nested `url_citation`, others flatten fields onto the item.
                annotation_type = getattr(annotation, "type", None)
                citation_payload = getattr(annotation, "url_citation", None)

                if annotation_type == "url_citation" and citation_payload is None:
                    # Flattened typed annotations can be treated as their own citation payload directly.
                    citation_payload = annotation
                if citation_payload is None and isinstance(annotation, dict):
                    nested = annotation.get("url_citation")
                    if isinstance(nested, dict):
                        # Dict annotations sometimes wrap the citation metadata one level deeper.
                        citation_payload = nested
                    elif annotation.get("type") == "url_citation":
                        # Other dict payloads flatten the same fields, so reuse the whole annotation object.
                        citation_payload = annotation

                if citation_payload is None:
                    # Ignore non-URL annotations because they do not belong in the footer source list.
                    continue

                url = _extract_source_url(citation_payload).strip()
                if not url or url in seen_urls:
                    # Deduplicate by URL so repeated citations to the same page become one footer entry.
                    continue

                seen_urls.add(url)
                sources.append(
                    {
                        "title": _extract_source_title(citation_payload).strip() or url,
                        "url": url
                    }
                )

    return sources


def _extract_message_citations(response: object) -> list[dict[str, object]]:
    # Citation ranges let us replace verbose inline URLs with compact numbered references.
    output_items = getattr(response, "output", None)
    if not isinstance(output_items, list):
        return []

    citations: list[dict[str, object]] = []

    for item in output_items:
        if getattr(item, "type", None) != "message":
            # Citation ranges are attached to message output items, not tool-call items.
            continue

        content_items = _coerce_list(getattr(item, "content", None))
        for content_item in content_items:
            annotations = _coerce_list(getattr(content_item, "annotations", None))
            for annotation in annotations:
                # Match the same annotation normalization path used for source extraction so numbering stays aligned.
                annotation_type = getattr(annotation, "type", None)
                citation_payload = getattr(annotation, "url_citation", None)

                if annotation_type == "url_citation" and citation_payload is None:
                    # Match the flattened-object case so citation replacement works across SDK variants.
                    citation_payload = annotation
                if citation_payload is None and isinstance(annotation, dict):
                    nested = annotation.get("url_citation")
                    if isinstance(nested, dict):
                        # Handle nested dict payloads from tests and compatibility fallbacks.
                        citation_payload = nested
                    elif annotation.get("type") == "url_citation":
                        # Handle flattened dict payloads without forcing test fixtures to mirror SDK classes exactly.
                        citation_payload = annotation

                if citation_payload is None:
                    # Skip annotations unrelated to URL citations, such as future metadata OpenAI may add.
                    continue

                url = _extract_source_url(citation_payload).strip()
                start_index = getattr(citation_payload, "start_index", None)
                end_index = getattr(citation_payload, "end_index", None)

                if isinstance(citation_payload, dict):
                    # Dict payloads are common in tests and older SDKs, so look up ranges manually when needed.
                    if start_index is None:
                        start_index = citation_payload.get("start_index")
                    if end_index is None:
                        end_index = citation_payload.get("end_index")

                if not url or not isinstance(start_index, int) or not isinstance(end_index, int):
                    # Range-less annotations cannot safely rewrite the assistant text, so ignore them here.
                    continue

                citations.append(
                    {
                        "url": url,
                        "title": _extract_source_title(citation_payload).strip() or url,
                        "start_index": start_index,
                        "end_index": end_index
                    }
                )

    return citations


def _collect_web_search_sources(response: object) -> list[dict[str, str]]:
    # Sources include every consulted URL, which can be richer than inline citations alone.
    output_items = getattr(response, "output", None)
    if not isinstance(output_items, list):
        return []

    sources: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    for item in output_items:
        if getattr(item, "type", None) != "web_search_call":
            # Skip normal message items because the complete consulted-source list lives on search calls only.
            continue

        action = getattr(item, "action", None)
        # The `include=["web_search_call.action.sources"]` payload can arrive as either an object or plain dict.
        action_sources = _coerce_list(getattr(action, "sources", None))
        if isinstance(action, dict):
            action_sources = _coerce_list(action.get("sources"))

        for source in action_sources:
            url = _extract_source_url(source).strip()
            if not url or url in seen_urls:
                # The same URL can appear multiple times across search/open-page actions; show it once in the footer.
                continue

            seen_urls.add(url)
            sources.append(
                {
                    "title": _extract_source_title(source).strip() or url,
                    "url": url
                }
            )

    return sources


def _extract_response_sources(response: object) -> list[dict[str, str]]:
    # Merge citation targets and full web-search sources while preserving stable order.
    merged: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    for collection in (_collect_message_sources(response), _collect_web_search_sources(response)):
        for source in collection:
            # URL identity is enough here because the chat UI only needs one clickable entry per destination.
            url = source.get("url", "").strip()
            title = source.get("title", "").strip()
            if not url or url in seen_urls:
                # Preserve first-seen ordering so marker numbers stay stable from answer text to footer list.
                continue

            seen_urls.add(url)
            merged.append({"title": title or url, "url": url})

    return merged


def _compact_web_links(text: str, response: object, sources: list[dict[str, str]]) -> str:
    # Keep citations readable in narrow chat bubbles by replacing long inline URLs with short markers.
    if not text or not sources:
        return text

    source_numbers = {
        source["url"]: index + 1
        for index, source in enumerate(sources)
        if isinstance(source.get("url"), str) and source["url"].strip()
    }
    # Numbering follows the rendered source list order so inline markers and footer links stay consistent.

    rewritten_parts: list[str] = []
    cursor = 0
    citations = sorted(
        _extract_message_citations(response),
        key=lambda citation: (int(citation["start_index"]), int(citation["end_index"]))
    )
    # Sort by text position before rewriting so replacements do not corrupt later character ranges.

    for citation in citations:
        start_index = int(citation["start_index"])
        end_index = int(citation["end_index"])
        url = str(citation["url"])

        if start_index < cursor or start_index >= end_index or start_index >= len(text):
            # Ignore overlapping or invalid spans so one bad annotation does not scramble the whole message body.
            continue

        rewritten_parts.append(text[cursor:start_index])
        marker_number = source_numbers.get(url)
        if marker_number is not None:
            # Replace the entire annotated URL span with a compact footnote-style marker like `[1]`.
            rewritten_parts.append(f"[{marker_number}]")
        # Whether replaced or skipped, advance past the annotated URL span so raw links do not leak through twice.
        cursor = min(end_index, len(text))

    rewritten_parts.append(text[cursor:])
    compacted = "".join(rewritten_parts)

    # Clean up any leftover raw URLs the model may have emitted outside formal annotation spans.
    compacted = re.sub(r"https?://\S+", "", compacted)
    # Models sometimes emit titles like `[bankofengland.co.uk]` around the same source, so strip those too.
    compacted = re.sub(r"\[\s*(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\s*\]", "", compacted)
    # Clean up punctuation left behind after URL removal so the sentence still reads naturally.
    compacted = re.sub(r"\(\s*\)", "", compacted)
    compacted = re.sub(r"（\s*）", "", compacted)
    compacted = re.sub(r"\s+\)", ")", compacted)
    compacted = re.sub(r"\s+）", "）", compacted)
    compacted = re.sub(r"\(\s+\[", "([", compacted)
    compacted = re.sub(r"（\s+\[", "（[", compacted)
    compacted = re.sub(r"\n{3,}", "\n\n", compacted)
    compacted = re.sub(r"[ \t]{2,}", " ", compacted)
    return compacted.strip()


def _sanitize_assistant_text(text: str) -> str:
    # Strip meta lead-ins so the rendered answer starts with substantive content instead of boilerplate.
    cleaned = text.strip()
    cleaned = re.sub(
        r"^\s*(short answer|quick answer|brief answer|direct answer|summary|简短回答|简答)\s*[:：-]\s*",
        "",
        cleaned,
        flags=re.IGNORECASE
    )

    lines = cleaned.splitlines()
    if lines and re.match(
        r"^\s*(short answer|quick answer|brief answer|direct answer|summary|简短回答|简答)\s*$",
        lines[0],
        flags=re.IGNORECASE
    ):
        # Drop standalone meta headings when the model emits them as a first line by themselves.
        lines = lines[1:]

    return "\n".join(lines).strip()


def _stylize_assistant_text(text: str) -> str:
    # Convert weak prose labels into markdown headings so the frontend can style sections consistently.
    label_map = {
        "simple explanation": "## Simple explanation",
        "explanation": "## Explanation",
        "why it matters": "## Why it matters",
        "main risks": "## Main risks",
        "key risks": "## Main risks",
        "risks": "## Risks",
        "takeaway": "## Takeaway",
        "what to remember": "## What to remember",
        "bottom line": "## Bottom line",
        "practical takeaway": "## Practical takeaway",
        "example": "## Example",
        "quick example": "## Example",
        "next steps": "## Next steps",
        "next step": "## Next step",
        "pros": "## Pros",
        "cons": "## Cons",
        "benefits": "## Benefits",
        "downsides": "## Downsides",
        "comparison": "## Comparison"
    }

    styled_lines: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            # Preserve intentional block spacing, but cap it later to avoid large vertical gaps.
            if styled_lines and styled_lines[-1] != "":
                styled_lines.append("")
            continue

        match = re.match(r"^([A-Za-z][A-Za-z ]{1,40})\s*:\s*(.*)$", line)
        if match:
            # Restrict rewrites to short alphabetic labels so normal colon sentences stay untouched.
            label = match.group(1).strip().lower()
            remainder = match.group(2).strip()
            heading = label_map.get(label)
            if heading:
                # Rewrite plain labels into markdown headings so the frontend can style them consistently.
                if styled_lines and styled_lines[-1] != "":
                    styled_lines.append("")
                styled_lines.append(heading)
                if remainder:
                    styled_lines.append("")
                    styled_lines.append(remainder)
                continue

        styled_lines.append(line)

    styled = "\n".join(styled_lines).strip()
    # Collapse excessive blank lines so model output never creates oversized vertical gaps in the bubble.
    styled = re.sub(r"\n{3,}", "\n\n", styled)
    return styled


def _rewrite_slash_phrases(text: str) -> str:
    # Rewrite slash-heavy prose because narrow chat columns read better with natural conjunctions.
    protected_pattern = re.compile(
        r"`[^`]*`|https?://\S+|www\.\S+|\b\d{1,2}/\d{1,2}/\d{2,4}\b|(?:\.\.?/|/)[^\s]+"
    )
    protected_segments: list[str] = []

    def protect(match: re.Match[str]) -> str:
        # Temporarily replace segments that legitimately need "/" before prose rewriting runs.
        protected_segments.append(match.group(0))
        return f"__PROTECTED_SEGMENT_{len(protected_segments) - 1}__"

    protected_text = protected_pattern.sub(protect, text)

    # Rewrite only plain alphabetic word pairs so technical strings and paths remain untouched.
    protected_text = re.sub(
        r"\b([A-Za-z][A-Za-z'-]{1,})\s*/\s*([A-Za-z][A-Za-z'-]{1,})\b",
        r"\1 or \2",
        protected_text
    )

    def restore(match: re.Match[str]) -> str:
        # Restore preserved URL/path/code segments after the prose-only replacement pass.
        index = int(match.group(1))
        return protected_segments[index]

    return re.sub(r"__PROTECTED_SEGMENT_(\d+)__", restore, protected_text)


def _is_unsupported_tuning_error(exc: Exception) -> bool:
    # API/SDK wording varies; match broad signatures for compatibility fallback.
    message = str(exc).lower()
    return (
        "unknown parameter" in message
        or "unsupported parameter" in message
        or "extra inputs are not permitted" in message
        or "invalid field" in message
    )


def _create_response(
    client: OpenAI,
    *,
    model: str,
    model_input: list[dict[str, str]],
    max_output_tokens: int | None,
    web_search_enabled: bool | None = None
) -> object:
    # Centralize Responses API calls so every generation path shares the same compatibility logic.
    request: dict[str, object] = {
        "model": model,
        "input": model_input
    }

    # Send an explicit output cap only when configured because some deployments prefer provider defaults.
    if isinstance(max_output_tokens, int) and max_output_tokens > 0:
        request["max_output_tokens"] = max_output_tokens

    # Reasoning and verbosity controls are optional because not every model variant supports them.
    if DEFAULT_REASONING_EFFORT:
        request["reasoning"] = {"effort": DEFAULT_REASONING_EFFORT}
    if DEFAULT_TEXT_VERBOSITY:
        request["text"] = {"verbosity": DEFAULT_TEXT_VERBOSITY}
    # Respect the per-request toggle without allowing it to bypass a server-side global disable.
    effective_web_search_enabled = DEFAULT_WEB_SEARCH_ENABLED if web_search_enabled is None else DEFAULT_WEB_SEARCH_ENABLED and web_search_enabled
    if effective_web_search_enabled:
        # Let the model decide when a query needs live retrieval instead of forcing a search every turn.
        request["tools"] = [{"type": "web_search"}]
        # `auto` keeps evergreen questions fast while still enabling live search for time-sensitive prompts.
        request["tool_choice"] = "auto"
        # Request the full consulted-source list so the UI can show references even when inline annotations are sparse.
        request["include"] = ["web_search_call.action.sources"]

    try:
        return client.responses.create(**request)
    except Exception as exc:  # noqa: BLE001
        if not _is_unsupported_tuning_error(exc):
            raise
        # Retry without tuning fields so older model versions can still answer instead of hard-failing.
        request.pop("reasoning", None)
        request.pop("text", None)
        return client.responses.create(**request)


def _summarize_older_messages(existing_summary: str, older_messages: list[dict[str, str]]) -> str:
    # Merge older turns into rolling memory so the frontend can avoid resending the full transcript.
    if not older_messages:
        return existing_summary

    # Convert structured turns into plain transcript text because summarization does not need UI metadata.
    transcript = _stringify_messages(older_messages)
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    summary_response = _create_response(
        client,
        model=DEFAULT_SUMMARY_MODEL,
        model_input=[
            {
                "role": "system",
                "content": (
                    "You summarize prior chat context for another assistant call. "
                    "Keep key user goals, definitions, constraints, and unresolved questions. "
                    "Be concise and factual."
                )
            },
            {
                "role": "user",
                "content": (
                    f"Existing summary:\n{existing_summary or '(none)'}\n\n"
                    f"New transcript to merge:\n{transcript}\n\n"
                    "Produce an updated summary under 1800 characters."
                )
            }
        ],
        max_output_tokens=DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS
    )

    updated = _extract_output_text(summary_response)
    if updated:
        # Hard-cap the summary so the memory artifact itself cannot become the next overflow source.
        return updated[:SUMMARY_MAX_CHARS]

    # Fall back to clipped raw text only when summarization returned no extractable output at all.
    fallback = f"{existing_summary}\n{transcript}".strip()
    return fallback[-SUMMARY_MAX_CHARS:]


def prepare_context(
    messages: list[dict[str, str]],
    summary: str,
    max_input_tokens: int = DEFAULT_MAX_INPUT_TOKENS,
    keep_recent_messages: int = DEFAULT_RECENT_MESSAGES
) -> tuple[list[dict[str, str]], str, bool]:
    # Return the turns to send, the summary to persist, and whether this request compressed history.
    # Keep the tail intact because the newest turns matter most for immediate conversational relevance.
    estimated_tokens = _estimate_tokens_from_messages(messages)
    if estimated_tokens <= max_input_tokens or len(messages) <= keep_recent_messages:
        return messages, summary, False

    # Split history at the tail so only older context is summarized away.
    older_messages = messages[:-keep_recent_messages]
    recent_messages = messages[-keep_recent_messages:]
    updated_summary = _summarize_older_messages(summary, older_messages)
    return recent_messages, updated_summary, True


def _build_input(
    system_prompt: str,
    messages: list[dict[str, str]],
    summary: str,
    user_input: str
) -> list[dict[str, str]]:
    # Assemble the final Responses API input sequence in the order the model should reason over it.
    # Order matters because summary should frame recent turns instead of overriding them.
    model_input: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]

    if summary.strip():
        # Inject long-term memory as a system message so it remains authoritative but compact.
        model_input.append(
            {
                "role": "system",
                "content": f"Conversation context summary:\n{summary.strip()}"
            }
        )

    for message in messages:
        role = message.get("role")
        content = message.get("content", "")
        if role not in {"user", "assistant"}:
            # Ignore malformed turns defensively so one bad item does not break the whole generation.
            continue
        model_input.append({"role": role, "content": content})

    # Append the newest user turn last so the model answers the current question directly.
    model_input.append({"role": "user", "content": user_input})
    return model_input


def generate_chat_reply(
    messages: list[dict[str, str]],
    summary: str,
    user_input: str,
    # None means "inherit server default"; False means "disable web search just for this turn."
    web_search_enabled: bool | None = None
) -> ChatGenerationResult:
    # Orchestrate the full generation flow because the API view should stay a thin transport wrapper.
    if not has_openai_api_key():
        raise RuntimeError("OPENAI_API_KEY is missing.")

    # Load the latest prompt file before building context so prompt edits apply to every request.
    system_prompt = load_system_prompt_text()

    # prepare_context may compress old history and return a newer summary for frontend persistence.
    prepared_messages, updated_summary, compressed = prepare_context(messages, summary)

    if not compressed:
        # Preserve caller summary exactly when no additional compression happened this round.
        updated_summary = summary

    # Create a fresh client per request so environment-driven credentials stay predictable.
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = _create_response(
        client,
        model=DEFAULT_CHAT_MODEL,
        model_input=_build_input(system_prompt, prepared_messages, updated_summary, user_input),
        max_output_tokens=DEFAULT_MAX_OUTPUT_TOKENS,
        web_search_enabled=web_search_enabled
    )

    # Extract sources once up front so text cleanup and response serialization both work from the same ordering.
    sources = _extract_response_sources(response)

    # Normalize model text in phases so cleanup rules remain explicit and easy to tune independently.
    assistant_text = _extract_output_text(response)
    # Collapse raw inline URLs before the prose-level cleanups run so citations survive later formatting passes.
    assistant_text = _compact_web_links(assistant_text, response, sources)
    assistant_text = _sanitize_assistant_text(assistant_text)
    assistant_text = _stylize_assistant_text(assistant_text)
    # Rewrite slash-heavy prose last so compact markers like `[1]` are already stable and no URLs remain to protect.
    assistant_text = _rewrite_slash_phrases(assistant_text)
    if not assistant_text:
        # Empty text is treated as a hard failure because the widget expects renderable assistant prose.
        raise RuntimeError("Empty assistant response received from OpenAI.")

    return ChatGenerationResult(
        assistant_message=assistant_text,
        # Forward usage transparently so future UI or analytics features can inspect token metadata.
        usage=_usage_to_dict(response),
        updated_summary=updated_summary,
        sources=sources
    )
