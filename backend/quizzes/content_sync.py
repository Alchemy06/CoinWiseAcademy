from __future__ import annotations

import hashlib
import json
import logging
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import transaction
from django.template.defaultfilters import slugify
from django.utils import timezone

from .models import Lesson, Option, Question, Quiz, QuizCatalogSyncState
from .sanitize import sanitize_display_text

logger = logging.getLogger(__name__)


class QuizCatalogSyncError(RuntimeError):
    """Raised when the upstream quiz catalog cannot be fetched or normalized."""


def get_quiz_catalog_sync_state() -> QuizCatalogSyncState:
    # A singleton row keeps sync bookkeeping durable without introducing a separate settings table.
    state, _ = QuizCatalogSyncState.objects.get_or_create(singleton_key=1)
    return state


def _normalize_text(value: Any, *, field_name: str) -> str:
    # Normalize through the shared sanitizer first so imported content cannot bypass UI-facing artifact cleanup.
    normalized = sanitize_display_text(value) if isinstance(value, str) else ""
    if not normalized:
        raise QuizCatalogSyncError(f"Missing required text field: {field_name}.")
    return normalized


def _normalize_optional_text(value: Any) -> str:
    return sanitize_display_text(value) if isinstance(value, str) else ""


def _normalize_bool(value: Any, *, default: bool = True) -> bool:
    return value if isinstance(value, bool) else default


def _normalize_int(value: Any, *, field_name: str, default: int = 0, minimum: int = 0) -> int:
    if value in (None, ""):
        return default

    if not isinstance(value, int) or isinstance(value, bool):
        raise QuizCatalogSyncError(f"Invalid integer field: {field_name}.")

    return max(minimum, value)


def _normalize_level(value: Any) -> str:
    if value == Quiz.INTERMEDIATE:
        return Quiz.INTERMEDIATE
    if value == Quiz.ADVANCED:
        return Quiz.ADVANCED
    return Quiz.BEGINNER


def _normalize_question_type(value: Any) -> str | None:
    if value == Question.MULTIPLE_CHOICE or value == "MCQ":
        return Question.MULTIPLE_CHOICE
    return None


def _normalize_slug(record: dict[str, Any], *, fallback_text: str, external_id: str) -> str:
    raw_slug = _normalize_optional_text(record.get("slug"))
    slug_value = slugify(raw_slug or fallback_text or external_id)
    if slug_value:
        return slug_value
    return f"lesson-{external_id.lower()}"


def _normalize_option(record: Any, *, question_external_id: str) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise QuizCatalogSyncError(f"Option payload for question {question_external_id} must be an object.")

    external_id = _normalize_text(record.get("external_id") or record.get("externalId"), field_name="option.external_id")
    return {
        "external_id": external_id,
        "text": _normalize_text(record.get("text"), field_name=f"option.text[{external_id}]"),
        "is_correct": _normalize_bool(record.get("is_correct") if "is_correct" in record else record.get("isCorrect"), default=False),
        "is_active": _normalize_bool(record.get("is_active") if "is_active" in record else record.get("isActive"), default=True),
    }


def _normalize_question(record: Any, *, quiz_external_id: str) -> dict[str, Any] | None:
    if not isinstance(record, dict):
        raise QuizCatalogSyncError(f"Question payload for quiz {quiz_external_id} must be an object.")

    external_id = _normalize_text(record.get("external_id") or record.get("externalId"), field_name="question.external_id")
    question_type = _normalize_question_type(record.get("question_type") or record.get("questionType"))
    if question_type is None:
        logger.warning("Skipping unsupported quiz question type for %s.", external_id)
        return None

    options = [
        normalized_option
        for option in (record.get("options") or [])
        if (normalized_option := _normalize_option(option, question_external_id=external_id))
    ]
    # Skip malformed questions instead of failing the whole catalog, because upstream content can occasionally contain partial draft data.
    active_options = [option for option in options if option["is_active"]]
    if len(active_options) < 2:
        logger.warning("Skipping question %s because it has fewer than two active options.", external_id)
        return None
    if sum(1 for option in active_options if option["is_correct"]) != 1:
        logger.warning("Skipping question %s because it must have exactly one active correct option.", external_id)
        return None

    return {
        "external_id": external_id,
        "text": _normalize_text(record.get("text"), field_name=f"question.text[{external_id}]"),
        "question_type": question_type,
        "marks": _normalize_int(record.get("marks"), field_name=f"question.marks[{external_id}]", default=1, minimum=1),
        "explanation": _normalize_optional_text(record.get("explanation")),
        "is_active": _normalize_bool(record.get("is_active") if "is_active" in record else record.get("isActive"), default=True),
        "options": options,
    }


def _normalize_quiz(record: Any, *, lesson_external_id: str) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise QuizCatalogSyncError(f"Quiz payload for lesson {lesson_external_id} must be an object.")

    external_id = _normalize_text(record.get("external_id") or record.get("externalId"), field_name="quiz.external_id")
    questions = [
        normalized_question
        for question in (record.get("questions") or [])
        if (normalized_question := _normalize_question(question, quiz_external_id=external_id))
    ]

    return {
        "external_id": external_id,
        "title": _normalize_text(record.get("title"), field_name=f"quiz.title[{external_id}]"),
        "description": _normalize_optional_text(record.get("description")),
        "level": _normalize_level(record.get("level")),
        "order_index": _normalize_int(record.get("order_index") if "order_index" in record else record.get("orderIndex"), field_name=f"quiz.order_index[{external_id}]"),
        "pass_mark": _normalize_int(record.get("pass_mark") if "pass_mark" in record else record.get("passMark"), field_name=f"quiz.pass_mark[{external_id}]", default=1, minimum=1),
        "is_active": _normalize_bool(record.get("is_active") if "is_active" in record else record.get("isActive"), default=True),
        "questions": questions,
    }


def _normalize_lesson(record: Any) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise QuizCatalogSyncError("Lesson payload must be an object.")

    external_id = _normalize_text(record.get("external_id") or record.get("externalId"), field_name="lesson.external_id")
    title = _normalize_text(record.get("title"), field_name=f"lesson.title[{external_id}]")
    quizzes = [_normalize_quiz(quiz, lesson_external_id=external_id) for quiz in (record.get("quizzes") or [])]

    return {
        "external_id": external_id,
        "title": title,
        "slug": _normalize_slug(record, fallback_text=title, external_id=external_id),
        "description": _normalize_optional_text(record.get("description")),
        "is_active": _normalize_bool(record.get("is_active") if "is_active" in record else record.get("isActive"), default=True),
        "quizzes": quizzes,
    }


def _normalize_catalog(payload: Any) -> dict[str, Any]:
    # Accept either a raw lessons array or a wrapped object so the sync endpoint can evolve without breaking consumers.
    lessons_payload = payload if isinstance(payload, list) else payload.get("lessons")
    if not isinstance(lessons_payload, list):
        raise QuizCatalogSyncError("Quiz catalog payload must include a lessons array.")

    return {
        "lessons": [_normalize_lesson(lesson) for lesson in lessons_payload],
    }


def _build_catalog_request() -> Request:
    if not settings.QUIZ_CONTENT_API_BASE_URL:
        raise QuizCatalogSyncError("QUIZ_CONTENT_API_BASE_URL is missing.")

    # Keep the request lightweight and explicit so upstream debugging can identify this sync traffic quickly.
    headers = {
        "Accept": "application/json",
        "User-Agent": "team-la-mesa-quiz-sync/1.0",
    }
    if settings.QUIZ_CONTENT_API_TOKEN:
        headers["Authorization"] = f"Bearer {settings.QUIZ_CONTENT_API_TOKEN}"

    return Request(settings.QUIZ_CONTENT_API_BASE_URL, headers=headers, method="GET")


def fetch_quiz_catalog() -> dict[str, Any]:
    request = _build_catalog_request()

    try:
        # Fetch and normalize in one place so every sync path shares the same validation rules.
        with urlopen(request, timeout=settings.QUIZ_CONTENT_REQUEST_TIMEOUT_SECONDS) as response:
            status_code = getattr(response, "status", 200)
            if status_code != 200:
                raise QuizCatalogSyncError(f"Quiz content API returned status {status_code}.")
            payload = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise QuizCatalogSyncError("Unable to fetch quiz catalog from the upstream API.") from exc

    return _normalize_catalog(payload)


def _compute_payload_hash(catalog: dict[str, Any]) -> str:
    # Hash the normalized payload so TTL checks and audit metadata ignore irrelevant JSON formatting differences.
    encoded = json.dumps(catalog, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _deactivate_missing_content(*, lesson_ids: set[int], quiz_ids: set[int], question_ids: set[int], option_ids: set[int]) -> None:
    # Sync is authoritative, so content missing from the latest payload becomes inactive rather than lingering as live content.
    lesson_queryset = Lesson.objects.all()
    quiz_queryset = Quiz.objects.all()
    question_queryset = Question.objects.all()
    option_queryset = Option.objects.all()

    if lesson_ids:
        lesson_queryset.exclude(id__in=lesson_ids).update(is_active=False)
    else:
        lesson_queryset.update(is_active=False)

    if quiz_ids:
        quiz_queryset.exclude(id__in=quiz_ids).update(is_active=False)
    else:
        quiz_queryset.update(is_active=False)

    if question_ids:
        question_queryset.exclude(id__in=question_ids).update(is_active=False)
    else:
        question_queryset.update(is_active=False)

    if option_ids:
        option_queryset.exclude(id__in=option_ids).update(is_active=False)
    else:
        option_queryset.update(is_active=False)


def sync_quiz_catalog_payload(catalog: dict[str, Any]) -> str:
    payload_hash = _compute_payload_hash(catalog)

    with transaction.atomic():
        # Track every row touched during this sync so we can soft-deactivate anything omitted from the newest payload.
        seen_lesson_ids: set[int] = set()
        seen_quiz_ids: set[int] = set()
        seen_question_ids: set[int] = set()
        seen_option_ids: set[int] = set()

        for lesson_data in catalog["lessons"]:
            lesson, _ = Lesson.objects.get_or_create(
                external_id=lesson_data["external_id"],
                defaults={
                    "title": lesson_data["title"],
                    "slug": lesson_data["slug"],
                    "description": lesson_data["description"],
                    "is_active": lesson_data["is_active"],
                },
            )
            lesson.title = lesson_data["title"]
            lesson.slug = lesson_data["slug"]
            lesson.description = lesson_data["description"]
            lesson.is_active = lesson_data["is_active"]
            lesson.save(update_fields=["title", "slug", "description", "is_active"])
            seen_lesson_ids.add(lesson.id)

            for quiz_data in lesson_data["quizzes"]:
                # Upsert by external_id so published snapshots and live API syncs converge on the same rows.
                quiz, _ = Quiz.objects.get_or_create(
                    external_id=quiz_data["external_id"],
                    defaults={
                        "lesson": lesson,
                        "title": quiz_data["title"],
                        "description": quiz_data["description"],
                        "level": quiz_data["level"],
                        "order_index": quiz_data["order_index"],
                        "pass_mark": quiz_data["pass_mark"],
                        "is_active": quiz_data["is_active"],
                    },
                )
                quiz.lesson = lesson
                quiz.title = quiz_data["title"]
                quiz.description = quiz_data["description"]
                quiz.level = quiz_data["level"]
                quiz.order_index = quiz_data["order_index"]
                quiz.pass_mark = quiz_data["pass_mark"]
                quiz.is_active = lesson.is_active and quiz_data["is_active"]
                quiz.save(update_fields=["lesson", "title", "description", "level", "order_index", "pass_mark", "is_active"])
                seen_quiz_ids.add(quiz.id)

                for question_data in quiz_data["questions"]:
                    # Propagate parent active-state downward so a disabled lesson/quiz cannot leak active children.
                    question, _ = Question.objects.get_or_create(
                        external_id=question_data["external_id"],
                        defaults={
                            "quiz": quiz,
                            "text": question_data["text"],
                            "question_type": question_data["question_type"],
                            "marks": question_data["marks"],
                            "explanation": question_data["explanation"],
                            "is_active": question_data["is_active"],
                        },
                    )
                    question.quiz = quiz
                    question.text = question_data["text"]
                    question.question_type = question_data["question_type"]
                    question.marks = question_data["marks"]
                    question.explanation = question_data["explanation"]
                    question.is_active = quiz.is_active and question_data["is_active"]
                    question.save(update_fields=["quiz", "text", "question_type", "marks", "explanation", "is_active"])
                    seen_question_ids.add(question.id)

                    for option_data in question_data["options"]:
                        option, _ = Option.objects.get_or_create(
                            external_id=option_data["external_id"],
                            defaults={
                                "question": question,
                                "text": option_data["text"],
                                "is_correct": option_data["is_correct"],
                                "is_active": option_data["is_active"],
                            },
                        )
                        option.question = question
                        option.text = option_data["text"]
                        option.is_correct = option_data["is_correct"]
                        option.is_active = question.is_active and option_data["is_active"]
                        option.save(update_fields=["question", "text", "is_correct", "is_active"])
                        seen_option_ids.add(option.id)

        _deactivate_missing_content(
            lesson_ids=seen_lesson_ids,
            quiz_ids=seen_quiz_ids,
            question_ids=seen_question_ids,
            option_ids=seen_option_ids,
        )

    return payload_hash


def sync_quiz_catalog(*, force: bool = False) -> bool:
    del force  # Force is accepted for a stable call signature shared with maybe_sync_quiz_catalog.
    state = get_quiz_catalog_sync_state()
    # Record attempts before doing network work so operators can tell whether sync is being triggered at all.
    state.last_attempted_at = timezone.now()
    state.save(update_fields=["last_attempted_at"])

    try:
        catalog = fetch_quiz_catalog()
        payload_hash = sync_quiz_catalog_payload(catalog)
        state.last_successful_at = timezone.now()
        state.last_error = ""
        state.last_payload_hash = payload_hash
        state.save(update_fields=["last_successful_at", "last_error", "last_payload_hash"])
    except Exception as exc:
        # Persist the latest failure message for admin inspection, then re-raise so callers can choose strict vs best-effort behavior.
        state.last_error = str(exc)
        state.save(update_fields=["last_error"])
        raise

    return True


def maybe_sync_quiz_catalog(*, force: bool = False) -> bool:
    if not settings.QUIZ_CONTENT_API_BASE_URL:
        return False

    if force:
        try:
            return sync_quiz_catalog(force=True)
        except Exception:
            logger.exception("Quiz catalog sync failed during forced execution.")
            return False

    state = get_quiz_catalog_sync_state()
    last_successful_at = state.last_successful_at
    ttl_seconds = max(0, settings.QUIZ_CONTENT_SYNC_TTL_SECONDS)

    if last_successful_at is not None:
        # TTL gating keeps login/page-triggered sync hooks cheap while still letting the catalog refresh on a bounded cadence.
        age_seconds = (timezone.now() - last_successful_at).total_seconds()
        if age_seconds < ttl_seconds:
            return False

    try:
        return sync_quiz_catalog(force=False)
    except Exception:
        logger.exception("Quiz catalog sync failed during TTL-based execution.")
        return False
