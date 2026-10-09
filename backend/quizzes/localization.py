from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
from typing import Any

from .catalog import get_static_published_catalog_path


def _localized_catalog_path(locale: str) -> Path:
    # Derive sidecar translation filenames from the canonical published catalog path so export/import stays single-sourced.
    base = get_static_published_catalog_path()
    return base.with_name(f"{base.stem}.{locale}{base.suffix}")


def _localized_catalog_mtime(locale: str) -> int | None:
    # Feed mtimes into the cache key so edited localized snapshots reload without restarting Django.
    path = _localized_catalog_path(locale)
    if not path.exists():
        return None
    return path.stat().st_mtime_ns


@lru_cache(maxsize=8)
def _load_localized_published_catalog(locale: str, catalog_mtime_ns: int | None) -> dict[str, Any] | None:
    # English reads from the primary catalog payload, so only alternate locales need a sidecar JSON snapshot.
    if locale == "en-GB":
        return None

    path = _localized_catalog_path(locale)
    if not path.exists():
        return None

    return json.loads(path.read_text(encoding="utf-8"))


def load_localized_published_catalog(locale: str) -> dict[str, Any] | None:
    # Route all callers through the mtime-aware wrapper so they share one reload policy.
    return _load_localized_published_catalog(locale, _localized_catalog_mtime(locale))


def get_localized_catalog_payload(locale: str, *, section: str) -> dict[str, Any] | None:
    # Localized snapshots mirror the published catalog sections, so views can request one slice at a time.
    payload = load_localized_published_catalog(locale)
    if not payload:
        return None

    section_payload = payload.get(section)
    return section_payload if isinstance(section_payload, dict) else None


@lru_cache(maxsize=8)
def _get_translation_index(locale: str, catalog_mtime_ns: int | None) -> dict[str, dict[str, dict[str, str] | str]]:
    # Pre-index localized quiz, lesson, question, and option copy by external id so serializers can translate in O(1).
    catalog = get_localized_catalog_payload(locale, section="catalog_json")
    if not catalog:
        return {
            "quiz": {},
            "lesson_title_by_quiz": {},
            "question": {},
            "option": {},
        }

    quiz_map: dict[str, dict[str, str]] = {}
    lesson_title_by_quiz: dict[str, str] = {}
    question_map: dict[str, dict[str, str]] = {}
    option_map: dict[str, dict[str, str]] = {}

    tracks = catalog.get("tracks")
    if not isinstance(tracks, list):
        return {
            "quiz": quiz_map,
            "lesson_title_by_quiz": lesson_title_by_quiz,
            "question": question_map,
            "option": option_map,
        }

    for track in tracks:
        if not isinstance(track, dict):
            continue
        units = track.get("units")
        if not isinstance(units, list):
            continue

        for unit in units:
            if not isinstance(unit, dict):
                continue
            unit_title = unit.get("title")
            quiz = unit.get("quiz")
            if not isinstance(quiz, dict):
                continue
            # Quiz detail/path endpoints reuse the same localized quiz metadata, so store it once here.
            quiz_external_id = quiz.get("external_id")
            if isinstance(quiz_external_id, str) and quiz_external_id:
                quiz_map[quiz_external_id] = {
                    "title": str(quiz.get("title") or ""),
                    "description": str(quiz.get("description") or ""),
                }
                if isinstance(unit_title, str) and unit_title:
                    lesson_title_by_quiz[quiz_external_id] = unit_title

            questions = quiz.get("questions")
            if not isinstance(questions, list):
                continue

            for question in questions:
                if not isinstance(question, dict):
                    continue
                # Question review and feedback both need localized stem plus explanation keyed by external id.
                question_external_id = question.get("external_id")
                if isinstance(question_external_id, str) and question_external_id:
                    question_map[question_external_id] = {
                        "text": str(question.get("text") or ""),
                        "explanation": str(question.get("explanation") or ""),
                    }

                options = question.get("options")
                if not isinstance(options, list):
                    continue
                for option in options:
                    if not isinstance(option, dict):
                        continue
                    # Option labels are looked up independently during grading/review, so keep a dedicated index.
                    option_external_id = option.get("external_id")
                    if isinstance(option_external_id, str) and option_external_id:
                        option_map[option_external_id] = {
                            "text": str(option.get("text") or ""),
                        }

    return {
        "quiz": quiz_map,
        "lesson_title_by_quiz": lesson_title_by_quiz,
        "question": question_map,
        "option": option_map,
    }


def get_translation_index(locale: str) -> dict[str, dict[str, dict[str, str] | str]]:
    # Expose the cached index behind a stable helper so callers do not care about cache invalidation mechanics.
    return _get_translation_index(locale, _localized_catalog_mtime(locale))


def get_localized_quiz_copy(locale: str, quiz_external_id: str | None) -> dict[str, str] | None:
    # Quiz copy stays optional so callers can fall back to canonical English model fields when no translation exists.
    if not quiz_external_id:
        return None
    quiz_copy = get_translation_index(locale)["quiz"].get(quiz_external_id)
    return quiz_copy if isinstance(quiz_copy, dict) else None


def get_localized_lesson_title_for_quiz(locale: str, quiz_external_id: str | None) -> str | None:
    # Lesson titles are anchored by quiz external id because quiz metadata is the stable bridge across learn and quiz views.
    if not quiz_external_id:
        return None
    title = get_translation_index(locale)["lesson_title_by_quiz"].get(quiz_external_id)
    return title if isinstance(title, str) and title else None


def get_localized_question_copy(locale: str, question_external_id: str | None) -> dict[str, str] | None:
    # Return the whole question copy bundle so callers can reuse one lookup for text plus explanation.
    if not question_external_id:
        return None
    question_copy = get_translation_index(locale)["question"].get(question_external_id)
    return question_copy if isinstance(question_copy, dict) else None


def get_localized_option_text(locale: str, option_external_id: str | None) -> str | None:
    # Option lookups only need the rendered label, so keep the public API narrow.
    if not option_external_id:
        return None
    option_copy = get_translation_index(locale)["option"].get(option_external_id)
    if not isinstance(option_copy, dict):
        return None
    text = option_copy.get("text")
    return text if isinstance(text, str) and text else None
