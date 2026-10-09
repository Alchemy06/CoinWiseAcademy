from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any

from django.conf import settings
from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError

from .answer_balance import rebalance_quiz_questions
from .sanitize import sanitize_display_text


class QuizGenerationError(RuntimeError):
    """Raised when quiz generation cannot produce a publishable result."""


@dataclass(frozen=True)
class ConceptCard:
    context: str
    concept: str
    mechanism: str
    risk: str
    misconception: str
    scenario: str
    source_excerpt: str


class Competency(str, Enum):
    CORE_DEFINITION = "core_definition"
    KEY_MECHANISM = "key_mechanism"
    PROCESS_STEP = "process_step"
    RISK_IDENTIFICATION = "risk_identification"
    MISCONCEPTION_SPOTTING = "misconception_spotting"
    SCENARIO_JUDGEMENT = "scenario_judgement"
    COMPARISON = "comparison"
    CAUSE_AND_EFFECT = "cause_and_effect"
    SECURITY_PRACTICE = "security_practice"
    SYNTHESIS = "synthesis"


COMPETENCY_SLOTS: tuple[Competency, ...] = (
    # Keep the ten slots fixed so regenerated quizzes stay comparable across runs and across source units.
    Competency.CORE_DEFINITION,
    Competency.KEY_MECHANISM,
    Competency.PROCESS_STEP,
    Competency.RISK_IDENTIFICATION,
    Competency.MISCONCEPTION_SPOTTING,
    Competency.SCENARIO_JUDGEMENT,
    Competency.COMPARISON,
    Competency.CAUSE_AND_EFFECT,
    Competency.SECURITY_PRACTICE,
    Competency.SYNTHESIS,
)

COMPETENCY_PROMPTS: dict[Competency, str] = {
    Competency.CORE_DEFINITION: "Test whether the learner can identify the central definition or idea.",
    Competency.KEY_MECHANISM: "Test how the underlying mechanism works, not just its label.",
    Competency.PROCESS_STEP: "Test a key sequence, workflow, or operational step described in the source.",
    Competency.RISK_IDENTIFICATION: "Test whether the learner can identify the main risk, limitation, or failure mode.",
    Competency.MISCONCEPTION_SPOTTING: "Test whether the learner can reject a realistic misconception using source evidence.",
    Competency.SCENARIO_JUDGEMENT: "Test how the learner should respond in a realistic scenario based on the source.",
    Competency.COMPARISON: "Test whether the learner can distinguish the target concept from a nearby but different idea.",
    Competency.CAUSE_AND_EFFECT: "Test a cause, consequence, or dependency stated in the source.",
    Competency.SECURITY_PRACTICE: "Test a concrete safety or verification practice the source recommends.",
    Competency.SYNTHESIS: "Test whether the learner can combine multiple source points into one correct judgement.",
}

GENERIC_DISTRACTOR_PATTERNS = (
    "guarantees profits",
    "no trade-offs",
    "no need for verification",
    "single central authority approves every step",
    "used safely without understanding",
    "irreversible and risk-free",
    "all of the above",
    "none of the above",
)
QUESTION_BAN_PATTERNS = (
    r"\.\.\.",
    r"complete this idea",
    r"say next",
    r"best matches the part",
    r"explicitly mentioned",
    r"come away with which conclusion",
)
MARKUP_ARTIFACT_PATTERNS = (
    r"<[A-Za-z]",
    r"\b(?:emoji|description|title|className|visible)=",
    r"\|\s*[^|]+\s*\|",
)
CARD_LIMIT = 8


class GeneratedQuestionDraft(BaseModel):
    competency: Competency
    stem: str
    options: list[str] = Field(min_length=4, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    explanation: str
    source_excerpt: str
    generation_notes: str = ""


class QuizDraft(BaseModel):
    questions: list[GeneratedQuestionDraft] = Field(min_length=10, max_length=10)


def has_quiz_generation_api_key() -> bool:
    return bool(os.getenv("OPENAI_API_KEY"))


def _normalize_text(value: str) -> str:
    text = sanitize_display_text(value)
    text = re.sub(r"\s+", " ", text).strip()
    return text.strip(" .,:;")


def _compact_option_text(value: str, *, max_words: int = 16, max_chars: int = 110) -> str:
    text = _normalize_text(value)
    if not text:
        return text

    # Prefer trimming at natural clause boundaries so compacted options still read like authored answers, not arbitrary truncation.
    words = text.split()
    if len(words) <= max_words and len(text) <= max_chars:
        return text

    split_patterns = (
        r";\s+",
        r"\.\s+",
        r",\s+while\s+",
        r",\s+but\s+",
        r",\s+because\s+",
        r",\s+which\s+",
        r",\s+that\s+",
        r",\s+",
    )
    for pattern in split_patterns:
        head = re.split(pattern, text, maxsplit=1, flags=re.IGNORECASE)[0].strip(" ,;:")
        if 3 <= len(head.split()) <= max_words and len(head) <= max_chars:
            return head

    compacted = " ".join(words[:max_words]).strip(" ,;:")
    if len(words) > max_words:
        compacted = f"{compacted}..."
    return compacted


def _normalize_question_draft(draft: QuizDraft) -> QuizDraft:
    normalized_questions: list[GeneratedQuestionDraft] = []
    for question in draft.questions:
        normalized_questions.append(
            GeneratedQuestionDraft(
                competency=question.competency,
                stem=_normalize_text(question.stem),
                options=[_compact_option_text(option) for option in question.options],
                correct_index=question.correct_index,
                explanation=_normalize_text(question.explanation),
                source_excerpt=_normalize_text(question.source_excerpt),
                generation_notes=_normalize_text(question.generation_notes),
            )
        )
    return QuizDraft(questions=normalized_questions)


def _contains_markup_artifacts(value: str) -> bool:
    return any(re.search(pattern, value, flags=re.IGNORECASE) for pattern in MARKUP_ARTIFACT_PATTERNS)


def _split_sentences(value: str) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", value))
    return [_normalize_text(sentence) for sentence in sentences if len(_normalize_text(sentence)) >= 30]


def _keywords(value: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9']+", value.lower())
    stopwords = {
        "the", "and", "for", "that", "this", "with", "from", "into", "when", "what", "where", "which", "will",
        "have", "also", "they", "their", "them", "your", "you", "about", "than", "then", "does", "make", "made",
        "using", "used", "into", "just", "only", "more", "most", "over", "under", "each", "because", "should",
        "could", "would", "there", "these", "those", "while", "such", "through", "must", "before", "after",
    }
    unique_tokens: list[str] = []
    for token in tokens:
        if len(token) <= 2 or token in stopwords or token.isdigit():
            continue
        if token not in unique_tokens:
            unique_tokens.append(token)
    return unique_tokens


def _contains_any(value: str, keywords: tuple[str, ...]) -> bool:
    lowered = value.lower()
    return any(keyword in lowered for keyword in keywords)


def _trim_excerpt(value: str, *, max_chars: int = 220) -> str:
    excerpt = _normalize_text(value)
    if len(excerpt) <= max_chars:
        return excerpt
    return f"{excerpt[: max_chars - 3].rstrip(' ,;:')}..."


def _build_context_blocks(body_markdown: str, *, title: str) -> list[tuple[str, list[str]]]:
    # Partition the source by heading so later concept extraction can preserve a light notion of topic context.
    blocks: list[tuple[str, list[str]]] = []
    current_context = title
    current_fragments: list[str] = []

    for raw_line in body_markdown.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue

        if re.match(r"^#{1,6}\s+", stripped):
            if current_fragments:
                blocks.append((current_context, current_fragments))
            current_context = re.sub(r"^#{1,6}\s+", "", stripped).strip()
            current_fragments = []
            continue

        candidate = stripped[2:].strip() if stripped.startswith("* ") else stripped
        if len(candidate) < 25:
            continue
        current_fragments.extend(_split_sentences(candidate))

    if current_fragments:
        blocks.append((current_context, current_fragments))

    return blocks


def extract_concept_cards(*, title: str, body_markdown: str, body_text: str) -> list[ConceptCard]:
    blocks = _build_context_blocks(body_markdown, title=title)
    if not blocks:
        # Fall back to raw body text so lightly structured sources can still generate quiz material.
        fallback_sentences = _split_sentences(body_text)
        if not fallback_sentences:
            raise QuizGenerationError(f"Unable to extract concept cards for {title}.")
        blocks = [(title, fallback_sentences)]

    global_risks = [
        fragment
        for _, fragments in blocks
        for fragment in fragments
        if _contains_any(fragment, ("risk", "scam", "fraud", "attack", "verify", "protect", "warning", "loss", "unsafe", "security"))
    ]
    global_misconceptions = [
        fragment
        for _, fragments in blocks
        for fragment in fragments
        if _contains_any(fragment, ("not ", "does not", "doesn't", "isn't", "avoid", "instead of", "rather than", "misconception", "myth"))
    ]
    global_scenarios = [
        fragment
        for _, fragments in blocks
        for fragment in fragments
        if _contains_any(fragment, ("if ", "when ", "before ", "after ", "example", "for example", "user", "learner", "participants"))
    ]

    cards: list[ConceptCard] = []
    for context, fragments in blocks:
        if not fragments:
            continue

        # Each card intentionally mixes one concept, mechanism, risk, misconception, and scenario anchor to diversify prompt evidence.
        concept = next(
            (
                fragment
                for fragment in fragments
                if _contains_any(fragment, (" is ", " are ", " refers to ", " means ", " lets ", " allows "))
            ),
            fragments[0],
        )
        mechanism = next(
            (
                fragment
                for fragment in fragments
                if _contains_any(fragment, ("how", "works", "process", "step", "uses", "through", "because", "so that"))
            ),
            fragments[min(1, len(fragments) - 1)],
        )
        risk = next(
            (
                fragment
                for fragment in fragments
                if _contains_any(fragment, ("risk", "scam", "fraud", "attack", "verify", "protect", "warning", "loss", "security"))
            ),
            global_risks[0] if global_risks else fragments[0],
        )
        misconception = next(
            (
                fragment
                for fragment in fragments
                if _contains_any(fragment, ("not ", "does not", "doesn't", "isn't", "avoid", "instead of", "rather than", "misconception", "myth"))
            ),
            global_misconceptions[0] if global_misconceptions else fragments[-1],
        )
        scenario = next(
            (
                fragment
                for fragment in fragments
                if _contains_any(fragment, ("if ", "when ", "before ", "after ", "example", "for example", "user", "learner", "participants"))
            ),
            global_scenarios[0] if global_scenarios else fragments[-1],
        )
        source_excerpt = next(
            (
                fragment
                for fragment in fragments
                if len(_keywords(fragment)) >= 5
            ),
            fragments[0],
        )
        cards.append(
            ConceptCard(
                context=_normalize_text(context) or title,
                concept=_trim_excerpt(concept),
                mechanism=_trim_excerpt(mechanism),
                risk=_trim_excerpt(risk),
                misconception=_trim_excerpt(misconception),
                scenario=_trim_excerpt(scenario),
                source_excerpt=_trim_excerpt(source_excerpt),
            )
        )

    deduped: list[ConceptCard] = []
    seen_excerpts: set[str] = set()
    for card in cards:
        # Deduplicate on excerpt so the prompt budget covers more of the source instead of repeating near-identical evidence.
        excerpt_key = card.source_excerpt.lower()
        if excerpt_key in seen_excerpts:
            continue
        seen_excerpts.add(excerpt_key)
        deduped.append(card)
        if len(deduped) == CARD_LIMIT:
            break

    if not deduped:
        raise QuizGenerationError(f"Unable to extract usable concept cards for {title}.")
    return deduped


def _is_unsupported_tuning_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "unknown parameter" in message
        or "unsupported parameter" in message
        or "extra inputs are not permitted" in message
        or "invalid field" in message
    )


def _quiz_generation_model() -> str:
    return getattr(settings, "QUIZ_GENERATION_MODEL", "gpt-5-mini")


def _quiz_generation_max_output_tokens() -> int:
    return int(getattr(settings, "QUIZ_GENERATION_MAX_OUTPUT_TOKENS", 4200))


def _quiz_generation_reasoning_effort() -> str:
    return getattr(settings, "QUIZ_GENERATION_REASONING_EFFORT", "low")


def _build_prompt_payload(*, title: str, cards: list[ConceptCard], revision_feedback: list[str] | None) -> str:
    # Send a structured JSON prompt so retries can feed validation feedback back into the same schema cleanly.
    payload = {
        "unit_title": title,
        "competency_slots": [
            {
                "competency": competency.value,
                "intent": COMPETENCY_PROMPTS[competency],
            }
            for competency in COMPETENCY_SLOTS
        ],
        "concept_cards": [
            {
                "context": card.context,
                "concept": card.concept,
                "mechanism": card.mechanism,
                "risk": card.risk,
                "misconception": card.misconception,
                "scenario": card.scenario,
                "source_excerpt": card.source_excerpt,
            }
            for card in cards
        ],
        "requirements": [
            "Return exactly ten questions in the same order as the competency slots.",
            "Each question must have exactly four options and exactly one correct answer.",
            "Use only the provided concept cards and do not add outside facts.",
            "Write high-quality distractors that are plausible and closely related to the correct answer.",
            "Do not write sentence-completion questions or copy source sentences with light paraphrasing.",
            "Explanations must teach why the correct option is right and why the main distractors are wrong.",
            "Keep options parallel in style and length.",
            "Keep each option concise, ideally under sixteen words, and avoid long multi-clause sentences.",
        ],
        "revision_feedback": revision_feedback or [],
    }
    return json.dumps(payload, ensure_ascii=True)


def _extract_parsed_quiz_draft(response: object) -> QuizDraft:
    output_items = getattr(response, "output", None)
    if isinstance(output_items, list):
        for item in output_items:
            content_items = getattr(item, "content", None)
            if not isinstance(content_items, list):
                continue
            for content_item in content_items:
                parsed = getattr(content_item, "parsed", None)
                if isinstance(parsed, QuizDraft):
                    return parsed

    output_text = getattr(response, "output_text", "")
    if isinstance(output_text, str) and output_text.strip():
        try:
            return QuizDraft.model_validate_json(output_text)
        except ValidationError as exc:
            raise QuizGenerationError("Quiz generation returned invalid structured JSON.") from exc

    raise QuizGenerationError("Quiz generation returned no parseable structured output.")


def _request_quiz_draft(*, title: str, cards: list[ConceptCard], revision_feedback: list[str] | None = None) -> QuizDraft:
    if not has_quiz_generation_api_key():
        raise QuizGenerationError("OPENAI_API_KEY is required to regenerate shared quiz content.")

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    request: dict[str, object] = {
        "model": _quiz_generation_model(),
        "input": [
            {
                "role": "system",
                "content": (
                    "You are an assessment designer for a crypto education site. "
                    "Generate one publishable multiple-choice quiz per unit. "
                    "The quiz is shared across all learners, so every question must be clear, defensible, and stable. "
                    "Do not use sentence completion, quote lifting, or generic distractors."
                ),
            },
            {
                "role": "user",
                "content": _build_prompt_payload(title=title, cards=cards, revision_feedback=revision_feedback),
            },
        ],
        "text_format": QuizDraft,
        "max_output_tokens": _quiz_generation_max_output_tokens(),
    }
    reasoning_effort = _quiz_generation_reasoning_effort()
    if reasoning_effort:
        request["reasoning"] = {"effort": reasoning_effort}

    try:
        response = client.responses.parse(**request)
    except Exception as exc:  # noqa: BLE001
        # Older/newer model variants may reject tuning fields, so retry once without them before failing the generation run.
        if not _is_unsupported_tuning_error(exc):
            raise QuizGenerationError("OpenAI quiz generation request failed.") from exc
        request.pop("reasoning", None)
        try:
            response = client.responses.parse(**request)
        except Exception as retry_exc:  # noqa: BLE001
            raise QuizGenerationError("OpenAI quiz generation request failed.") from retry_exc

    return _extract_parsed_quiz_draft(response)


def _normalized_overlap(candidate: str, source: str) -> float:
    candidate_tokens = set(_keywords(candidate))
    source_tokens = set(_keywords(source))
    if not candidate_tokens or not source_tokens:
        return 0.0
    return len(candidate_tokens & source_tokens) / max(1, len(candidate_tokens))


def _validate_source_excerpt(source_excerpt: str, body_text: str) -> bool:
    excerpt_tokens = _keywords(source_excerpt)
    body_lower = body_text.lower()
    matches = sum(1 for token in excerpt_tokens[:6] if token in body_lower)
    return matches >= min(3, max(1, len(excerpt_tokens[:6])))


def validate_quiz_draft(*, draft: QuizDraft, body_text: str) -> list[str]:
    # Apply product-level quality gates before anything is publishable, because these quizzes are shared across all learners.
    issues: list[str] = []

    if [question.competency for question in draft.questions] != list(COMPETENCY_SLOTS):
        issues.append("Questions must follow the fixed ten-slot competency order exactly once.")

    seen_stems: set[str] = set()
    excerpt_counts: dict[str, int] = {}

    for index, question in enumerate(draft.questions, start=1):
        normalized_stem = _normalize_text(question.stem).lower()
        if normalized_stem in seen_stems:
            issues.append(f"Question {index} reuses a previous stem.")
        seen_stems.add(normalized_stem)

        for pattern in QUESTION_BAN_PATTERNS:
            if re.search(pattern, question.stem, flags=re.IGNORECASE):
                issues.append(f"Question {index} uses a banned low-quality prompt pattern.")
                break

        candidate_fields = (
            ("stem", question.stem),
            ("explanation", question.explanation),
            ("source excerpt", question.source_excerpt),
            *((f"option {option_index + 1}", option) for option_index, option in enumerate(question.options)),
        )
        for field_name, field_value in candidate_fields:
            if _contains_markup_artifacts(field_value):
                issues.append(f"Question {index} contains source markup artifacts in the {field_name}.")
                break

        if len(question.options) != 4 or len({_normalize_text(option).lower() for option in question.options}) != 4:
            issues.append(f"Question {index} must contain four distinct options.")

        if not 0 <= question.correct_index < len(question.options):
            issues.append(f"Question {index} has an invalid correct answer index.")
            continue

        correct_option = question.options[question.correct_index]
        incorrect_options = [
            option
            for option_index, option in enumerate(question.options)
            if option_index != question.correct_index
        ]
        correct_word_count = max(1, len(_normalize_text(correct_option).split()))
        average_incorrect_word_count = max(
            1.0,
            sum(max(1, len(_normalize_text(option).split())) for option in incorrect_options) / len(incorrect_options),
        )
        if correct_word_count > average_incorrect_word_count * 1.8 or correct_word_count < average_incorrect_word_count * 0.55:
            issues.append(f"Question {index} has a suspicious option-length imbalance.")

        for option in question.options:
            lowered_option = option.lower()
            if any(pattern in lowered_option for pattern in GENERIC_DISTRACTOR_PATTERNS):
                issues.append(f"Question {index} contains a generic distractor instead of a source-adjacent wrong answer.")
                break

        explanation = _normalize_text(question.explanation)
        source_excerpt = _normalize_text(question.source_excerpt)
        if not explanation:
            issues.append(f"Question {index} is missing an explanation.")
        if explanation and explanation.lower() == source_excerpt.lower():
            issues.append(f"Question {index} explanation just repeats the source excerpt.")
        if source_excerpt.lower() in explanation.lower() and len(explanation.split()) <= len(source_excerpt.split()) + 4:
            issues.append(f"Question {index} explanation is too close to the source wording.")
        if not _validate_source_excerpt(source_excerpt, body_text):
            issues.append(f"Question {index} cites a source excerpt that is not clearly grounded in the unit text.")

        excerpt_key = source_excerpt.lower()
        excerpt_counts[excerpt_key] = excerpt_counts.get(excerpt_key, 0) + 1
        if excerpt_counts[excerpt_key] > 2:
            issues.append(f"Question {index} overuses the same source excerpt instead of covering more of the unit.")

        if _normalized_overlap(correct_option, body_text) < 0.25:
            issues.append(f"Question {index} correct option does not appear grounded enough in the unit language.")

    if len({question.competency for question in draft.questions}) < 7:
        issues.append("The draft does not cover enough distinct competencies.")
    if len(excerpt_counts) < 7:
        issues.append("The draft does not cover enough distinct source anchors.")

    return issues


def _build_catalog_question(
    *,
    unit_external_id: str,
    question_number: int,
    question: GeneratedQuestionDraft,
) -> dict[str, Any]:
    external_id = f"{unit_external_id}-q{question_number:02d}"
    options: list[dict[str, Any]] = []
    for option_index, option in enumerate(question.options, start=1):
        options.append(
            {
                "external_id": f"{external_id}-o{option_index:02d}",
                "text": _normalize_text(option),
                "is_correct": option_index - 1 == question.correct_index,
                "is_active": True,
            }
        )

    return {
        "external_id": external_id,
        "text": _normalize_text(question.stem),
        "question_type": "MCQ",
        "marks": 1,
        "explanation": _normalize_text(question.explanation),
        "is_active": True,
        "options": options,
        "competency": question.competency.value,
        "source_excerpt": _normalize_text(question.source_excerpt),
        "generation_notes": _normalize_text(question.generation_notes),
    }


def generate_quiz_questions(*, unit_external_id: str, title: str, body_markdown: str, body_text: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    cards = extract_concept_cards(title=title, body_markdown=body_markdown, body_text=body_text)
    revision_feedback: list[str] | None = None
    validation_issues: list[str] = []

    for attempt_number in range(1, 3):
        # Run at most one revision pass: first attempt generates freely, second attempt gets the validation failures as feedback.
        try:
            draft = _request_quiz_draft(title=title, cards=cards, revision_feedback=revision_feedback)
        except QuizGenerationError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise QuizGenerationError("Quiz generation request did not complete successfully.") from exc
        draft = _normalize_question_draft(draft)
        validation_issues = validate_quiz_draft(draft=draft, body_text=body_text)
        if not validation_issues:
            questions = [
                _build_catalog_question(
                    unit_external_id=unit_external_id,
                    question_number=index,
                    question=question,
                )
                for index, question in enumerate(draft.questions, start=1)
            ]
            questions = rebalance_quiz_questions(quiz_external_id=unit_external_id, questions=questions)
            return (
                questions,
                {
                    "strategy": "shared_llm_generation_v1",
                    "model": _quiz_generation_model(),
                    "attempts": attempt_number,
                    "concept_card_count": len(cards),
                    "quality_checks": [
                        "fixed_ten_question_structure",
                        "exactly_one_correct_option_per_question",
                        "generic_distractors_blocked",
                        "sentence_completion_blocked",
                        "source_excerpt_grounding_required",
                        "ten_fixed_competency_slots",
                        "answer_position_balanced",
                    ],
                },
            )
        revision_feedback = validation_issues

    raise QuizGenerationError(
        "Quiz generation failed quality checks after two attempts: "
        + "; ".join(validation_issues[:6])
    )
