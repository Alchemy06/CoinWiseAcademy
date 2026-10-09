from __future__ import annotations

from copy import deepcopy
import hashlib
import re
from typing import Any


class AnswerBalanceError(RuntimeError):
    """Raised when a quiz payload cannot be rebalanced safely."""


def _stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _option_slot_index(option: dict[str, Any], *, fallback_index: int) -> int:
    external_id = str(option.get("external_id") or option.get("externalId") or "")
    match = re.search(r"-o(\d+)$", external_id)
    if match:
        return max(0, int(match.group(1)) - 1)
    return fallback_index


def _ordered_question_options(question: dict[str, Any]) -> list[dict[str, Any]]:
    # Sort by external-id slot first so rebalancing preserves canonical option positions across repeated publishes.
    options = list(question.get("options") or [])
    ordered = sorted(
        enumerate(options),
        key=lambda item: _option_slot_index(item[1], fallback_index=item[0]),
    )
    ordered_options = [option for _, option in ordered]
    if len(ordered_options) != 4:
        raise AnswerBalanceError(f"Question {question.get('external_id') or '<unknown>'} must contain exactly four options.")
    if sum(1 for option in ordered_options if option.get("is_correct")) != 1:
        raise AnswerBalanceError(
            f"Question {question.get('external_id') or '<unknown>'} must contain exactly one correct option."
        )
    return ordered_options


def get_correct_position_counts(questions: list[dict[str, Any]]) -> tuple[int, int, int, int]:
    counts = [0, 0, 0, 0]
    for question in questions:
        options = _ordered_question_options(question)
        correct_index = next(index for index, option in enumerate(options) if option.get("is_correct"))
        counts[correct_index] += 1
    return tuple(counts)


def validate_quiz_answer_distribution(*, quiz_external_id: str, questions: list[dict[str, Any]]) -> None:
    # Once a quiz is large enough, every answer slot should appear and the distribution should stay nearly even.
    counts = get_correct_position_counts(questions)
    if len(questions) >= 4 and any(count == 0 for count in counts):
        raise AnswerBalanceError(f"Quiz {quiz_external_id} must cover all four answer positions.")
    if max(counts) - min(counts) > 1:
        raise AnswerBalanceError(
            f"Quiz {quiz_external_id} answer positions are imbalanced: {counts!r}."
        )


def _position_counts(*, quiz_external_id: str, question_count: int) -> list[int]:
    # Spread any remainder deterministically so the same quiz id always yields the same target answer distribution.
    base_count = question_count // 4
    counts = [base_count, base_count, base_count, base_count]
    remainder = question_count % 4
    positions = sorted(range(4), key=lambda index: _stable_hash(f"{quiz_external_id}:count:{index}"))
    for position in positions[:remainder]:
        counts[position] += 1
    return counts


def _target_positions(*, quiz_external_id: str, questions: list[dict[str, Any]]) -> list[int]:
    counts = _position_counts(quiz_external_id=quiz_external_id, question_count=len(questions))
    # Shuffle the desired positions deterministically so balanced answers do not fall into an obvious repeating pattern.
    tokens = [
        (position, occurrence)
        for position, count in enumerate(counts)
        for occurrence in range(count)
    ]
    ordered_tokens = sorted(tokens, key=lambda token: _stable_hash(f"{quiz_external_id}:token:{token[0]}:{token[1]}"))
    return [position for position, _ in ordered_tokens]


def rebalance_question_options(*, question: dict[str, Any], target_correct_index: int) -> dict[str, Any]:
    if not 0 <= target_correct_index <= 3:
        raise AnswerBalanceError("Target correct index must be between 0 and 3.")

    rebalanced_question = deepcopy(question)
    ordered_slots = _ordered_question_options(rebalanced_question)
    correct_option = next(option for option in ordered_slots if option.get("is_correct"))
    incorrect_options = [option for option in ordered_slots if not option.get("is_correct")]

    # Preserve the slot containers and rewrite only their contents, which keeps option external ids stable for downstream diffs.
    desired_contents = incorrect_options[:]
    desired_contents.insert(target_correct_index, correct_option)

    rewritten_options: list[dict[str, Any]] = []
    for slot_index, slot in enumerate(ordered_slots):
        desired = desired_contents[slot_index]
        rewritten_option = deepcopy(slot)
        rewritten_option["text"] = desired.get("text", "")
        rewritten_option["is_correct"] = slot_index == target_correct_index
        rewritten_option["is_active"] = bool(desired.get("is_active", True))
        rewritten_options.append(rewritten_option)

    rebalanced_question["options"] = rewritten_options
    return rebalanced_question


def rebalance_quiz_questions(*, quiz_external_id: str, questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not questions:
        return []

    target_positions = _target_positions(quiz_external_id=quiz_external_id, questions=questions)
    rebalanced_questions = [
        rebalance_question_options(question=question, target_correct_index=target_positions[index])
        for index, question in enumerate(questions)
    ]
    validate_quiz_answer_distribution(quiz_external_id=quiz_external_id, questions=rebalanced_questions)
    return rebalanced_questions


def rebalance_catalog_payload(catalog: dict[str, Any]) -> dict[str, Any]:
    rebalanced_catalog = deepcopy(catalog)
    for track in rebalanced_catalog.get("tracks") or []:
        for unit in track.get("units") or []:
            quiz = unit.get("quiz") or {}
            quiz_external_id = str(quiz.get("external_id") or unit.get("external_id") or "")
            # Rebalance in-place on the published catalog shape so the command can repair answer positions without regenerating content.
            quiz["questions"] = rebalance_quiz_questions(
                quiz_external_id=quiz_external_id,
                questions=list(quiz.get("questions") or []),
            )
            metadata = unit.setdefault("generation_metadata", {})
            quality_checks = metadata.setdefault("quality_checks", [])
            if "answer_position_balanced" not in quality_checks:
                quality_checks.append("answer_position_balanced")
    return rebalanced_catalog
