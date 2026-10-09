from __future__ import annotations

from django.db.models import Count, Max, Prefetch

from .localization import get_localized_lesson_title_for_quiz, get_localized_quiz_copy
from .catalog import bootstrap_published_catalog_from_static_snapshot, get_published_catalog_or_raise
from .models import LearnUnitCompletion, Option, Question, Quiz, QuizAttempt
from .sanitize import sanitize_display_text

LEVEL_ORDER = {
    Quiz.BEGINNER: 0,
    Quiz.INTERMEDIATE: 1,
    Quiz.ADVANCED: 2,
}


def get_supported_active_quizzes() -> list[Quiz]:
    bootstrap_published_catalog_from_static_snapshot()
    # Prefetch questions and options once so the path/dashboard endpoints can derive counts and correctness without N+1 queries.
    quizzes = list(
        Quiz.objects.filter(is_active=True, lesson__is_active=True)
        .select_related("lesson")
        .prefetch_related(
            Prefetch(
                "questions",
                queryset=Question.objects.filter(is_active=True)
                .prefetch_related(Prefetch("options", queryset=Option.objects.filter(is_active=True).order_by("id")))
                .order_by("id"),
            )
        )
    )

    supported_quizzes = []
    for quiz in quizzes:
        questions = list(quiz.questions.all())
        # The current client supports only MCQ flows, so keep partial future quiz types out of the live path for now.
        if questions and all(
            question.question_type == Question.MULTIPLE_CHOICE and len(list(question.options.all())) >= 2
            for question in questions
        ):
            supported_quizzes.append(quiz)

    # Level remains the primary ordering signal, while order_index lets each stage define its own internal sequence.
    supported_quizzes.sort(key=lambda quiz: (LEVEL_ORDER.get(quiz.level, 99), quiz.order_index, quiz.id))
    return supported_quizzes


def get_supported_active_quiz_by_id(quiz_id: int) -> Quiz | None:
    # Reuse the curated supported list so every caller sees the same visibility rules.
    for quiz in get_supported_active_quizzes():
        if quiz.id == quiz_id:
            return quiz
    return None


def get_next_quiz_id(current_quiz_id: int) -> int | None:
    quizzes = get_supported_active_quizzes()
    for index, quiz in enumerate(quizzes):
        if quiz.id == current_quiz_id:
            # Returning only the next supported live quiz keeps unlock navigation aligned with the path ordering.
            if index + 1 < len(quizzes):
                return quizzes[index + 1].id
            return None
    return None


def get_catalog_quiz_unit_map() -> dict[str, str]:
    # Read quiz-to-lesson links from the published catalog so unlock rules stay anchored to authored course structure.
    catalog = get_published_catalog_or_raise().catalog_json
    tracks = catalog.get("tracks")
    if not isinstance(tracks, list):
        return {}

    quiz_unit_map: dict[str, str] = {}
    for track in tracks:
        if not isinstance(track, dict):
            continue
        units = track.get("units")
        if not isinstance(units, list):
            continue
        for unit in units:
            if not isinstance(unit, dict):
                continue
            unit_external_id = unit.get("external_id")
            quiz = unit.get("quiz")
            if not isinstance(unit_external_id, str) or not unit_external_id:
                continue
            if not isinstance(quiz, dict):
                continue
            quiz_external_id = quiz.get("external_id")
            if isinstance(quiz_external_id, str) and quiz_external_id:
                quiz_unit_map[quiz_external_id] = unit_external_id

    return quiz_unit_map


def get_unlocked_quiz_external_ids(*, user) -> set[str]:
    # Convert completed learn units into quiz ids once so every later unlock check can stay set-based and deterministic.
    completed_unit_ids = set(get_completed_unit_external_ids(user=user))
    if not completed_unit_ids:
        return set()

    quiz_unit_map = get_catalog_quiz_unit_map()
    return {
        quiz_external_id
        for quiz_external_id, unit_external_id in quiz_unit_map.items()
        if unit_external_id in completed_unit_ids
    }


def is_quiz_unlocked_for_user(
    *,
    user,
    quiz: Quiz,
    unlocked_quiz_external_ids: set[str] | None = None,
    quiz_unit_map: dict[str, str] | None = None,
) -> bool:
    # If the quiz is not mapped in the current catalog, fail open so legacy or partially synced content stays reachable.
    if not quiz.external_id:
        return True

    quiz_unit_map = quiz_unit_map or get_catalog_quiz_unit_map()
    if quiz.external_id not in quiz_unit_map:
        return True

    if unlocked_quiz_external_ids is None:
        unlocked_quiz_external_ids = get_unlocked_quiz_external_ids(user=user)

    return quiz.external_id in unlocked_quiz_external_ids


def build_quiz_path_payload(*, user, locale: str = "en-GB") -> dict[str, object]:
    quizzes = get_supported_active_quizzes()
    # Reuse the sorted quiz id list across aggregation and recommendation queries so both phases operate on the same ordering.
    quiz_ids = [quiz.id for quiz in quizzes]
    quiz_unit_map = get_catalog_quiz_unit_map()
    unlocked_quiz_external_ids = get_unlocked_quiz_external_ids(user=user)
    # Aggregate once in SQL so each quiz row can be decorated with best-score progress without per-quiz lookups.
    attempt_rows = QuizAttempt.objects.filter(user=user, quiz_id__in=quiz_ids).values("quiz_id").annotate(
        best_score=Max("total_score"),
        attempt_count=Count("id")
    )
    attempts_by_quiz_id = {
        row["quiz_id"]: {
            "best_score": float(row["best_score"]) if row["best_score"] is not None else None,
            "attempt_count": row["attempt_count"],
        }
        for row in attempt_rows
    }

    path_items: list[dict[str, object]] = []
    # Keep the serialized payload rows indexable by quiz id so later recommendation rules can reuse the authoritative path state.
    path_items_by_quiz_id: dict[int, dict[str, object]] = {}

    for quiz in quizzes:
        questions = list(quiz.questions.all())
        max_score = sum(question.marks for question in questions)
        attempt_summary = attempts_by_quiz_id.get(quiz.id, {"best_score": None, "attempt_count": 0})
        best_score = attempt_summary["best_score"]
        attempt_count = attempt_summary["attempt_count"]
        is_passed = best_score is not None and best_score >= quiz.pass_mark
        is_locked = not is_quiz_unlocked_for_user(
            user=user,
            quiz=quiz,
            unlocked_quiz_external_ids=unlocked_quiz_external_ids,
            quiz_unit_map=quiz_unit_map,
        )

        if is_locked:
            status = "locked"
        elif is_passed:
            status = "passed"
        elif attempt_count > 0:
            status = "retry"
        else:
            status = "ready"

        localized_quiz_copy = get_localized_quiz_copy(locale, quiz.external_id) or {}
        localized_lesson_title = get_localized_lesson_title_for_quiz(locale, quiz.external_id)
        path_item = {
            "id": quiz.id,
            "externalId": quiz.external_id,
            "lessonTitle": sanitize_display_text(localized_lesson_title or quiz.lesson.title),
            "title": sanitize_display_text(localized_quiz_copy.get("title") or localized_lesson_title or quiz.title),
            "description": sanitize_display_text(localized_quiz_copy.get("description") or quiz.description),
            "level": quiz.level,
            "orderIndex": quiz.order_index,
            "passMark": quiz.pass_mark,
            "questionCount": len(questions),
            "maxScore": max_score,
            "bestScore": best_score,
            "attemptCount": attempt_count,
            "isLocked": is_locked,
            "isPassed": is_passed,
            "status": status,
        }
        path_items.append(path_item)
        path_items_by_quiz_id[quiz.id] = path_item

    recommended_quiz_id: int | None = None
    # Recommendation follows the learner's most recent completed attempt instead of pinning forever to the earliest retry.
    latest_attempt = (
        QuizAttempt.objects.filter(user=user, quiz_id__in=quiz_ids, completed_at__isnull=False)
        .select_related("quiz")
        .order_by("-completed_at", "-id")
        .first()
    )
    # Precompute the next live quiz in path order so pass outcomes can advance without re-scanning the whole list repeatedly.
    next_quiz_by_id: dict[int, int | None] = {
        quiz.id: quizzes[index + 1].id if index + 1 < len(quizzes) else None
        for index, quiz in enumerate(quizzes)
    }

    if latest_attempt is not None:
        latest_path_item = path_items_by_quiz_id.get(latest_attempt.quiz_id)
        latest_attempt_passed = latest_attempt.total_score >= latest_attempt.quiz.pass_mark

        if latest_path_item is not None and not latest_path_item["isLocked"]:
            if not latest_attempt_passed:
                recommended_quiz_id = latest_attempt.quiz_id
            else:
                next_quiz_id = next_quiz_by_id.get(latest_attempt.quiz_id)
                if next_quiz_id is not None:
                    next_path_item = path_items_by_quiz_id.get(next_quiz_id)
                    if next_path_item is not None and not next_path_item["isLocked"]:
                        recommended_quiz_id = next_quiz_id

    if recommended_quiz_id is None:
        # Passing the final quiz should send the learner back to the earliest unresolved retry before declaring the path complete.
        for item in path_items:
            if item["status"] == "retry":
                recommended_quiz_id = item["id"]
                break

    return {
        "quizzes": path_items,
        "recommendedQuizId": recommended_quiz_id,
        "completedCount": sum(1 for item in path_items if item["isPassed"]),
        "totalCount": len(path_items),
    }


def get_catalog_unit_external_ids() -> set[str]:
    # Read unit ids from the published catalog snapshot so progress validation stays aligned with the learn page source data.
    catalog = get_published_catalog_or_raise().catalog_json
    tracks = catalog.get("tracks")
    if not isinstance(tracks, list):
        return set()

    unit_ids: set[str] = set()
    for track in tracks:
        # Ignore malformed track rows instead of failing the whole endpoint on one bad publish entry.
        if not isinstance(track, dict):
            continue
        units = track.get("units")
        if not isinstance(units, list):
            continue
        for unit in units:
            if not isinstance(unit, dict):
                continue
            external_id = unit.get("external_id")
            # External ids are the stable join key between published content and per-user completion records.
            if isinstance(external_id, str) and external_id:
                unit_ids.add(external_id)

    return unit_ids


def get_completed_unit_external_ids(*, user) -> list[str]:
    # Preserve completion order so the client sees a deterministic sequence when reconciling repeated writes.
    return list(
        LearnUnitCompletion.objects.filter(user=user)
        .order_by("completed_at", "id")
        .values_list("unit_external_id", flat=True)
    )
